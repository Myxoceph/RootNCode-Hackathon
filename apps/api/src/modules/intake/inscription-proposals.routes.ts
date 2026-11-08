import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AssetIdSchema,
  CONTRACT_VERSION,
  INTAKE_UPLOAD_MAX_BYTES,
  INTAKE_UPLOAD_TYPES,
  INSCRIPTION_PROPOSALS_PER_HOUR,
  InscriptionDraftSchema,
  InscriptionProposalListResponseSchema,
  InscriptionProposalQuerySchema,
  InscriptionProposalResponseSchema,
  InscriptionProposalSchema,
  type InscriptionDraft,
  type InscriptionProposal,
  type IntakeDraftMedia,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { hedge } from "../../lib/hedge.ts";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import type { MediaStore } from "../admin/media-store.ts";
import { InvalidPhotoError, processPhoto } from "../admin/photo-process.ts";
import { requireAccount } from "../assistant/assistant.routes.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { VisionError, type VisionClient } from "../vision/vision.client.ts";

/**
 * Kitabe Gönüllüleri (docs/veri-dongusu.md H7): a visitor photographs an inscription on an asset
 * that is not in the app yet. It waits in the review queue (`intake_draft`, kind `inscription`) for an
 * expert, who reads it from the photo. Once approved, the data pipeline adds it to the asset
 * (data/pipeline/publish.py), and Taşın Dili can scan it.
 *
 * **The model does not read the inscription.** Tried on the dataset's own inscription photos, the vision
 * model (qwen3-vl-30b) made up a fluent text each time (another language, another content) with a
 * confidence of 0.4-0.6, and called Ottoman Turkish inscriptions Arabic: it would mislead the expert
 * more than an empty field. So the model only sorts the photo for the expert (data/pipeline/prompts/
 * inscription-read.md): is there an inscription, in which alphabet, how many lines, is it legible, what
 * is in the way, would it do for Taşın Dili. Its answer goes to the expert as hints, never into the
 * record: language, script, reading and translations are the expert's, so a draft cannot be approved
 * as it is.
 *
 * A visitor's photo is never lost to the model: when the model cannot be reached the draft goes in all
 * the same.
 *
 * Request and response shapes are the contract's (`@vagabonds/contracts`, intake.schema.ts).
 */

// ── Limits ────────────────────────────────────────────────────────────────────────────────────

/** Proposals one account may send in an hour (plan H7): each is a photo to keep and a model call. */
export const PROPOSALS_PER_HOUR = INSCRIPTION_PROPOSALS_PER_HOUR;
/** A look takes 2 to 8 s; a second call joins one still out at 12 s. The app waits up to 45 s. */
export const TRIAGE_HEDGE_MS = [0, 12_000];
export const TRIAGE_DEADLINE_MS = 35_000;
/** A short JSON object: more is a model running on. */
const TRIAGE_MAX_TOKENS = 400;
/** The prompt file's own name; its `version:` line goes into the draft. */
const PROMPT_FILE = "data/pipeline/prompts/inscription-read.md";
const CONTENT_TYPE = { webp: "image/webp", jpg: "image/jpeg" } as const;
const IdParamsSchema = z.object({ id: AssetIdSchema });

// ── The model's answer ────────────────────────────────────────────────────────────────────────

const AnswerSchema = z.object({ hasInscription: z.unknown() }).catchall(z.unknown());
const AlphabetSchema = z.enum(["arabic", "latin", "greek", "armenian", "other"]);
type Alphabet = z.infer<typeof AlphabetSchema>;
const ALPHABET_TR: Record<Alphabet, string> = { arabic: "Arap harfli", latin: "Latin harfli", greek: "Yunan harfli", armenian: "Ermeni harfli", other: "başka bir alfabe" };

/**
 * How well an expert could read the photo: `clear` all of it, `partly` most of it with some letters hard
 * to make out, `unreadable` too blurred, far or covered. Three steps: a yes or no called a slightly
 * shaded, slightly angled but readable photo illegible.
 */
const LegibilitySchema = z.enum(["clear", "partly", "unreadable"]);
type Legibility = z.infer<typeof LegibilitySchema>;

/** The model's look at the photo, for the expert. Never a reading. */
export interface Triage {
  hasInscription: boolean;
  alphabet: Alphabet | null;
  lines: number | null;
  legibility: Legibility | null;
  /** The photo is of a screen or a print, not of the stone: maybe not taken on site, maybe someone else's. */
  rephotographed: boolean;
  problems: string[];
  arTarget: boolean;
  confidence: number | null;
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

/** The first JSON object in the model's answer (it may wrap it in a code fence or a sentence). */
function firstObject(answer: string): unknown {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The model's answer, each field kept only when it is what was asked; null when it is not JSON. */
export function toTriage(answer: string): Triage | null {
  const parsed = AnswerSchema.safeParse(firstObject(answer));
  if (!parsed.success) return null;
  const raw = parsed.data;
  const alphabet = AlphabetSchema.safeParse(raw["alphabet"]);
  const hasInscription = raw.hasInscription === true;
  const legibility = LegibilitySchema.safeParse(raw["legibility"]);
  const read = hasInscription && legibility.success ? legibility.data : null;
  const lines = raw["lines"];
  const confidence = raw["confidence"];
  return {
    hasInscription,
    alphabet: hasInscription && alphabet.success ? alphabet.data : null,
    lines: typeof lines === "number" && Number.isInteger(lines) && lines > 0 && lines < 200 ? lines : null,
    legibility: read,
    rephotographed: raw["rephotographed"] === true,
    problems: Array.isArray(raw["problems"])
      ? raw["problems"].map((item) => text(item, 200)).filter((item): item is string => item !== null).slice(0, 10)
      : [],
    // The camera learns the target from this photo: only a clear one, of the stone itself.
    arTarget: read === "clear" && raw["rephotographed"] !== true && raw["arTarget"] === true,
    confidence: typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : null,
  };
}

/**
 * The draft the expert completes: only the visitor's location. Nothing of the model's goes into it
 * (see above); its hints are in the draft's warnings.
 */
export function toDraft(location: string | null): InscriptionDraft {
  return InscriptionDraftSchema.parse({
    language: null,
    script: null,
    transliteration: null,
    translationTr: null,
    translationEn: null,
    uncertain: [],
    location,
  });
}

/**
 * What the expert is told beside the draft. There is always an error (no reading yet): the review
 * route then approves it only with the record filled in, so nothing is approved unread.
 */
export function triageChecks(triage: Triage | null, location: string | null, known: number, failure: string | null) {
  const errors = ["Kitabeyi uzman okur: fotoğraftan dilini, okunuşunu ve Türkçe çevirisini yazın (language, transliteration, translationTr)."];
  const warnings: string[] = [];
  const missing = ["/language", "/script", "/transliteration", "/translationTr", "/translationEn"];
  if (failure) warnings.push(`Model fotoğrafa bakamadı (${failure}).`);
  if (triage) {
    if (!triage.hasInscription) errors.push("Model bu fotoğrafta kitabe görmedi: reddetmeden önce fotoğrafa bakın.");
    else {
      const guess = [triage.alphabet && ALPHABET_TR[triage.alphabet], triage.lines && `${triage.lines} satır`].filter(Boolean);
      if (guess.length > 0) warnings.push(`Modelin gördüğü (doğrulayın): ${guess.join(", ")}.`);
      if (triage.legibility === "partly") warnings.push("Model yazının bir kısmını zor seçti: o kısmı fotoğrafta dikkatle okuyun.");
      if (triage.legibility === "unreadable") warnings.push("Model yazıyı okunamayacak durumda buldu (çok bulanık, uzak ya da büyük kısmı kapalı): yeni fotoğraf gerekebilir.");
    }
    if (triage.rephotographed) {
      warnings.push("Fotoğraf bir ekrandan ya da basılı bir görselden çekilmiş görünüyor: sahada çekilmemiş, başkasına ait olabilir.");
    }
    for (const problem of triage.problems) warnings.push(`Model: ${problem}`);
    if (triage.confidence !== null && triage.confidence < 0.5) warnings.push(`Modelin güveni düşük (${triage.confidence.toFixed(2)}).`);
  }
  if (location === null) missing.push("/location");
  if (known > 0) warnings.push(`Bu eserde zaten ${known} kitabe var: aynı kitabe olmadığından emin olun.`);
  return { errors, warnings, missing };
}

/** The `version:` line of the prompt and the prompt itself, without it. */
export function parsePrompt(file: string): { version: string; body: string } {
  const [first, ...rest] = file.split("\n");
  const match = /^version:\s*(\S+)/.exec(first ?? "");
  if (!match) throw new Error(`${PROMPT_FILE} has no version: line`);
  return { version: match[1]!, body: rest.join("\n").trim() };
}

// ── Database ──────────────────────────────────────────────────────────────────────────────────

type DraftRow = Prisma.intake_draftGetPayload<object> & { assetName: string };

/** intake_draft has no relation to asset (a book's draft names an asset that does not exist yet). */
async function withNames(prisma: PrismaClient, rows: Prisma.intake_draftGetPayload<object>[]): Promise<DraftRow[]> {
  const ids = [...new Set(rows.map((row) => row.asset_id))];
  const assets = await prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, name_tr: true } });
  const names = new Map(assets.map((asset) => [asset.id, asset.name_tr]));
  return rows.map((row) => ({ ...row, assetName: names.get(row.asset_id) ?? row.asset_id }));
}

function createProposalRepository(prisma: PrismaClient) {
  return {
    asset(id: string) {
      return prisma.asset.findUnique({
        where: { id },
        select: { id: true, name_tr: true, type_code: true, city_code: true, _count: { select: { inscription: true } } },
      });
    },

    sentInLastHour(userId: string) {
      return prisma.intake_draft.count({ where: { kind: "inscription", created_by: userId, created_at: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
    },

    async create(data: Prisma.intake_draftUncheckedCreateInput) {
      return (await withNames(prisma, [await prisma.intake_draft.create({ data })]))[0]!;
    },

    async mine(userId: string) {
      const rows = await prisma.intake_draft.findMany({ where: { kind: "inscription", created_by: userId }, orderBy: { created_at: "desc" }, take: 100 });
      return withNames(prisma, rows);
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────────────────────

export interface InscriptionProposalRoutesOptions {
  prisma: PrismaClient;
  community: CommunityRepository;
  /** Where the photo goes (the local store with INTAKE_LOCAL_ONLY); without one the route answers 503. */
  store: MediaStore | null;
  /** The vision model and its name (for the draft's `ai`); without one the draft goes in empty, for the expert to read. */
  vision: VisionClient | null;
  visionModel: string;
  /** The repo's root: the prompt file is read from under it. */
  root: string;
  /** Builds a photo's URL from its key. */
  mediaUrl: (key: string) => string;
}

export const inscriptionProposalRoutes: FastifyPluginAsync<InscriptionProposalRoutesOptions> = async (
  app,
  { prisma, community, store, vision, visionModel, root, mediaUrl },
) => {
  const repository = createProposalRepository(prisma);
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const bearer = [{ bearerAuth: [] }];
  const promptPath = resolve(root, PROMPT_FILE);
  /** Proposals of each account now being processed (one API process serves them). */
  const inFlight = new Map<string, number>();

  function toProposal(row: DraftRow): InscriptionProposal {
    const media = Array.isArray(row.media) ? (row.media as IntakeDraftMedia[]) : [];
    return InscriptionProposalSchema.parse({
      id: row.id,
      assetId: row.asset_id,
      assetName: row.assetName,
      status: row.status,
      published: row.applied_at !== null,
      reviewNote: row.status === "rejected" ? row.review_note : null,
      photo: media[0] ? mediaUrl(media[0].key) : "",
      createdAt: row.created_at.toISOString(),
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    });
  }

  app.addContentTypeParser([...INTAKE_UPLOAD_TYPES], { parseAs: "buffer", bodyLimit: INTAKE_UPLOAD_MAX_BYTES }, (_request, body, done) => done(null, body));

  app.post("/assets/:id/inscription-proposals", {
    bodyLimit: INTAKE_UPLOAD_MAX_BYTES,
    // Before the body is read: only an account may send 15 MB.
    onRequest: async (request) => {
      await requireAccount(request, community);
    },
    schema: {
      tags: ["community"],
      summary: "Kitabe Gönüllüleri (yalnızca hesapla): eserde listede olmayan bir kitabenin fotoğrafını gönder; uzman okuyup onaylayınca eklenir",
      description: `Gövde fotoğrafın kendisi (${INTAKE_UPLOAD_TYPES.join(", ")}), en çok ${INTAKE_UPLOAD_MAX_BYTES / 1024 / 1024} MB. Saatte en çok ${PROPOSALS_PER_HOUR}. Fotoğrafın konum bilgisi (EXIF) silinir. Ziyaretçi yalnızca durumunu görür.`,
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      querystring: toOpenApiSchema(InscriptionProposalQuerySchema, "input"),
      response: {
        201: toOpenApiSchema(InscriptionProposalResponseSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        413: errorSchema,
        415: errorSchema,
        429: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply) => {
    const user = await requireAccount(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const query = parseWith(InscriptionProposalQuerySchema, request.query, "INVALID_QUERY");
    if (store === null) throw new HttpError(503, "MEDIA_UPLOAD_OFF", "Photo uploads are not set up on this server");
    const mime = (request.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!Buffer.isBuffer(request.body) || !(INTAKE_UPLOAD_TYPES as readonly string[]).includes(mime)) {
      throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", `Send the photo as ${INTAKE_UPLOAD_TYPES.join(", ")}`);
    }
    const asset = await repository.asset(id);
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", `No asset with id "${id}"`);
    // Those still being processed count too: the row is written only after the model's answer. Reserved
    // before the first await that could let another request of this account through.
    const reserved = inFlight.get(user.id) ?? 0;
    inFlight.set(user.id, reserved + 1);
    const done = () => {
      const left = (inFlight.get(user.id) ?? 1) - 1;
      if (left > 0) inFlight.set(user.id, left);
      else inFlight.delete(user.id);
    };
    try {
      if ((await repository.sentInLastHour(user.id)) + reserved >= PROPOSALS_PER_HOUR) {
        throw new HttpError(429, "TOO_MANY_PROPOSALS", `At most ${PROPOSALS_PER_HOUR} inscriptions an hour; try again later`);
      }

      let photo;
      try {
        photo = await processPhoto(request.body);
      } catch (error) {
        if (error instanceof InvalidPhotoError) throw new HttpError(400, "INVALID_IMAGE", error.message);
        throw error;
      }
      const draftId = randomUUID();
      // The processed photo only: the original's EXIF may hold where the visitor stood.
      const keys = photo.variants.map((v) => `intake/${draftId}/${v.width}.${v.format}`);
      const jpgs = photo.variants.filter((v) => v.format === "jpg");
      const shown = jpgs.find((v) => v.width === 1280) ?? jpgs.at(-1)!;

      let row: DraftRow | null = null;
      try {
        // Every write finished before the cleanup below, so none lands after it.
        const written = await Promise.allSettled(photo.variants.map((v, i) => store.put(keys[i]!, v.bytes, CONTENT_TYPE[v.format])));
        const failed = written.find((one) => one.status === "rejected");
        if (failed) throw failed.reason;
        const location = query.location ?? null;
        let triage: Triage | null = null;
        let failure: string | null = null;
        let version = "unknown";
        const started = Date.now();
        // The prompt is not the visitor's concern: without it the draft goes in unsorted, like without the model.
        const prompt = vision
          ? await readFile(promptPath, "utf8").then(parsePrompt).catch((error: unknown) => {
              request.log.error({ err: error, promptPath }, "Inscription prompt unreadable; the draft goes in without triage");
              return null;
            })
          : null;
        if (vision && prompt) {
          try {
            version = prompt.version;
            const system = prompt.body.replace("{name}", asset.name_tr).replace("{type}", asset.type_code).replace("{city}", asset.city_code);
            const answer = await hedge(
              (signal) => vision.look({ image: shown.bytes, type: "image/jpeg", system, question: "Bu fotoğrafı uzman için değerlendir.", signal, maxTokens: TRIAGE_MAX_TOKENS }),
              { starts: TRIAGE_HEDGE_MS, deadlineMs: TRIAGE_DEADLINE_MS, retryable: (err) => err instanceof VisionError, timedOut: () => new VisionError("Vision call timed out") },
            );
            triage = toTriage(answer);
            if (!triage) failure = "cevabı JSON değildi";
          } catch (error) {
            if (!(error instanceof VisionError)) throw error;
            request.log.warn({ reason: error.message }, "Inscription triage failed; the draft goes in without it");
            failure = "model şu an yanıt vermiyor";
          }
        } else {
          failure = vision ? "talimat dosyası okunamadı" : "görüntü modeli tanımlı değil";
        }
        const draft = toDraft(location);
        const media: IntakeDraftMedia = {
          key: `intake/${draftId}/${shown.width}.jpg`,
          width: photo.width,
          height: photo.height,
          subject: "inscription",
          subjectConfidence: null,
          alt: null,
          caption: null,
          pdfPage: null,
          arTargetCandidate: triage?.arTarget ?? false,
        };
        row = await repository.create({
          id: draftId,
          kind: "inscription",
          asset_id: asset.id,
          record: draft as unknown as Prisma.InputJsonValue,
          media: [media] as unknown as Prisma.InputJsonValue,
          validation: triageChecks(triage, location, asset._count.inscription, failure) as unknown as Prisma.InputJsonValue,
          ai: vision && prompt ? { model: visionModel, promptVersion: version, confidence: triage?.confidence ?? null, repaired: false, ms: Date.now() - started } : Prisma.DbNull,
          note: query.note ?? null,
          created_by: user.id,
        });
        reply.code(201);
        return InscriptionProposalResponseSchema.parse({ version: CONTRACT_VERSION, proposal: toProposal(row) });
      } catch (error) {
        // A draft already saved keeps its photo: the expert still needs it.
        if (row === null) await Promise.all(keys.map((key) => store.remove(key).catch(() => {})));
        throw error;
      }
    } finally {
      done();
    }
  });

  app.get("/me/inscription-proposals", {
    schema: {
      tags: ["community"],
      summary: "Gönderdiğim kitabeler ve durumları (onay bekliyor, eklendi, reddedildi), en yenisi önce",
      security: bearer,
      response: { 200: toOpenApiSchema(InscriptionProposalListResponseSchema), 401: errorSchema, 403: errorSchema },
    },
  }, async (request, reply) => {
    const user = await requireAccount(request, community);
    reply.header("cache-control", "no-store");
    return InscriptionProposalListResponseSchema.parse({ version: CONTRACT_VERSION, items: (await repository.mine(user.id)).map(toProposal) });
  });
};

import {
  CONTRACT_VERSION,
  LangSchema,
  VOICE_AUDIO_TYPES,
  VOICE_MAX_BYTES,
  VoiceSpeechQuerySchema,
  VoiceTranscriptionResponseSchema,
  type VoiceTranscriptionResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireAccount } from "../assistant/assistant.routes.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { hedge } from "../../lib/hedge.ts";
import { sayNumbers } from "./spoken-numbers.ts";
import { VoiceError, type VoiceClient } from "./voice.client.ts";

/** Recordings and answers one client IP may send per minute: about one spoken question every few seconds. */
export const VOICE_RATE_LIMIT = { max: 20, timeWindow: 60_000 };
/**
 * When the same provider call goes out again, in ms from the first. EVREN's speech models
 * answer in under a second, but now and then hold one request for 20 s or more while the next
 * is answered at once, so a late call gets company instead of being waited for.
 */
export const VOICE_HEDGE_MS = [0, 2_500, 6_000];
/** All calls end by then: under the app's 20 s wait. */
export const VOICE_DEADLINE_MS = 17_000;

/** `hedge` with the voice provider's timings; only its failures are tried again. */
export function hedged<T>(
  call: (signal: AbortSignal) => Promise<T>,
  starts: number[] = VOICE_HEDGE_MS,
  deadlineMs = VOICE_DEADLINE_MS,
): Promise<T> {
  return hedge(call, { starts, deadlineMs, retryable: (err) => err instanceof VoiceError, timedOut: () => new VoiceError("Voice call timed out") });
}
/** Answers read aloud are kept in memory: the demo's questions, asked backstage once, play at once on stage. */
const SPEECH_CACHE_SIZE = 100;

export interface VoiceRoutesOptions {
  /** Null when no speech models are configured: both routes answer 503. */
  client: VoiceClient | null;
  community: CommunityRepository;
}

const LangQuerySchema = z.object({ lang: LangSchema.optional() });

/**
 * The answer as it should sound: the `[n]` markers and list dashes the app shows are not read,
 * and numbers are said in words (the speech model misreads digits): the record's
 * "H. 802 / M. 1399" as "Hicri sekiz yüz iki / Miladi bin üç yüz doksan dokuz".
 */
export function speechText(text: string, lang = "tr"): string {
  const plain = text
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    // "1. Ulucami" is a list item, "15. yüzyılda" an ordinal: an item starts with a capital.
    .replace(/^\s*(?:[-*•]|\d+\.(?=\s+[A-ZÇĞİÖŞÜ"“(]))\s+(.*)$/gm, (_line, item: string) =>
      /[.!?:;]$/.test(item.trim()) ? item.trim() : `${item.trim()}.`,
    )
    .replace(/\s+/g, " ")
    .trim();
  // The numbers are said in Turkish words; another language's answer keeps its digits.
  return lang === "tr" ? sayNumbers(plain) : plain;
}

/** The media type without its parameters ("audio/webm;codecs=opus" → "audio/webm"). */
const essence = (contentType: string | undefined) => (contentType ?? "").split(";")[0]!.trim().toLowerCase();

export const voiceRoutes: FastifyPluginAsync<VoiceRoutesOptions> = async (app, { client, community }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const bearer = [{ bearerAuth: [] }];
  const failures = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 429: errorSchema, 503: errorSchema };
  // Insertion order is age order, so the first key is the oldest.
  const spoken = new Map<string, Buffer>();

  // Only in this plugin: the rest of the API keeps its 16 KB JSON body limit.
  app.addContentTypeParser([...VOICE_AUDIO_TYPES], { parseAs: "buffer", bodyLimit: VOICE_MAX_BYTES }, (_request, body, done) =>
    done(null, body),
  );

  const unavailable = (err: unknown, log: { warn: (obj: object, msg: string) => void }): never => {
    if (err instanceof VoiceError) {
      log.warn({ reason: err.message }, "Voice provider failed");
      throw new HttpError(503, "VOICE_UNAVAILABLE", "Voice is not available right now");
    }
    throw err;
  };

  app.post("/voice/transcribe", {
    bodyLimit: VOICE_MAX_BYTES,
    config: { rateLimit: VOICE_RATE_LIMIT },
    schema: {
      tags: ["assistant"],
      summary: `Sesli soru (yalnızca hesapla): gövde kaydın kendisi (${VOICE_AUDIO_TYPES.join(", ")}), en çok 1 MB; metni döner, ses saklanmaz`,
      security: bearer,
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(VoiceTranscriptionResponseSchema), ...failures, 413: errorSchema, 415: errorSchema },
    },
  }, async (request, reply): Promise<VoiceTranscriptionResponse> => {
    // Recordings and their words are never logged.
    await requireAccount(request, community);
    const { lang } = parseWith(LangQuerySchema, request.query, "INVALID_QUERY");
    if (!client) throw new HttpError(503, "VOICE_UNAVAILABLE", "Voice is not configured");
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new HttpError(400, "INVALID_AUDIO", `Send the recording itself as one of ${VOICE_AUDIO_TYPES.join(", ")}`);
    }
    const audio = request.body;
    const type = essence(request.headers["content-type"]);
    const language = resolveLang(lang, request.headers["accept-language"]);
    let text: string;
    try {
      text = await hedged((signal) => client.transcribe(audio, type, language, signal));
    } catch (err) {
      return unavailable(err, request.log);
    }
    reply.header("cache-control", "no-store");
    return VoiceTranscriptionResponseSchema.parse({ version: CONTRACT_VERSION, text: text.slice(0, 1000) });
  });

  app.get("/voice/speech", {
    config: { rateLimit: VOICE_RATE_LIMIT },
    schema: {
      tags: ["assistant"],
      summary: "Cevabı sesli oku (yalnızca hesapla): `[n]` işaretleri ve liste çizgileri okunmaz; yanıt audio/mpeg",
      security: bearer,
      querystring: toOpenApiSchema(VoiceSpeechQuerySchema, "input"),
      response: { 200: { type: "string", format: "binary" }, ...failures },
    },
  }, async (request, reply) => {
    await requireAccount(request, community);
    const query = parseWith(VoiceSpeechQuerySchema, request.query, "INVALID_QUERY");
    if (!client) throw new HttpError(503, "VOICE_UNAVAILABLE", "Voice is not configured");
    // The language only decides how numbers are said: the speech model reads any language as written.
    const text = speechText(query.text, resolveLang(query.lang, request.headers["accept-language"]));
    if (!text) throw new HttpError(400, "INVALID_QUERY", "Nothing to read aloud");
    const key = text;
    let audio = spoken.get(key);
    if (!audio) {
      try {
        audio = await hedged((signal) => client.speak(text, signal));
      } catch (err) {
        return unavailable(err, request.log);
      }
      spoken.set(key, audio);
      if (spoken.size > SPEECH_CACHE_SIZE) spoken.delete(spoken.keys().next().value!);
    }
    return reply.type("audio/mpeg").header("cache-control", "private, max-age=3600").send(audio);
  });
};

import { z } from "zod";
import { SEAL_SUBJECTS } from "./achievement.schema";
import { AssetIdSchema, ContractVersionSchema } from "./asset.schema";
import { InscriptionLanguageSchema } from "./admin.schema";

/**
 * Veri Döngüsü (docs/plans/veri-dongusu.md): data that comes in to be reviewed before it is
 * published. A book PDF becomes a job (`intake_job`) that the data pipeline (data/pipeline, Python)
 * splits into drafts; a visitor's inscription photo becomes a draft of its own. Every draft waits
 * in one review queue (`intake_draft`) until a moderator approves or rejects it: nothing a model
 * writes is published on its own.
 *
 * The JSON shapes below are also what the Python worker writes into the tables' jsonb columns;
 * `npm run intake-schema -w @vagabonds/contracts` exports them as JSON Schema for it.
 */

// ── States ──────────────────────────────────────────────────────────────────────────────────

/**
 * A book's way through the pipeline: `queued` (uploaded) → `mapping` (the worker reads the layout
 * and the contents) → `needs_map` (a person checks the book map) → `map_confirmed` → `drafting`
 * (one draft per asset) → `done`. `failed` keeps the error; the worker resumes from where it was.
 */
export const IntakeJobStatusSchema = z.enum(["queued", "mapping", "needs_map", "map_confirmed", "drafting", "done", "failed"]);
export type IntakeJobStatus = z.infer<typeof IntakeJobStatusSchema>;

export const IntakeDraftStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type IntakeDraftStatus = z.infer<typeof IntakeDraftStatusSchema>;

/** `book_asset`: an asset from a book PDF · `inscription`: a visitor's inscription · `field_asset`: Saha Defteri (later). */
export const IntakeDraftKindSchema = z.enum(["book_asset", "inscription", "field_asset"]);
export type IntakeDraftKind = z.infer<typeof IntakeDraftKindSchema>;

/**
 * What a photo shows, as a model is asked to say it: the seal's parts (SEAL_SUBJECTS), a view from
 * above, or something else. The dataset's own subjects are finer (`interior_domes`…); a person
 * may write those in review.
 */
export const PHOTO_SUBJECTS = [...SEAL_SUBJECTS, "aerial", "other"] as const;
export const PhotoSubjectSchema = z.enum(PHOTO_SUBJECTS);
export type PhotoSubject = z.infer<typeof PhotoSubjectSchema>;

/** A model's certainty, 0-1. */
const ConfidenceSchema = z.number().min(0).max(1);
const PageSchema = z.int().min(1);
const PageRangeSchema = z.tuple([PageSchema, PageSchema]).refine(([from, to]) => from <= to, "range must not run backwards");
const CityCodeSchema = z.string().regex(/^[a-z]+$/, "city must be an enums.json city code");
const Timestamp = z.iso.datetime({ offset: true });

// ── Book (PDF) ──────────────────────────────────────────────────────────────────────────────

/** How the book's pages are laid out, found from its first pages. */
export const IntakeLayoutSchema = z.strictObject({
  /** Each PDF page holds two printed pages side by side. */
  spread: z.boolean(),
  /** The text's columns, left to right, by language. */
  columns: z.array(z.enum(["tr", "en"])).min(1).max(2),
  /** Printed page = PDF page × (spread ? 2 : 1) + offset, for the first page of a spread. */
  pageOffset: z.int(),
});
export type IntakeLayout = z.infer<typeof IntakeLayoutSchema>;

/** One asset in the book, as the contents and the headings give it. */
export const BookMapEntrySchema = z.strictObject({
  /** Stable within the job: the draft of this entry is found by it. */
  key: z.string().regex(/^[a-z0-9-]+$/).max(120),
  titleTr: z.string().trim().min(1).max(300),
  titleEn: z.string().trim().min(1).max(300).nullable(),
  district: z.string().trim().min(1).max(80).nullable(),
  printedPages: PageRangeSchema.nullable(),
  pdfPages: PageRangeSchema,
  /** A building of a complex (külliye) points to the complex's entry. */
  parentKey: z.string().regex(/^[a-z0-9-]+$/).max(120).nullable(),
  /** The id the draft will get (`<il>-<ilçe>-<ad>`), as proposed. */
  proposedId: AssetIdSchema.nullable(),
});
export type BookMapEntry = z.infer<typeof BookMapEntrySchema>;

export const BookMapSchema = z.array(BookMapEntrySchema).max(500);

/** `GET /admin/intake/jobs/:id`, and each row of `GET /admin/intake/jobs` */
export const IntakeJobSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("pdf"),
  status: IntakeJobStatusSchema,
  title: z.string(),
  city: CityCodeSchema,
  /** `data/sources.json` id of the book; the worker may propose one, a person confirms. */
  sourceId: z.string().nullable(),
  layout: IntakeLayoutSchema.nullable(),
  bookMap: BookMapSchema.nullable(),
  mapConfirmedAt: Timestamp.nullable(),
  progress: z.strictObject({ done: z.int().min(0), total: z.int().min(0) }),
  error: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type IntakeJob = z.infer<typeof IntakeJobSchema>;

/** `POST /admin/intake/jobs`: the body is the PDF itself; these go in the query. */
export const IntakeJobCreateQuerySchema = z.object({
  title: z.string().trim().min(2).max(300),
  city: CityCodeSchema,
  sourceId: z.string().trim().min(2).max(80).optional(),
});

/** Largest PDF accepted: a city's inventory book is ~250 pages of photos. */
export const INTAKE_PDF_MAX_BYTES = 200 * 1024 * 1024;

/** `POST /admin/intake/jobs/:id/map`: the map as a person corrected it. */
export const IntakeMapConfirmRequestSchema = z.strictObject({
  bookMap: BookMapSchema.min(1),
  sourceId: z.string().trim().min(2).max(80).optional(),
});

export const IntakeJobResponseSchema = z.strictObject({ version: ContractVersionSchema, job: IntakeJobSchema });
export const IntakeJobListResponseSchema = z.strictObject({ version: ContractVersionSchema, items: z.array(IntakeJobSchema) });

// ── Drafts ──────────────────────────────────────────────────────────────────────────────────

/** A photo of a draft: extracted from the book, or the visitor's. */
export const IntakeDraftMediaSchema = z.strictObject({
  /** Media key, as `MEDIA_BASE_URL` serves it (`assets/<id>/<media>-<sha>/1280.jpg`). */
  key: z.string().min(1).max(400),
  width: z.int().min(1),
  height: z.int().min(1),
  subject: PhotoSubjectSchema.nullable(),
  subjectConfidence: ConfidenceSchema.nullable(),
  /** Screen reader text, proposed by the model; a person checks it. */
  alt: z.string().max(600).nullable(),
  /** The book's caption under the photo. */
  caption: z.string().max(600).nullable(),
  pdfPage: PageSchema.nullable(),
  /** A candidate for Taşın Dili: a straight, readable photo of an inscription. */
  arTargetCandidate: z.boolean().default(false),
});
export type IntakeDraftMedia = z.infer<typeof IntakeDraftMediaSchema>;

/** Where in the book a field's value comes from: shown beside the field in review. */
export const IntakeSourceRefSchema = z.strictObject({
  /** JSON pointer into the draft's record, e.g. `/dating/year`. */
  field: z.string().min(1).max(200),
  pages: z.array(PageSchema).min(1).max(40),
});

/** `validate.py`'s findings on the record: errors block approval, warnings do not. */
export const IntakeValidationSchema = z.strictObject({
  errors: z.array(z.string().max(500)).max(200),
  warnings: z.array(z.string().max(500)).max(200),
});

/** Which model wrote the draft and how. */
export const IntakeAiSchema = z.strictObject({
  model: z.string().max(120),
  /** The `version:` line of the prompt file (data/pipeline/prompts). */
  promptVersion: z.string().max(40),
  confidence: ConfidenceSchema.nullable(),
  /** The first answer failed the schema and the model was asked once to fix it. */
  repaired: z.boolean(),
  ms: z.int().min(0),
});

/**
 * A visitor's inscription as the model read it: a draft for an expert, never shown as a reading
 * until approved. Words it could not read are listed, not guessed.
 */
export const InscriptionDraftSchema = z.strictObject({
  language: InscriptionLanguageSchema.nullable(),
  script: z.string().max(80).nullable(),
  transliteration: z.string().max(12000).nullable(),
  translationTr: z.string().max(12000).nullable(),
  translationEn: z.string().max(12000).nullable(),
  /** Words or lines the model was unsure of, as they appear in `transliteration`. */
  uncertain: z.array(z.string().max(200)).max(100),
  /** Where on the monument, in the visitor's words. */
  location: z.string().max(300).nullable(),
});
export type InscriptionDraft = z.infer<typeof InscriptionDraftSchema>;

/**
 * One item of the review queue. `record` is the draft itself: for `book_asset` and `field_asset`
 * a dataset record (data/schema/eser.schema.json, checked by `validate.py`, so typed loosely
 * here); for `inscription` an InscriptionDraft.
 */
export const IntakeDraftSchema = z.strictObject({
  id: z.uuid(),
  kind: IntakeDraftKindSchema,
  status: IntakeDraftStatusSchema,
  jobId: z.uuid().nullable(),
  /** The asset it adds (book, field) or adds to (inscription). */
  assetId: AssetIdSchema,
  /** The book map entry it was drafted from. */
  entryKey: z.string().nullable(),
  record: z.record(z.string(), z.unknown()),
  media: z.array(IntakeDraftMediaSchema),
  sourceRefs: z.array(IntakeSourceRefSchema),
  validation: IntakeValidationSchema,
  ai: IntakeAiSchema.nullable(),
  /** An asset already in the dataset that looks like the same one (close by, similar name). */
  duplicateOf: AssetIdSchema.nullable(),
  note: z.string().max(1000).nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  reviewedAt: Timestamp.nullable(),
  reviewNote: z.string().max(1000).nullable(),
});
export type IntakeDraft = z.infer<typeof IntakeDraftSchema>;

/** `GET /admin/intake/drafts` */
export const IntakeDraftListQuerySchema = z.object({
  status: IntakeDraftStatusSchema.default("pending"),
  kind: IntakeDraftKindSchema.optional(),
  jobId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IntakeDraftListResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  total: z.int().min(0),
  items: z.array(IntakeDraftSchema),
});

/** `POST /admin/intake/drafts/:id/review`: approve (with the record as corrected) or reject. */
export const IntakeReviewRequestSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.literal("approve"),
    /** The record as the reviewer corrected it; without it the draft's own. */
    record: z.record(z.string(), z.unknown()).optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  z.strictObject({
    decision: z.literal("reject"),
    note: z.string().trim().min(3).max(1000),
  }),
]);

export const IntakeDraftResponseSchema = z.strictObject({ version: ContractVersionSchema, draft: IntakeDraftSchema });

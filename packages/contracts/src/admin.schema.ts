import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema, DossierPlaceSchema } from "./asset.schema";
import { UserRoleSchema } from "./community.schema";

/**
 * Admin panel: users and roles, assets added from the panel, and the counts on its
 * first screen. Every route needs a moderator or admin; roles and assets need an admin.
 * The review queue itself is `GET /admin/contributions` (community.schema.ts).
 */

const CodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase code");

/** `GET /admin/summary` */
export const AdminSummaryResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  pending: z.strictObject({
    /** Tips, memories and corrections waiting for review. */
    notes: z.int().min(0),
    photos: z.int().min(0),
  }),
  users: z.strictObject({
    total: z.int().min(0),
    /** With a username and password, as opposed to anonymous visitors. */
    accounts: z.int().min(0),
    banned: z.int().min(0),
  }),
  /** Assets added from the panel, in any status. */
  panelAssets: z.int().min(0),
});

export const AdminUserSchema = z.strictObject({
  id: z.uuid(),
  nickname: z.string().min(1),
  username: z.string().min(1).nullable(),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
  bannedAt: z.iso.datetime().nullable(),
  contributions: z.int().min(0),
});

/** `GET /admin/users?q=&role=&limit=&offset=`: newest first; `q` matches nickname or username. */
export const AdminUsersResponseSchema = z.strictObject({
  total: z.int().min(0),
  limit: z.int().min(1),
  offset: z.int().min(0),
  items: z.array(AdminUserSchema),
});

/** `POST /admin/users/:id/role` (admin only; not on oneself). */
export const SetUserRoleRequestSchema = z.strictObject({ role: UserRoleSchema });

const TrText = z.string().trim().min(1);
const OptionalText = z.string().trim().min(1).nullable().optional();

const AdminAssetFields = {
  name: z.strictObject({ tr: TrText.max(120), en: OptionalText }),
  /** `asset_types` code from `GET /meta/enums`, e.g. `cami`. */
  type: CodeSchema,
  /** `cities` code, e.g. `bursa`. */
  city: CodeSchema,
  district: TrText.max(60),
  /** `eras` code; null when unknown. */
  era: CodeSchema.nullable().optional(),
  summary: z.strictObject({ tr: TrText.max(400), en: OptionalText }),
  /** The asset page's text, shown as one section titled "Tanıtım". */
  description: z.strictObject({ tr: TrText.max(5000), en: OptionalText }),
  dating: z.strictObject({ tr: TrText.max(120), en: OptionalText }).nullable().optional(),
  founder: z.string().trim().min(1).max(120).nullable().optional(),
  address: z.string().trim().min(1).max(200).nullable().optional(),
  coordinates: z
    .strictObject({ lat: z.number().min(35.5).max(42.5), lng: z.number().min(25.5).max(45) })
    .nullable()
    .optional(),
};

const AdminAssetStatusSchema = z.enum(["draft", "published"]);

/**
 * `POST /admin/assets`: a new asset from the panel. It is stored like a dataset record
 * (`meta.prepared_by: "admin:<username>"`) so it can be exported into `data/eserler` later.
 */
export const AdminAssetInputSchema = z.strictObject({
  ...AdminAssetFields,
  /** `draft` stays hidden from visitors; `published` appears in the app at once. */
  status: AdminAssetStatusSchema.default("draft"),
});

/**
 * `PATCH /admin/assets/:id`: any of the fields. Panel assets are rewritten whole; dataset assets
 * get the changed columns (and `description` replaces their first section's text) in the database
 * only, so the next `import_to_db.py` puts back what `data/eserler` says.
 */
export const AdminAssetPatchSchema = z
  .strictObject({ ...AdminAssetFields, status: AdminAssetStatusSchema })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "at least one field");

/** Where an asset comes from: added in the panel, or imported from `data/eserler`. */
export const AdminAssetOriginSchema = z.enum(["panel", "dataset"]);

export const AdminAssetSchema = z.strictObject({
  id: AssetIdSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  city: z.string().min(1),
  district: z.string().min(1),
  /** Dataset records can also be `in_review`. */
  status: z.enum(["draft", "in_review", "published"]),
  origin: AdminAssetOriginSchema.default("panel"),
  /** Username of the admin who added it; for a dataset asset, who prepared the record. */
  createdBy: z.string().min(1),
  updatedAt: z.iso.datetime(),
});


/*
 * The whole asset as the panel's editor sees it: every field the app's asset page shows, in Turkish
 * with an optional English beside it. Photos are listed to caption, order and pick a cover; adding
 * photos is not in the panel yet. Lists keep their ids, so sources cited for an item stay with it.
 */

/** A text in Turkish, with English when there is one. Required texts are checked by `AdminAssetRecordInputSchema`. */
const RecordText = (max: number) => z.strictObject({ tr: z.string().trim().max(max), en: z.string().trim().max(max).nullable() });
const RecordOptionalText = (max: number) => RecordText(max).nullable();
const RecordString = (max: number) => z.string().trim().max(max).nullable();
const Slug = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "must be a lowercase id").max(80);
const RecordConfidence = z.enum(["certain", "probable", "disputed", "legend"]);
const RecordA11y = z.enum(["yes", "partial", "no", "unknown"]);
const Year = z.int().min(-3000).max(2100);

export const InscriptionLanguageSchema = z.enum(["ar", "fa", "tr-ottoman", "tr", "el", "la", "hy", "other"]);

export const AdminAssetRecordSchema = z.strictObject({
  status: z.enum(["draft", "in_review", "published"]),
  name: RecordText(160),
  subtitle: RecordOptionalText(200),
  type: CodeSchema,
  secondaryTypes: z.array(CodeSchema).max(6),
  era: CodeSchema.nullable(),
  /** The complex (külliye) this asset is a building of. */
  parentId: AssetIdSchema.nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(40),
  alternateNames: z.array(z.strictObject({ name: RecordText(200), note: RecordOptionalText(400) })).max(30),
  city: CodeSchema,
  district: z.string().trim().max(60),
  neighborhood: RecordString(120),
  address: RecordString(300),
  coordinates: z.strictObject({ lat: z.number().min(35.5).max(42.5), lng: z.number().min(25.5).max(45) }).nullable(),
  summary: RecordText(1000),
  dating: z.strictObject({
    display: RecordOptionalText(200),
    startYear: Year.nullable(),
    endYear: Year.nullable(),
    hijriYear: Year.nullable(),
    century: z.int().min(1).max(21).nullable(),
    basis: RecordOptionalText(2000),
    confidence: RecordConfidence.nullable(),
  }),
  founder: z.strictObject({ name: RecordString(200), role: RecordString(200), confidence: RecordConfidence.nullable() }),
  architect: z.strictObject({
    name: RecordString(200),
    candidates: z.array(z.strictObject({ name: z.string().trim().max(200), note: RecordOptionalText(400) })).max(20),
    confidence: RecordConfidence.nullable(),
  }),
  waqf: z.strictObject({
    name: RecordString(300),
    deedDate: RecordString(120),
    deedExcerpt: RecordOptionalText(6000),
    conditions: RecordOptionalText(6000),
    landNote: RecordOptionalText(3000),
    confidence: RecordConfidence.nullable(),
  }),
  sections: z.array(z.strictObject({ id: Slug, title: RecordText(200), body: RecordText(60000), confidence: RecordConfidence })).max(60),
  customBlocks: z
    .array(z.strictObject({ id: Slug, title: RecordText(200), body: RecordText(60000), after: DossierPlaceSchema }))
    .max(30)
    .default([]),
  highlights: z
    .array(z.strictObject({ feature: z.string().trim().max(80), title: RecordText(200), hint: RecordText(1000), sectionId: Slug.nullable() }))
    .max(40),
  timeline: z
    .array(
      z.strictObject({
        id: Slug,
        year: Year,
        date: z.iso.date().nullable(),
        hijri: RecordString(60),
        type: CodeSchema,
        title: RecordText(400),
        note: RecordOptionalText(3000),
        confidence: RecordConfidence,
      }),
    )
    .max(120),
  facts: z
    .array(
      z.strictObject({
        key: Slug,
        label: RecordText(120),
        value: z.string().trim().max(300),
        unit: RecordString(40),
        note: RecordOptionalText(1000),
        confidence: RecordConfidence,
      }),
    )
    .max(60),
  legends: z
    .array(z.strictObject({ id: Slug, title: RecordText(200), body: RecordText(20000), verdict: z.enum(["folk_belief", "refuted_by_source", "unverified"]) }))
    .max(30),
  people: z.array(z.strictObject({ name: z.string().trim().max(200), role: RecordText(200) })).max(60),
  inscriptions: z
    .array(
      z.strictObject({
        id: Slug,
        location: RecordText(300),
        language: InscriptionLanguageSchema,
        script: RecordString(80),
        transliteration: RecordString(12000),
        translation: RecordOptionalText(12000),
        author: RecordString(200),
        hijriYear: Year.nullable(),
        gregorian: RecordString(200),
        note: RecordOptionalText(3000),
      }),
    )
    .max(60),
  visit: z.strictObject({
    setting: z.enum(["indoor", "outdoor", "mixed"]).nullable(),
    durationMin: z.int().min(5).max(1440).nullable(),
    entranceFee: z.enum(["free", "paid", "unknown"]).nullable(),
    notes: RecordOptionalText(3000),
  }),
  tips: z
    .array(z.strictObject({ text: RecordText(1500), origin: z.enum(["field_visit", "visitor_reviews_summary", "official"]), collectedAt: z.iso.date().nullable() }))
    .max(40),
  accessibility: z.strictObject({
    wheelchair: RecordA11y,
    stepFree: RecordA11y,
    ramp: RecordA11y,
    toilet: RecordA11y,
    verified: z.boolean(),
    notes: RecordOptionalText(3000),
    audioDescription: RecordOptionalText(12000),
  }),
  ambientSound: z.strictObject({ key: RecordString(80), caption: RecordOptionalText(600) }),
  /** The asset's photos in their order; only existing ones (by key) can be captioned, reordered or made the cover. */
  media: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(120),
        caption: RecordText(600),
        alt: RecordText(600),
        isCover: z.boolean(),
        dossierAfter: DossierPlaceSchema.nullable().default(null),
      }),
    )
    .max(200),
});

const blank = (text: string | null | undefined) => !text || text.trim().length === 0;
const unique = (ids: string[]) => new Set(ids).size === ids.length;

/** `PUT /admin/assets/:id/record` and `POST /admin/assets/record`: the record, with what must not be empty checked. */
export const AdminAssetRecordInputSchema = AdminAssetRecordSchema.superRefine((r, ctx) => {
  const need = (empty: boolean, path: Array<string | number>, message: string) => empty && ctx.addIssue({ code: "custom", path, message });
  need(blank(r.name.tr), ["name", "tr"], "name is required");
  need(blank(r.summary.tr), ["summary", "tr"], "summary is required");
  need(blank(r.district), ["district"], "district is required");
  r.sections.forEach((s, i) => need(blank(s.body.tr) || blank(s.title.tr), ["sections", i], "a section needs a title and a text"));
  r.customBlocks.forEach((b, i) => need(blank(b.body.tr) || blank(b.title.tr), ["customBlocks", i], "a block needs a title and a text"));
  r.timeline.forEach((e, i) => need(blank(e.title.tr), ["timeline", i, "title"], "an event needs a title"));
  r.facts.forEach((f, i) => need(blank(f.label.tr) || blank(f.value), ["facts", i], "a fact needs a label and a value"));
  r.legends.forEach((l, i) => need(blank(l.title.tr) || blank(l.body.tr), ["legends", i], "a legend needs a title and a text"));
  r.people.forEach((p, i) => need(blank(p.name), ["people", i, "name"], "a person needs a name"));
  r.inscriptions.forEach((n, i) => need(blank(n.location.tr), ["inscriptions", i, "location"], "an inscription needs a place"));
  r.tips.forEach((t, i) => need(blank(t.text.tr), ["tips", i, "text"], "a tip needs a text"));
  r.highlights.forEach((h, i) => need(blank(h.title.tr), ["highlights", i, "title"], "a highlight needs a title"));
  r.alternateNames.forEach((n, i) => need(blank(n.name.tr), ["alternateNames", i, "name"], "a name is required"));
  for (const [list, ids] of [
    ["sections", r.sections.map((s) => s.id)],
    ["customBlocks", r.customBlocks.map((b) => b.id)],
    ["timeline", r.timeline.map((e) => e.id)],
    ["facts", r.facts.map((f) => f.key)],
    ["legends", r.legends.map((l) => l.id)],
    ["inscriptions", r.inscriptions.map((n) => n.id)],
  ] as const) {
    need(!unique([...ids]), [list], "ids must be unique");
  }
  need(r.media.filter((m) => m.isCover).length > 1, ["media"], "only one cover");
  need(r.dating.startYear !== null && r.dating.endYear !== null && r.dating.startYear > r.dating.endYear, ["dating", "endYear"], "the end year comes after the start");
});

/** `GET /admin/assets/:id/record`. */
export const AdminAssetRecordResponseSchema = z.strictObject({
  id: AssetIdSchema,
  origin: AdminAssetOriginSchema,
  record: AdminAssetRecordSchema,
});

/** `GET /admin/assets`: every asset, panel and dataset, last changed first. */
export const AdminAssetsResponseSchema = z.strictObject({
  items: z.array(AdminAssetSchema),
});

export type AdminSummaryResponse = z.infer<typeof AdminSummaryResponseSchema>;
export type AdminUser = z.infer<typeof AdminUserSchema>;
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;
export type SetUserRoleRequest = z.infer<typeof SetUserRoleRequestSchema>;
export type AdminAssetInput = z.input<typeof AdminAssetInputSchema>;
export type AdminAssetPatch = z.input<typeof AdminAssetPatchSchema>;
export type AdminAsset = z.infer<typeof AdminAssetSchema>;
export type AdminAssetRecord = z.infer<typeof AdminAssetRecordSchema>;
export type AdminAssetRecordResponse = z.infer<typeof AdminAssetRecordResponseSchema>;
export type AdminAssetsResponse = z.infer<typeof AdminAssetsResponseSchema>;

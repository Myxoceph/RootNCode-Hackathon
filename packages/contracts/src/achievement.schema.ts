import { z } from "zod";
import {
  AssetIdSchema,
  ConfidenceSchema,
  ContractVersionSchema,
  CoordinatesSchema,
  LabeledCodeSchema,
  LangSchema,
  RelationDirectionSchema,
} from "./asset.schema";

/**
 * Başarımlar: visits to assets and approved contributions earn badges and points.
 * Each achievement is data (a rule with parameters), so admins add new ones without code.
 * Points cannot be bought or cashed out. The full list is in docs/achievements.md.
 */

const CodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase code");
const Count = z.int().min(1).max(500);

/** Which visits count: any filter left out matches everything. */
const VisitFilter = {
  /** `cities` code, e.g. `konya`. */
  city: CodeSchema.optional(),
  /** District as written in the dataset, e.g. `Osmangazi`; use it with `city`. */
  district: z.string().min(1).max(60).optional(),
  /** Any of these `asset_types` codes, e.g. `["han", "kervansaray"]`. */
  types: z.array(CodeSchema).min(1).max(10).optional(),
  /** `eras` code, e.g. `selcuklu`. */
  era: CodeSchema.optional(),
};

export const AchievementRuleSchema = z.discriminatedUnion("kind", [
  /** Visit `count` different assets matching the filter. */
  z.strictObject({ kind: z.literal("visit_count"), count: Count, ...VisitFilter }),
  /** Visit assets in `count` different districts (of `city`, when given). */
  z.strictObject({ kind: z.literal("districts"), count: Count, city: CodeSchema.optional() }),
  /** Visit assets in `count` different cities. */
  z.strictObject({ kind: z.literal("cities"), count: Count }),
  /** Visit `count` different districts or cities within `hours` (a trip in a row). */
  z.strictObject({
    kind: z.literal("within"),
    level: z.enum(["district", "city"]),
    count: z.int().min(2).max(20),
    hours: z.int().min(1).max(720),
    city: CodeSchema.optional(),
  }),
  /** Visit every building of a complex (the parent asset's children). */
  z.strictObject({ kind: z.literal("complex"), parentId: AssetIdSchema }),
  /** Prove `count` visits (position plus recognising the site in Ziyaret Mührü), in `city` when given. */
  z.strictObject({ kind: z.literal("proven_visits"), count: Count, city: CodeSchema.optional() }),
  /** Have `count` contributions approved: `notes` (tips, memories, corrections), `photos` or `any`. */
  z.strictObject({
    kind: z.literal("contributions"),
    count: Count,
    contribution: z.enum(["notes", "photos", "any"]),
  }),
]);

export const AchievementSchema = z.strictObject({
  code: CodeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  /** A single emoji shown as the badge; the app may draw its own icon for it. */
  badge: z.string().min(1).max(16),
  points: z.int().min(0).max(1000),
  rule: AchievementRuleSchema,
});

/** `GET /achievements?lang=`: every active achievement, in display order. */
export const AchievementsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  items: z.array(AchievementSchema),
});

export const MyAchievementSchema = AchievementSchema.extend({
  /** Null until earned. */
  earnedAt: z.iso.datetime().nullable(),
  progress: z.strictObject({ current: z.int().min(0), target: z.int().min(1) }),
});

/** `GET /me/achievements?lang=`: progress on every achievement; newly earned ones are recorded. */
export const MyAchievementsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  totalPoints: z.int().min(0),
  /** Different assets visited. */
  visits: z.int().min(0),
  items: z.array(MyAchievementSchema),
});

/** Within this distance of an asset's point a visit counts as checked on site. */
export const VISIT_RADIUS_METERS = 200;

/**
 * `POST /assets/:id/visit`: the visitor's position. Required when the asset has a point;
 * an asset without one accepts the visit as unchecked (`verified: false`).
 */
export const VisitRequestSchema = z
  .strictObject({ lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), "send both lat and lng, or neither");

/** How a visit was proven: on the phone (MindAR recognised the photo) or, later, by the server. */
export const ProofMethodSchema = z.enum(["device_recognition", "server_match"]);

/**
 * `POST /assets/:id/visit/proof`: the app recognised one of the asset's photos (`mediaKey`, e.g.
 * the Ziyaret Mührü photo) through the camera. The position follows the same rule as a visit.
 */
export const VisitProofRequestSchema = z
  .strictObject({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    /** `key` of the asset's photo that was recognised (`media[].key` of the asset detail). */
    mediaKey: z.string().min(1).max(300),
    method: z.literal("device_recognition"),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), "send both lat and lng, or neither");

export const VisitResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  assetId: AssetIdSchema,
  /** True when the position was within `VISIT_RADIUS_METERS` of the asset's point. */
  verified: z.boolean(),
  distanceMeters: z.int().min(0).nullable(),
  /** False when the visitor had been here before; the first visit is the one that counts. */
  firstVisit: z.boolean(),
  /** True once the visit is proven (`POST /assets/:id/visit/proof`). */
  proven: z.boolean().default(false),
  /** Achievements this visit earned. */
  newAchievements: z.array(AchievementSchema),
});

export const MyVisitSchema = z.strictObject({
  assetId: AssetIdSchema,
  /** The first visit; later ones are not recorded. */
  visitedAt: z.iso.datetime(),
  /** True when the position was checked on site. */
  verified: z.boolean(),
  /** True once proven through the camera (`POST /assets/:id/visit/proof`). */
  proven: z.boolean(),
});

/** `GET /me/visits`: every published asset the user has visited, newest first; the map lifts their fog. */
export const MyVisitsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  items: z.array(MyVisitSchema),
});

/**
 * A bond of an asset the user has discovered (visited). Until the other asset is discovered too,
 * only where it is comes with it: the map can make it glow, but what it is and why they are bound
 * stay hidden. `same_complex` and `urban_context` bonds are not listed (a complex's own buildings,
 * "right next to it"): only the ones that tell a story.
 */
export const ConnectionSchema = z.discriminatedUnion("revealed", [
  z.strictObject({
    revealed: z.literal(false),
    /** The discovered asset. */
    from: AssetIdSchema,
    to: AssetIdSchema,
    toCoordinates: CoordinatesSchema.nullable(),
  }),
  z.strictObject({
    revealed: z.literal(true),
    from: AssetIdSchema,
    to: AssetIdSchema,
    toCoordinates: CoordinatesSchema.nullable(),
    toName: z.string().min(1),
    type: LabeledCodeSchema,
    /** `outgoing`: the bond is told from `from` ("its rent kept `to` going"); `incoming`: from `to`. */
    direction: RelationDirectionSchema,
    description: z.string().min(1),
    confidence: ConfidenceSchema,
  }),
]);

/**
 * `GET /me/connections`: the bonds of every asset the user has discovered, an item per discovered
 * end (a bond between two discovered assets comes once from each). Asked again after a visit.
 */
export const MyConnectionsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  items: z.array(ConnectionSchema),
});

const I18n = z.strictObject({
  tr: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200).nullable().optional(),
});

/** `POST /admin/achievements` (admin only). */
export const AdminAchievementInputSchema = z.strictObject({
  code: CodeSchema.max(60),
  title: I18n,
  description: I18n,
  badge: z.string().trim().min(1).max(16),
  points: z.int().min(0).max(1000),
  rule: AchievementRuleSchema,
  sortOrder: z.int().min(0).max(10_000).default(1000),
  /** Inactive achievements are hidden and earn nothing; ones already earned stay. */
  active: z.boolean().default(true),
});

/** `PATCH /admin/achievements/:code`: any field except the code. */
export const AdminAchievementPatchSchema = z
  .strictObject({
    title: I18n,
    description: I18n,
    badge: z.string().trim().min(1).max(16),
    points: z.int().min(0).max(1000),
    rule: AchievementRuleSchema,
    sortOrder: z.int().min(0).max(10_000),
    active: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "at least one field");

export const AdminAchievementSchema = AchievementSchema.extend({
  sortOrder: z.int().min(0),
  active: z.boolean(),
  /** `seed` for the starting set, otherwise the admin's username. */
  createdBy: z.string().min(1),
  /** How many users have earned it. */
  earnedCount: z.int().min(0),
});

/** `GET /admin/achievements`: all of them, active or not, in display order. */
export const AdminAchievementsResponseSchema = z.strictObject({ items: z.array(AdminAchievementSchema) });

export type AchievementRule = z.infer<typeof AchievementRuleSchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type AchievementsResponse = z.infer<typeof AchievementsResponseSchema>;
export type MyAchievement = z.infer<typeof MyAchievementSchema>;
export type MyAchievementsResponse = z.infer<typeof MyAchievementsResponseSchema>;
export type VisitRequest = z.infer<typeof VisitRequestSchema>;
export type VisitResponse = z.infer<typeof VisitResponseSchema>;
export type ProofMethod = z.infer<typeof ProofMethodSchema>;
export type VisitProofRequest = z.infer<typeof VisitProofRequestSchema>;
export type MyVisit = z.infer<typeof MyVisitSchema>;
export type MyVisitsResponse = z.infer<typeof MyVisitsResponseSchema>;
export type AdminAchievementInput = z.input<typeof AdminAchievementInputSchema>;
export type AdminAchievementPatch = z.input<typeof AdminAchievementPatchSchema>;
export type AdminAchievement = z.infer<typeof AdminAchievementSchema>;
export type AdminAchievementsResponse = z.infer<typeof AdminAchievementsResponseSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type MyConnectionsResponse = z.infer<typeof MyConnectionsResponseSchema>;

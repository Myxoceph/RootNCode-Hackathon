import { z } from "zod";

/**
 * @deprecated Legacy v0.1 contract for the removed `/monuments` endpoints.
 * Use the `/assets` contract in asset.schema.ts. Kept only until the app moves
 * to `/assets` (week 2, task Y8), then deleted.
 *
 * Vagabonds API data contract.
 *
 * Mirrors apps/api/prisma/schema.prisma with camelCase fields and the
 * lowercase enum values stored in PostgreSQL. Every API response and the
 * mock payload must parse against these schemas; objects are strict so a
 * renamed or misspelled field fails loudly instead of being dropped.
 */

/** Supported cities. Free-text city names drift ("Istanbul" vs "İstanbul"), so extend this list instead. */
export const CitySchema = z.enum([
  "İstanbul",
  "Edirne",
  "Bursa",
  "Konya",
  "Kayseri",
  "Sivas",
  "Amasya",
  "Diyarbakır",
]);

export const MonumentTypeSchema = z.enum([
  "mosque",
  "madrasa",
  "bath",
  "fountain",
  "arasta",
  "caravanserai",
  "bridge",
  "tomb",
  "other",
]);

export const RelationTypeSchema = z.enum([
  "revenue",
  "water_supply",
  "same_waqf",
  "architect",
]);

export const TipStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const RelationDirectionSchema = z.enum(["outgoing", "incoming"]);

const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

export const InscriptionSchema = z.strictObject({
  id: z.uuid(),
  transcription: z.string().min(1),
  modernTurkish: z.string().min(1),
  waqfCondition: z.string().min(1).nullable(),
});

/** One edge of the urban network, seen from the monument that embeds it. */
export const MonumentRelationSummarySchema = z.strictObject({
  relatedMonumentId: z.uuid(),
  relatedMonumentSlug: SlugSchema,
  relatedMonumentName: z.string().min(1),
  relationType: RelationTypeSchema,
  direction: RelationDirectionSchema,
  note: z.string().min(1).nullable(),
});

export const VisitorTipSchema = z.strictObject({
  id: z.uuid(),
  tipText: z.string().min(1).max(500),
  status: TipStatusSchema,
  createdAt: z.iso.datetime(),
});

export const MonumentSchema = z.strictObject({
  id: z.uuid(),
  slug: SlugSchema,
  name: z.string().min(1),
  city: CitySchema,
  monumentType: MonumentTypeSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  period: z.string().min(1),
  archivePhotoUrl: z.url().nullable(),
  archiveYear: z.int().min(1800).max(2100).nullable(),
  markerImageUrl: z.url().nullable(),
  audioCapsuleUrl: z.url().nullable(),
  accessibilityAudioDesc: z.string().min(1),
  hasRamp: z.boolean(),
  stepFreeAccess: z.boolean(),
  inscriptions: z.array(InscriptionSchema),
  relations: z.array(MonumentRelationSummarySchema),
  visitorTips: z.array(VisitorTipSchema),
});

export const CityCuisineSchema = z.strictObject({
  id: z.uuid(),
  city: CitySchema,
  dishName: z.string().min(1),
  description: z.string().min(1),
  historicalContext: z.string().min(1),
});

/** @deprecated Version of the legacy monuments contract; mock_monuments.json keeps it in sync. */
export const MONUMENTS_CONTRACT_VERSION = "0.1.0";

/** Response body of `GET /monuments`, and the shape of mock_monuments.json. */
export const MonumentsPayloadSchema = z.strictObject({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver (x.y.z)"),
  generatedAt: z.iso.datetime(),
  monuments: z.array(MonumentSchema),
  cityCuisines: z.array(CityCuisineSchema),
});

export type City = z.infer<typeof CitySchema>;
export type MonumentType = z.infer<typeof MonumentTypeSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type TipStatus = z.infer<typeof TipStatusSchema>;
export type RelationDirection = z.infer<typeof RelationDirectionSchema>;
export type Inscription = z.infer<typeof InscriptionSchema>;
export type MonumentRelationSummary = z.infer<typeof MonumentRelationSummarySchema>;
export type VisitorTip = z.infer<typeof VisitorTipSchema>;
export type Monument = z.infer<typeof MonumentSchema>;
export type CityCuisine = z.infer<typeof CityCuisineSchema>;
export type MonumentsPayload = z.infer<typeof MonumentsPayloadSchema>;

import { z } from "zod";
import { ConfidenceSchema, ContractVersionSchema, LabeledCodeSchema, LangSchema, SourceRefSchema } from "./asset.schema";

/**
 * Yöresel Kültür & Gastronomi (module 5): a city's local dishes (`GET /cities/:code/dishes`),
 * also used for the lunch and dessert breaks of a trip (`/routes/trip`).
 */

/** `main` (lunch on a trip), `meze`, `dessert` (the dessert stop on a trip), `street` (bakery and street food). */
export const DishKindSchema = z.enum(["main", "meze", "dessert", "street"]);

/** The dish's registration as a geographical indication (Türk Patent). */
export const GeographicalIndicationSchema = z.strictObject({
  /** `mense` (designation of origin) or `mahrec` (geographical indication), labelled in the response language. */
  type: LabeledCodeSchema,
  registrationNumber: z.string().min(1),
  registeredOn: z.iso.date(),
  /** Who registered it, e.g. a chamber of commerce or the governorship. */
  registrant: z.string().min(1),
  /** The registry document (PDF). */
  documentUrl: z.url(),
  /** The dish's page on the registry portal. */
  portalUrl: z.url(),
});

export const CityDishSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: LabeledCodeSchema.extend({ code: DishKindSchema }),
  description: z.string().min(1),
  /** Its history or the days it is made for; null when the source says nothing. */
  story: z.string().min(1).nullable(),
  /** Set when the dish belongs to one district of the city, e.g. "İnegöl". */
  district: z.string().min(1).nullable(),
  geographicalIndication: GeographicalIndicationSchema,
  sources: z.array(SourceRefSchema).min(1),
  confidence: ConfidenceSchema,
});

/** Response body of `GET /cities/:code/dishes`. */
export const CityDishesResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: LabeledCodeSchema,
  /** In the data team's order; empty when the city has no dishes yet. */
  dishes: z.array(CityDishSchema),
});

export type DishKind = z.infer<typeof DishKindSchema>;
export type GeographicalIndication = z.infer<typeof GeographicalIndicationSchema>;
export type CityDish = z.infer<typeof CityDishSchema>;
export type CityDishesResponse = z.infer<typeof CityDishesResponseSchema>;

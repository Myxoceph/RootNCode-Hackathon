import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema, LangSchema } from "./asset.schema";

/**
 * Public transport directions, piloted in Konya (`GET /transit/plan`): walking, bus and tram legs
 * with their stops and scheduled times, from Konya Büyükşehir Belediyesi's GTFS timetable.
 * Other cities have no transit data yet and answer `TRANSIT_NOT_AVAILABLE_HERE`.
 */

/** The only city with transit directions for now. */
export const TRANSIT_CITY = "konya";

/** Where visitors arrive in Konya; a `from` value of `GET /transit/plan`. */
export const TransitEntryPointCodeSchema = z.enum(["konya-gari", "selcuklu-yht-gari", "konya-otogari"]);

export const TransitEntryPointSchema = z.strictObject({
  code: TransitEntryPointCodeSchema,
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** `GET /transit/entry-points?lang=`: the places a route can start from besides the visitor's position. */
export const TransitEntryPointsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: z.literal(TRANSIT_CITY),
  items: z.array(TransitEntryPointSchema),
});

export const TransitModeSchema = z.enum(["walk", "bus", "tram"]);

/** One end of a leg: a stop (with its code on the sign) or the start or destination itself. */
export const TransitPlaceSchema = z.strictObject({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** The stop code passengers see, e.g. "1419a"; null for a place that is not a stop. */
  stopCode: z.string().min(1).nullable(),
});

export const TransitLegSchema = z.strictObject({
  mode: TransitModeSchema,
  from: TransitPlaceSchema,
  to: TransitPlaceSchema,
  /** Scheduled, with the Türkiye offset, e.g. "2026-11-07T10:15:00+03:00". */
  departure: z.iso.datetime({ offset: true }),
  arrival: z.iso.datetime({ offset: true }),
  durationMinutes: z.int().min(0),
  distanceMeters: z.int().min(0),
  /** Null for walking. */
  line: z
    .strictObject({
      /** As on the bus or tram, e.g. "56-A". */
      name: z.string().min(1),
      longName: z.string().nullable(),
      /** "#RRGGBB" when the timetable gives one. */
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
    })
    .nullable(),
  /** Direction shown on the vehicle; null for walking. */
  headsign: z.string().nullable(),
  /** Stops passed between boarding and getting off. */
  stopsBetween: z.int().min(0),
  /** The leg's path as [lat, lng] points, simplified for drawing. */
  path: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const TransitItinerarySchema = z.strictObject({
  departure: z.iso.datetime({ offset: true }),
  arrival: z.iso.datetime({ offset: true }),
  durationMinutes: z.int().min(0),
  walkMeters: z.int().min(0),
  transfers: z.int().min(0),
  legs: z.array(TransitLegSchema).min(1),
});

/** `GET /transit/plan?from=&to=&at=&lang=`: up to three ways to go, soonest first. */
export const TransitPlanResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: z.literal(TRANSIT_CITY),
  from: TransitPlaceSchema,
  to: TransitPlaceSchema.extend({ assetId: AssetIdSchema.nullable() }),
  /** Empty when no bus or tram helps; the visitor can walk or take a taxi. */
  itineraries: z.array(TransitItinerarySchema).max(3),
  /** Show it under the map: the data comes from the municipality's timetable of this date. */
  source: z.strictObject({ name: z.string(), license: z.string(), timetable: z.string(), url: z.url() }),
});

export type TransitEntryPointCode = z.infer<typeof TransitEntryPointCodeSchema>;
export type TransitEntryPoint = z.infer<typeof TransitEntryPointSchema>;
export type TransitEntryPointsResponse = z.infer<typeof TransitEntryPointsResponseSchema>;
export type TransitMode = z.infer<typeof TransitModeSchema>;
export type TransitPlace = z.infer<typeof TransitPlaceSchema>;
export type TransitLeg = z.infer<typeof TransitLegSchema>;
export type TransitItinerary = z.infer<typeof TransitItinerarySchema>;
export type TransitPlanResponse = z.infer<typeof TransitPlanResponseSchema>;

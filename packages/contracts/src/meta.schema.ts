import { z } from "zod";
import {
  AccessibilityStatusSchema,
  ConfidenceSchema,
  ContractVersionSchema,
  LabeledCodeSchema,
  LangSchema,
  MediaKindSchema,
} from "./asset.schema";

/**
 * Code lists for filters, legends and badges (`GET /meta/enums`), with labels in
 * the requested language. Codes match the `code` fields in `/assets` responses.
 */

/** A filter value with the number of assets the client can currently see for it. */
export const CountedCodeSchema = LabeledCodeSchema.extend({
  assetCount: z.int().min(0),
});

export const MetaEnumsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  regions: z.array(LabeledCodeSchema),
  cities: z.array(
    CountedCodeSchema.extend({
      region: z.string().min(1),
      plate: z.int().positive().nullable(),
    }),
  ),
  assetTypes: z.array(CountedCodeSchema),
  eras: z.array(CountedCodeSchema),
  relationTypes: z.array(LabeledCodeSchema),
  timelineEventTypes: z.array(LabeledCodeSchema),
  confidence: z.array(ConfidenceSchema),
  accessibilityStatus: z.array(LabeledCodeSchema.extend({ code: AccessibilityStatusSchema })),
  mediaKinds: z.array(LabeledCodeSchema.extend({ code: MediaKindSchema })),
});

export type CountedCode = z.infer<typeof CountedCodeSchema>;
export type MetaEnumsResponse = z.infer<typeof MetaEnumsResponseSchema>;

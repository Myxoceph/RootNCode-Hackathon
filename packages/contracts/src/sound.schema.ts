import { z } from "zod";
import { ContractVersionSchema, LangSchema, SoundRecordingSchema } from "./asset.schema";

/**
 * Sesli Zaman Kapsülü (module 7): the published ambient recordings (`GET /meta/sounds`),
 * for the capsule screen. An asset's own recording also comes in `ambientSound.recording`.
 */

export const SoundSchema = SoundRecordingSchema.extend({
  /** The `ambientSound.key` assets and asset types use, e.g. "hamam". */
  key: z.string().min(1),
  title: z.string().min(1),
});

/** Response body of `GET /meta/sounds`. */
export const MetaSoundsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  /** In the data team's order; empty until recordings are added. */
  sounds: z.array(SoundSchema),
});

export type Sound = z.infer<typeof SoundSchema>;
export type MetaSoundsResponse = z.infer<typeof MetaSoundsResponseSchema>;

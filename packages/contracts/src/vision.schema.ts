import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema, LangSchema } from "./asset.schema";
import { ChatCitationSchema } from "./chat.schema";

/**
 * Taşa Sor: a photo of a detail of the asset (a tile, a door, a carving) and a question about it.
 * `POST /vision/ask` answers from what the photo shows and the asset's record, in a few sentences
 * that the app reads aloud. Only signed-in accounts use it, as the assistant. Photos are not stored.
 */

/** Largest photo body; the app sends a JPEG about 1024 px wide, well under this. */
export const VISION_MAX_BYTES = 1536 * 1024;
/** Image types `POST /vision/ask` takes as its body (the photo itself, no multipart). */
export const VISION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** What the shutter alone asks. */
export const VISION_DEFAULT_QUESTION = "Bu ne?";

/** Query of `POST /vision/ask`. */
export const VisionAskQuerySchema = z.strictObject({
  /**
   * The asset the photo is taken at: its record grounds the answer. Without it (the visitor is
   * near no known asset) the answer comes from the photo alone, with no citation.
   */
  assetId: AssetIdSchema.optional(),
  /** Spoken or typed; without it, `VISION_DEFAULT_QUESTION`. */
  question: z.string().trim().min(1).max(500).optional(),
  lang: LangSchema.optional(),
});

/** Response body of `POST /vision/ask`. */
export const VisionAskResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  /** Plain text with `[n]` markers, as a chat answer; every marker has a citation. */
  answer: z.string().min(1),
  citations: z.array(ChatCitationSchema),
});

export type VisionAskQuery = z.infer<typeof VisionAskQuerySchema>;
export type VisionAskResponse = z.infer<typeof VisionAskResponseSchema>;

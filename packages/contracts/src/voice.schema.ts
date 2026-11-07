import { z } from "zod";
import { ContractVersionSchema, LangSchema } from "./asset.schema";

/**
 * Sesli Rehber: the assistant by voice. The app records a question, `POST /voice/transcribe`
 * turns it into text for `POST /chat`, and `GET /voice/speech` reads the answer aloud.
 * Only signed-in accounts use them, as the assistant. Recordings are not stored.
 */

/** Longest recording the app sends, and the API accepts. */
export const VOICE_MAX_SECONDS = 20;
/** Largest recording body: 20 s of compressed speech is well under this. */
export const VOICE_MAX_BYTES = 1024 * 1024;
/** Longest text read aloud at once; a spoken answer is a few sentences (`ChatRequest.spoken`). */
export const VOICE_SPEECH_MAX_CHARS = 1000;
/** Audio types `POST /voice/transcribe` takes as its body (the recording itself, no multipart). */
export const VOICE_AUDIO_TYPES = ["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"] as const;

/** Response body of `POST /voice/transcribe`. Empty `text` when nothing was understood. */
export const VoiceTranscriptionResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  text: z.string().max(1000),
});

/**
 * Query of `GET /voice/speech`; the response is the speech as `audio/mpeg`. A GET, so a phone's
 * player streams it straight from the address and starts while it downloads.
 */
export const VoiceSpeechQuerySchema = z.strictObject({
  /** An answer, or a part of one, as `POST /chat` gave it: `[n]` markers and list dashes are not read. */
  text: z.string().trim().min(1).max(VOICE_SPEECH_MAX_CHARS),
  lang: LangSchema.optional(),
});

export type VoiceTranscriptionResponse = z.infer<typeof VoiceTranscriptionResponseSchema>;
export type VoiceSpeechQuery = z.infer<typeof VoiceSpeechQuerySchema>;

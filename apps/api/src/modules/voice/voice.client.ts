import { z } from "zod";

/**
 * Client for an OpenAI-compatible provider's speech endpoints: `/audio/transcriptions`
 * (speech to text) and `/audio/speech` (text to speech). EVREN serves both, next to the
 * assistant's model, with the same key.
 */

export interface VoiceClient {
  /** The recording's words; empty when none were understood. Throws `VoiceError` on any failure. */
  transcribe(audio: Buffer, contentType: string, lang: string, signal: AbortSignal): Promise<string>;
  /** The text read aloud, as MP3. Throws `VoiceError` on any failure. */
  speak(text: string, signal: AbortSignal): Promise<Buffer>;
}

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceError";
  }
}

const TranscriptionSchema = z.object({ text: z.string() });

/** File name the provider sees, by type: some pick the decoder from the extension. */
const EXTENSION: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export interface VoiceClientOptions {
  baseUrl: string;
  asrModel: string;
  ttsModel: string;
  /** Sent as a bearer token when set; never logged. */
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
}

export function createVoiceClient({ baseUrl, asrModel, ttsModel, apiKey, fetchImpl = fetch }: VoiceClientOptions): VoiceClient {
  const root = baseUrl.replace(/\/+$/, "");
  const auth: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};

  async function call(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, { ...init, headers: { ...auth, ...init.headers } });
    } catch (err) {
      throw new VoiceError(init.signal?.aborted ? "Voice call timed out" : `Voice provider unreachable (${(err as Error).name})`);
    }
    // The provider's error body may echo the request, so only the status is kept.
    if (!response.ok) throw new VoiceError(`Voice provider returned HTTP ${response.status}`);
    return response;
  }

  return {
    async transcribe(audio, contentType, lang, signal) {
      const form = new FormData();
      form.append("model", asrModel);
      form.append("language", lang);
      form.append("file", new Blob([new Uint8Array(audio)], { type: contentType }), `question.${EXTENSION[contentType] ?? "m4a"}`);
      const response = await call("/audio/transcriptions", { method: "POST", body: form, signal });
      const parsed = TranscriptionSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new VoiceError("Voice provider returned an unexpected transcription");
      return parsed.data.text.trim();
    },

    async speak(text, signal) {
      const response = await call("/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: ttsModel, input: text, response_format: "mp3" }),
        signal,
      });
      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.length === 0) throw new VoiceError("Voice provider returned no audio");
      return audio;
    },
  };
}

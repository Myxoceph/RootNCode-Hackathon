import { z } from "zod";

/**
 * Client for an OpenAI-compatible provider's vision model (`/chat/completions` with an image):
 * EVREN serves qwen3-vl-30b next to the assistant's model, with the same key.
 */

export interface VisionLook {
  image: Buffer;
  /** The image's media type, e.g. image/jpeg. */
  type: string;
  /** The rules and the asset's record. */
  system: string;
  question: string;
  signal: AbortSignal;
}

export interface VisionClient {
  /** The model's answer about the photo. Throws `VisionError` on any provider failure. */
  look(input: VisionLook): Promise<string>;
}

export class VisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionError";
  }
}

const ReplySchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).min(1),
});

/** A short answer is asked for; this caps a model that runs on. */
const MAX_TOKENS = 400;

export interface VisionClientOptions {
  baseUrl: string;
  model: string;
  /** Sent as a bearer token when set; never logged. */
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
}

export function createVisionClient({ baseUrl, model, apiKey, fetchImpl = fetch }: VisionClientOptions): VisionClient {
  const root = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  return {
    async look({ image, type, system, question, signal }) {
      let response: Response;
      try {
        response = await fetchImpl(`${root}/chat/completions`, {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:${type};base64,${image.toString("base64")}` } },
                  { type: "text", text: question },
                ],
              },
            ],
          }),
        });
      } catch (err) {
        throw new VisionError(signal.aborted ? "Vision call timed out" : `Vision provider unreachable (${(err as Error).name})`);
      }
      // The provider's error body may echo the request, so only the status is kept.
      if (!response.ok) throw new VisionError(`Vision provider returned HTTP ${response.status}`);
      const parsed = ReplySchema.safeParse(await response.json().catch(() => null));
      const text = parsed.success ? parsed.data.choices[0]!.message.content?.trim() : undefined;
      if (!text) throw new VisionError("Vision provider returned no answer");
      return text;
    },
  };
}

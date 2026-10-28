import { z } from "zod";

/**
 * Client for an OpenAI-compatible `/chat/completions` endpoint with tool calling.
 * The same code talks to Ollama (`http://<host>:11434/v1`) and to hosted providers
 * that offer this API (e.g. Gemini's `…/v1beta/openai`), chosen by environment only.
 */

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text as the model wrote it; the caller validates it. */
  arguments: string;
  /**
   * Provider data that must go back with the call, e.g. Gemini 3's thought signature
   * (`extra_content.google.thought_signature`); without it the next request fails with 400.
   */
  extraContent?: Record<string, unknown> | undefined;
}

/** A tool call as the API carries it in an assistant message. */
export interface ToolCallMessage {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCallMessage[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

export interface ModelReply {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface ChatModel {
  /** Model name as configured, reported in responses. */
  readonly name: string;
  /** One completion; empty `tools` asks for a plain answer. Throws `ModelError` on any failure. */
  complete(messages: ChatMessage[], tools: ToolSpec[], signal: AbortSignal): Promise<ModelReply>;
  /** Whether the provider answers at all (cached briefly); never throws. */
  ping(): Promise<boolean>;
}

/** The part of a `/chat/completions` response we use. */
const CompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().optional(),
                extra_content: z.record(z.string(), z.unknown()).optional(),
                function: z.object({
                  name: z.string(),
                  arguments: z.union([z.string(), z.record(z.string(), z.unknown())]),
                }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
});

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

const PING_TIMEOUT_MS = 3_000;
const PING_TTL_MS = 30_000;
// Low temperature: answers should stay close to the tool results.
const TEMPERATURE = 0.2;
// Thinking models (Gemini 3, Qwen 3) spend part of this on reasoning; 800 cut answers short.
const MAX_ANSWER_TOKENS = 2_048;

export interface ModelClientOptions {
  baseUrl: string;
  model: string;
  /** Sent as a bearer token when set; never logged. */
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
}

export function createChatModel({ baseUrl, model, apiKey, fetchImpl = fetch }: ModelClientOptions): ChatModel {
  const root = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  let lastPing: { at: number; ok: boolean } | null = null;

  return {
    name: model,

    async complete(messages, tools, signal) {
      const body = {
        model,
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_ANSWER_TOKENS,
        ...(tools.length > 0 && {
          tools: tools.map((tool) => ({ type: "function", function: tool })),
          tool_choice: "auto",
        }),
      };
      let response: Response;
      try {
        response = await fetchImpl(`${root}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (signal.aborted) throw new ModelError("Model call timed out");
        throw new ModelError(`Model unreachable (${(err as Error).name})`);
      }
      // The provider's error body may echo the request, so only the status is kept.
      if (!response.ok) throw new ModelError(`Model returned HTTP ${response.status}`);

      const parsed = CompletionSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new ModelError("Model returned an unexpected response");
      const { message } = parsed.data.choices[0]!;
      return {
        content: message.content ?? null,
        toolCalls: (message.tool_calls ?? []).map((call, i) => ({
          id: call.id ?? `call_${i}`,
          name: call.function.name,
          arguments:
            typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments),
          extraContent: call.extra_content,
        })),
      };
    },

    async ping() {
      if (lastPing && Date.now() - lastPing.at < PING_TTL_MS) return lastPing.ok;
      let ok = false;
      try {
        const response = await fetchImpl(`${root}/models`, { headers, signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
        ok = response.ok;
      } catch {
        ok = false;
      }
      lastPing = { at: Date.now(), ok };
      return ok;
    },
  };
}

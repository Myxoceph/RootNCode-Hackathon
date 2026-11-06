import "dotenv/config";
import { z } from "zod";

/**
 * Runtime configuration, validated once at startup.
 * A missing or malformed variable stops the process before it serves traffic.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z
    .url()
    .refine((url) => /^postgres(ql)?:\/\//.test(url), "DATABASE_URL must be a PostgreSQL connection string"),
  // Comma-separated browser origins allowed to call the API (default: Expo web dev server).
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8081")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  // Public base URL of the media (the media Worker in front of the R2 bucket, docs/deploy.md);
  // image URLs are built as `${MEDIA_BASE_URL}/${variant key}`.
  MEDIA_BASE_URL: z
    .url()
    .default("https://media.allbytech.com")
    .transform((url) => url.replace(/\/+$/, "")),
  // Which assets the API serves: only `published`, or `preview` (published + in_review) for development.
  // Drafts are never served.
  ASSET_VISIBILITY: z.enum(["published", "preview"]).default("published"),
  // Proxies whose X-Forwarded-For gives the client IP (rate limiting needs the real IP):
  // `false` (direct), `true` (any), or comma-separated IPs, CIDRs or proxy-addr names
  // (`uniquelocal` = private networks, e.g. Caddy on the Docker network).
  // Hop counts are not accepted: Fastify cannot validate the peer with them and ignores the header.
  TRUST_PROXY: z
    .string()
    .default("false")
    .refine((value) => !/^\s*\d+\s*$/.test(value), "TRUST_PROXY must list proxy addresses, not a hop count")
    .transform((value): boolean | string[] => {
      const trimmed = value.trim();
      if (trimmed === "true" || trimmed === "false") return trimmed === "true";
      return trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }),
  // Requests per minute one client IP may make; 0 turns the limit off.
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(120),
  // Open-Meteo base URL for current weather (no API key); empty turns weather off.
  OPEN_METEO_URL: z.union([z.literal(""), z.url()]).default("https://api.open-meteo.com"),
  // AI assistant: an OpenAI-compatible endpoint (Ollama: http://<host>:11434/v1) and its model name.
  // Empty turns the assistant off; GET /chat/status then reports it unavailable.
  ASSISTANT_BASE_URL: z.union([z.literal(""), z.url()]).default(""),
  ASSISTANT_MODEL: z.string().default(""),
  // Only for hosted providers; Ollama needs none. Never logged.
  ASSISTANT_API_KEY: z.string().default(""),
  // Sesli Rehber, on the assistant's provider (its /audio/transcriptions and /audio/speech):
  // speech-to-text and text-to-speech models, e.g. EVREN's qwen3-asr-1.7b and voxcpm2.
  // Either empty turns voice off; POST /voice/* then answer 503.
  VOICE_ASR_MODEL: z.string().default(""),
  VOICE_TTS_MODEL: z.string().default(""),
  // Taşa Sor, on the assistant's provider: a model that sees images (EVREN's qwen3-vl-30b).
  // Empty turns it off; POST /vision/ask then answers 503.
  VISION_MODEL: z.string().default(""),
  // OpenTripPlanner serving the Konya graph (deploy/otp/prepare.sh), e.g. http://otp:8080; empty turns
  // transit directions off and GET /transit/plan answers 503.
  OTP_URL: z.union([z.literal(""), z.url()]).default(""),
  // Photos uploaded from the panel: an R2 token allowed to write only this bucket. Any of them empty
  // turns uploads off; POST /admin/assets/:id/media then answers 503. Never logged.
  MEDIA_S3_ENDPOINT: z.union([z.literal(""), z.url()]).default(""),
  MEDIA_BUCKET: z.string().default(""),
  MEDIA_S3_ACCESS_KEY_ID: z.string().default(""),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().default(""),
  // The app's "Kilidi aç": POST /assets/:id/visit/unlock records a visit without position or photo,
  // while Ziyaret Mührü is tried away from the sites. On until the app requires the photo; then "false".
  DEMO_UNLOCK: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

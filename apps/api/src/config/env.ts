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
  // and POST /assets/:id/visit/proof takes no position, so a printed photo can stand in for the site.
  // On until visits must happen on site; then "false".
  DEMO_UNLOCK: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  // Veri Döngüsü's development (docs/plans/veri-dongusu.md §0): "true" refuses to start unless the
  // database is on this machine and no R2 credentials are set; photos then go to LOCAL_MEDIA_DIR,
  // served at /local-media. Never on a server.
  INTAKE_LOCAL_ONLY: z.enum(["true", "false", "1", "0"]).default("false").transform((value) => value === "true" || value === "1"),
  // Veri Döngüsü's routes (book intake, the review queue's new kinds, inscription proposals). Off by
  // default: merged code changes nothing on a server until this is turned on.
  INTAKE_ENABLED: z.enum(["true", "false", "1", "0"]).default("false").transform((value) => value === "true" || value === "1"),
  // Where the local media store writes with INTAKE_LOCAL_ONLY; empty: the repo's data/build/media.
  LOCAL_MEDIA_DIR: z.string().default(""),
  // With INTAKE_LOCAL_ONLY, the media URLs the API gives (instead of MEDIA_BASE_URL, which stays the
  // shared host the local route falls back to). A phone needs the computer's address, not localhost.
  // Kept apart from MEDIA_BASE_URL so the same .env works on branches without the local route.
  // Empty: http://localhost:<PORT>/local-media (localMediaBaseUrl).
  LOCAL_MEDIA_BASE_URL: z
    .union([z.literal(""), z.url()])
    .default("")
    .transform((url) => url.replace(/\/+$/, "")),
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
  const problems = localOnlyProblems(result.data);
  if (problems.length > 0) {
    throw new Error(`INTAKE_LOCAL_ONLY is on, so nothing may be written off this machine:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return result.data;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Why the environment would write off this machine although INTAKE_LOCAL_ONLY is on: a database
 * elsewhere, or R2 credentials (photos would go to the shared bucket). Empty when it is off.
 */
export function localOnlyProblems(
  env: Pick<Env, "INTAKE_LOCAL_ONLY" | "DATABASE_URL" | "MEDIA_BASE_URL" | "MEDIA_S3_ENDPOINT" | "MEDIA_BUCKET" | "MEDIA_S3_ACCESS_KEY_ID" | "MEDIA_S3_SECRET_ACCESS_KEY">,
): string[] {
  if (!env.INTAKE_LOCAL_ONLY) return [];
  const problems: string[] = [];
  let url: URL | null = null;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    problems.push("DATABASE_URL could not be read; only a localhost address is allowed");
  }
  if (url) {
    // A Unix socket (`postgresql:///db?host=/tmp`) is on this machine too.
    const socket = url.hostname === "" && (url.searchParams.get("host") ?? "").startsWith("/");
    if (!socket && !LOCAL_HOSTS.has(url.hostname)) problems.push(`DATABASE_URL points at "${url.hostname}"; only localhost is allowed`);
  }
  // MEDIA_BASE_URL is where /local-media sends what it does not have: pointed at /local-media itself,
  // every such photo would redirect to itself forever. LOCAL_MEDIA_BASE_URL is the local one.
  if (/\/local-media(\/|$)/.test(env.MEDIA_BASE_URL)) {
    problems.push("MEDIA_BASE_URL points at /local-media; keep it the shared media host and set LOCAL_MEDIA_BASE_URL instead");
  }
  const r2 = (["MEDIA_S3_ENDPOINT", "MEDIA_BUCKET", "MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY"] as const).filter((key) => env[key] !== "");
  if (r2.length > 0) problems.push(`${r2.join(", ")} set; remove them (photos go to the local store)`);
  return problems;
}

/** The media URLs the API gives with INTAKE_LOCAL_ONLY: LOCAL_MEDIA_BASE_URL, else this API's own /local-media. */
export function localMediaBaseUrl(env: Pick<Env, "LOCAL_MEDIA_BASE_URL" | "PORT">): string {
  return env.LOCAL_MEDIA_BASE_URL || `http://localhost:${env.PORT}/local-media`;
}

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
  // Public base URL of the media bucket; image URLs are built as `${MEDIA_BASE_URL}/${variant key}`.
  MEDIA_BASE_URL: z
    .url()
    .default("https://pub-6463f7311d7d4a26b43c3099db98b8e3.r2.dev")
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

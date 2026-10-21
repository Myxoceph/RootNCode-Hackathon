import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../lib/http-error.ts";

export interface RateLimitOptions {
  /** Requests one client (IP) may make per window, across all routes. */
  max: number;
  timeWindowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 120, timeWindowMs: 60_000 };

/**
 * Security headers and per-IP rate limiting for every route.
 *
 * Behind a proxy the client IP comes from X-Forwarded-For only when Fastify's
 * `trustProxy` is set; otherwise every request would share the proxy's IP and limit.
 * Routes opt out with `config: { rateLimit: false }` or set a stricter limit there.
 */
export function registerSecurity(app: FastifyInstance, limits: RateLimitOptions | false): void {
  app.register(helmet, {
    // The API serves JSON only; Swagger UI replaces this header on its own routes (`staticCSP`).
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    // Browsers fetch the API from the web app's origin, which may differ from the API's.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  if (limits === false) return;
  app.register(rateLimit, {
    global: true,
    max: limits.max,
    timeWindow: limits.timeWindowMs,
    errorResponseBuilder: (_request, context) =>
      new HttpError(429, "RATE_LIMITED", `Too many requests, retry in ${context.after}`),
  });
}

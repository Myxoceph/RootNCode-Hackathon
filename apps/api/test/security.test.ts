import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadEnv } from "../src/config/env.ts";
import type { PrismaClient } from "../src/db/prisma.ts";

const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as PrismaClient;
const DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

describe("Security headers", () => {
  it("locks JSON responses down with a strict CSP and nosniff", async () => {
    const app = buildApp({ prisma });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["content-security-policy"]).toBe("default-src 'none';frame-ancestors 'none'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    await app.close();
  });

  it("gives Swagger UI a policy it can load under", async () => {
    const app = buildApp({ prisma });

    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    // The demo server may serve plain HTTP; upgrading the docs' own requests would break them.
    expect(response.headers["content-security-policy"]).not.toContain("upgrade-insecure-requests");
    await app.close();
  });
});

describe("Rate limit", () => {
  it("answers 429 in the standard error shape once a client exceeds the limit", async () => {
    const app = buildApp({ prisma, rateLimit: { max: 2, timeWindowMs: 60_000 } });

    for (let i = 0; i < 2; i++) {
      expect((await app.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(200);
    }
    const limited = await app.inject({ method: "GET", url: "/docs/json" });

    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBeDefined();
    await app.close();
  });

  it("counts clients separately by the IP the trusted proxy forwards", async () => {
    const app = buildApp({ prisma, trustProxy: ["127.0.0.1"], rateLimit: { max: 1, timeWindowMs: 60_000 } });
    const from = (ip: string) =>
      app.inject({ method: "GET", url: "/docs/json", headers: { "x-forwarded-for": ip } });

    expect((await from("203.0.113.1")).statusCode).toBe(200);
    expect((await from("203.0.113.2")).statusCode).toBe(200);
    expect((await from("203.0.113.1")).statusCode).toBe(429);
    await app.close();
  });

  it("never limits the health check", async () => {
    const app = buildApp({ prisma, rateLimit: { max: 1, timeWindowMs: 60_000 } });

    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    }
    await app.close();
  });
});

describe("Request body limit", () => {
  it("rejects bodies over 16 KB", async () => {
    const app = buildApp({ prisma });
    app.post("/echo", async () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ text: "x".repeat(17 * 1024) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBeDefined();
    await app.close();
  });
});

describe("TRUST_PROXY / RATE_LIMIT_MAX env", () => {
  it("defaults to a direct connection and 120 requests per minute", () => {
    const env = loadEnv({ DATABASE_URL });
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.RATE_LIMIT_MAX).toBe(120);
  });

  it("parses booleans and address lists", () => {
    expect(loadEnv({ DATABASE_URL, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ DATABASE_URL, TRUST_PROXY: "uniquelocal" }).TRUST_PROXY).toEqual(["uniquelocal"]);
    expect(loadEnv({ DATABASE_URL, TRUST_PROXY: "10.0.0.0/8, 127.0.0.1" }).TRUST_PROXY).toEqual([
      "10.0.0.0/8",
      "127.0.0.1",
    ]);
  });

  it("rejects a hop count, which Fastify would silently ignore", () => {
    expect(() => loadEnv({ DATABASE_URL, TRUST_PROXY: "1" })).toThrow(/TRUST_PROXY/);
  });

  it("rejects a negative limit", () => {
    expect(() => loadEnv({ DATABASE_URL, RATE_LIMIT_MAX: "-1" })).toThrow(/RATE_LIMIT_MAX/);
  });
});

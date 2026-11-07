import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadEnv } from "../src/config/env.ts";
import type { PrismaClient } from "../src/db/prisma.ts";

const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as PrismaClient;
const DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

describe("CORS", () => {
  it("allows configured browser origins", async () => {
    const app = buildApp({ prisma, corsOrigins: ["http://localhost:8081"] });

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:8081" },
    });

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    await app.close();
  });

  it("lets the web admin panel send PATCH and DELETE", async () => {
    const app = buildApp({ prisma, corsOrigins: ["http://localhost:8081"] });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/admin/achievements/x",
      headers: { origin: "http://localhost:8081", "access-control-request-method": "DELETE" },
    });

    expect(response.headers["access-control-allow-methods"]).toMatch(/PATCH.*DELETE/);
    // The profile photo is sent with PUT (`PUT /me/avatar`).
    expect(response.headers["access-control-allow-methods"]).toContain("PUT");
    await app.close();
  });

  it("does not allow unknown origins", async () => {
    const app = buildApp({ prisma, corsOrigins: ["http://localhost:8081"] });

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});

describe("CORS_ORIGINS env", () => {
  it("defaults to the Expo web dev server", () => {
    expect(loadEnv({ DATABASE_URL }).CORS_ORIGINS).toEqual(["http://localhost:8081"]);
  });

  it("parses a comma-separated list", () => {
    const env = loadEnv({ DATABASE_URL, CORS_ORIGINS: "http://localhost:8081, https://vagabonds.app" });
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:8081", "https://vagabonds.app"]);
  });

  it("rejects values that are not URLs", () => {
    expect(() => loadEnv({ DATABASE_URL, CORS_ORIGINS: "localhost" })).toThrow(/CORS_ORIGINS/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import type { PrismaClient } from "../src/db/prisma.ts";

function appWithDatabase(queryRaw: () => Promise<unknown>) {
  const prisma = { $queryRaw: vi.fn(queryRaw) } as unknown as PrismaClient;
  return buildApp({ prisma });
}

describe("GET /health", () => {
  let app: ReturnType<typeof buildApp> | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("returns 200 when the database is reachable", async () => {
    app = appWithDatabase(async () => [{ "?column?": 1 }]);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", db: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    app = appWithDatabase(async () => {
      throw new Error("connection refused");
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded", db: "down" });
  });
});

describe("error handling", () => {
  it("returns a structured 404 for unknown routes", async () => {
    const app = appWithDatabase(async () => []);

    const response = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Route GET /does-not-exist not found" },
    });
    await app.close();
  });
});

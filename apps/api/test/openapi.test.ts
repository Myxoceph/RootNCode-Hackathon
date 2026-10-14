import { CONTRACT_VERSION } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import type { PrismaClient } from "../src/db/prisma.ts";

describe("OpenAPI documentation", () => {
  const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as PrismaClient;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp({ prisma });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves an OpenAPI 3.1 document that covers every route", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    const doc = response.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.version).toBe(CONTRACT_VERSION);
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(["/health"]));
  });

  it("documents responses with Zod-generated schemas", async () => {
    const doc = (await app.inject({ method: "GET", url: "/docs/json" })).json();

    const health = doc.paths["/health"].get;
    expect(Object.keys(health.responses)).toEqual(expect.arrayContaining(["200", "503"]));
    const schema = health.responses["200"].content["application/json"].schema;
    expect(schema.required).toEqual(expect.arrayContaining(["status", "db", "uptimeSeconds", "timestamp"]));
  });

  it("serves the Swagger UI", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});

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
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(["/health", "/monuments", "/monuments/{slug}"]),
    );
  });

  it("documents responses with the shared contract schemas", async () => {
    const doc = (await app.inject({ method: "GET", url: "/docs/json" })).json();

    const list = doc.paths["/monuments"].get;
    expect(list.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ in: "query", name: "city" })]),
    );
    const listSchema = list.responses["200"].content["application/json"].schema;
    expect(listSchema.required).toEqual(
      expect.arrayContaining(["version", "generatedAt", "monuments", "cityCuisines"]),
    );

    const single = doc.paths["/monuments/{slug}"].get;
    expect(Object.keys(single.responses)).toEqual(expect.arrayContaining(["200", "400", "404"]));
  });

  it("serves the Swagger UI", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });
});

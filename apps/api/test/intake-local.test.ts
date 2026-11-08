/**
 * Veri Döngüsü's development guard (docs/plans/veri-dongusu.md §0, §5.4-5.5): with INTAKE_LOCAL_ONLY
 * nothing is written off this machine, and photos go to a local store served at /local-media.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadEnv, localMediaBaseUrl, localOnlyProblems } from "../src/config/env.ts";
import type { PrismaClient } from "../src/db/prisma.ts";
import { createLocalMediaStore, isSafeMediaKey } from "../src/modules/admin/media-store.ts";

const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as PrismaClient;
const LOCAL_DB = "postgresql://user:pass@localhost:5432/db";
const NO_R2 = { MEDIA_BASE_URL: "https://media.allbytech.com", MEDIA_S3_ENDPOINT: "", MEDIA_BUCKET: "", MEDIA_S3_ACCESS_KEY_ID: "", MEDIA_S3_SECRET_ACCESS_KEY: "" };

describe("INTAKE_LOCAL_ONLY", () => {
  it("lets a local database through, and says nothing when it is off", () => {
    expect(localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: LOCAL_DB, ...NO_R2 })).toEqual([]);
    expect(localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db", ...NO_R2 })).toEqual([]);
    expect(localOnlyProblems({ INTAKE_LOCAL_ONLY: false, DATABASE_URL: "postgresql://u:p@db.example.com:5432/db", ...NO_R2, MEDIA_BUCKET: "b" })).toEqual([]);
    // A Unix socket is on this machine too.
    expect(localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: "postgresql:///db?host=/tmp", ...NO_R2 })).toEqual([]);
    expect(localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: "postgresql://u@localhost/db?host=/var/run/postgresql", ...NO_R2 })).toEqual([]);
  });

  it("refuses a database on another machine", () => {
    const problems = localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: "postgresql://u:p@db.example.com:5432/db", ...NO_R2 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("db.example.com");
  });

  it("refuses R2 credentials", () => {
    const problems = localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: LOCAL_DB, ...NO_R2, MEDIA_BUCKET: "kok-kod-media-public" });
    expect(problems).toEqual([expect.stringContaining("MEDIA_BUCKET")]);
  });

  it("refuses MEDIA_BASE_URL on /local-media, which would redirect every missing photo to itself", () => {
    const problems = localOnlyProblems({ INTAKE_LOCAL_ONLY: true, DATABASE_URL: LOCAL_DB, ...NO_R2, MEDIA_BASE_URL: "http://localhost:3000/local-media" });
    expect(problems).toEqual([expect.stringContaining("LOCAL_MEDIA_BASE_URL")]);
  });

  it("gives media URLs on this API's own port unless told otherwise, and takes an empty value", () => {
    expect(localMediaBaseUrl(loadEnv({ DATABASE_URL: LOCAL_DB, INTAKE_LOCAL_ONLY: "true", PORT: "4000", LOCAL_MEDIA_BASE_URL: "" }))).toBe("http://localhost:4000/local-media");
    expect(localMediaBaseUrl(loadEnv({ DATABASE_URL: LOCAL_DB, LOCAL_MEDIA_BASE_URL: "http://192.168.1.5:3000/local-media/" }))).toBe("http://192.168.1.5:3000/local-media");
  });

  it("stops the API from starting when the environment would write off this machine", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/db", INTAKE_LOCAL_ONLY: "true" })).toThrow(/INTAKE_LOCAL_ONLY/);
    expect(loadEnv({ DATABASE_URL: LOCAL_DB, INTAKE_LOCAL_ONLY: "true" }).INTAKE_LOCAL_ONLY).toBe(true);
    expect(loadEnv({ DATABASE_URL: LOCAL_DB }).INTAKE_ENABLED).toBe(false);
    // "1" and "0" as well as "true" and "false".
    expect(loadEnv({ DATABASE_URL: LOCAL_DB, INTAKE_ENABLED: "1", INTAKE_LOCAL_ONLY: "1" })).toMatchObject({ INTAKE_ENABLED: true, INTAKE_LOCAL_ONLY: true });
    expect(loadEnv({ DATABASE_URL: LOCAL_DB, INTAKE_ENABLED: "0" }).INTAKE_ENABLED).toBe(false);
  });
});

describe("local media store", () => {
  const root = mkdtempSync(join(tmpdir(), "local-media-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("writes and removes keys under its folder, as the bucket would", async () => {
    const store = createLocalMediaStore(root);
    await store.put("assets/x/m01-abc/480.webp", Buffer.from("photo"), "image/webp");
    expect(readFileSync(join(root, "assets/x/m01-abc/480.webp"), "utf8")).toBe("photo");
    await store.remove("assets/x/m01-abc/480.webp");
    expect(existsSync(join(root, "assets/x/m01-abc/480.webp"))).toBe(false);
  });

  it("never writes outside its folder", async () => {
    const store = createLocalMediaStore(root);
    for (const key of ["../escape.txt", "/etc/passwd", "assets/../../x", "assets//x", "assets/./x", "a\\b", ".env", "assets/.git/config"]) {
      expect(isSafeMediaKey(key)).toBe(false);
      await expect(store.put(key, Buffer.from("x"), "text/plain")).rejects.toThrow(/Unsafe/);
    }
  });
});

describe("GET /local-media/*", () => {
  const dir = mkdtempSync(join(tmpdir(), "local-media-route-"));
  mkdirSync(join(dir, "assets/x/m01-abc"), { recursive: true });
  writeFileSync(join(dir, "assets/x/m01-abc/480.webp"), "photo");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const app = buildApp({ prisma, localMedia: { dir, fallbackBaseUrl: "https://media.example.com/" } });
  afterAll(() => app.close());

  it("serves what the local store has", async () => {
    const response = await app.inject({ method: "GET", url: "/local-media/assets/x/m01-abc/480.webp" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/webp");
    expect(response.headers["content-length"]).toBe("5");
    expect(response.body).toBe("photo");
  });

  it("sends a key it does not have to the shared media host", async () => {
    const response = await app.inject({ method: "GET", url: "/local-media/assets/y/m02-def/1280.webp" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://media.example.com/assets/y/m02-def/1280.webp");
  });

  it("refuses paths that leave its folder, without serving or redirecting them", async () => {
    for (const url of ["/local-media/assets/%2E%2E/%2E%2E/secret", "/local-media/../package.json"]) {
      const response = await app.inject({ method: "GET", url });
      expect([400, 404]).toContain(response.statusCode);
      expect(response.headers.location).toBeUndefined();
    }
    // A key the route itself reads and turns down.
    const odd = await app.inject({ method: "GET", url: "/local-media/assets/x/a%20b.webp" });
    expect(odd.statusCode).toBe(400);
    expect(odd.headers.location).toBeUndefined();
  });

  it("is not there unless asked for", async () => {
    const plain = buildApp({ prisma });
    const response = await plain.inject({ method: "GET", url: "/local-media/assets/x/m01-abc/480.webp" });
    expect(response.statusCode).toBe(404);
    await plain.close();
  });
});

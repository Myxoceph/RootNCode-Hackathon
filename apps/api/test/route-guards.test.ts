/**
 * Every admin and personal route refuses a caller without a token (401) and every admin route
 * refuses a plain visitor (403), so a new route that forgets `requireUser` fails here.
 * Real PostgreSQL (DATABASE_URL): the visitor's token is looked up.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { HTTPMethods } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

/** A well-formed value for each path parameter, so the guard is reached rather than a 400. */
function fillParams(url: string): string {
  return url
    .replace(/\/(users|contributions)\/:id/, `/$1/${randomUUID()}`)
    .replace(/:id/, "bursa-osmangazi-ulucami")
    .replace(/:code/, "vakif-kupa");
}

describe.skipIf(!DATABASE_URL)("route guards (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  let visitorId: string;
  const visitorToken = newToken();
  const routes: { method: string; url: string }[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
    app.addHook("onRoute", ({ method, url }) => {
      for (const m of [method].flat()) if (m !== "HEAD" && /^\/(admin|me)(\/|$)/.test(url)) routes.push({ method: m, url });
    });
    await app.ready();
    visitorId = (
      await prisma.app_user.create({ data: { nickname: "test-guard", sessions: { create: { token_hash: hashToken(visitorToken) } } } })
    ).id;
  });

  afterAll(async () => {
    await prisma.app_user.deleteMany({ where: { id: visitorId } });
    await app.close();
    await prisma.$disconnect();
  });

  it("finds the guarded routes", () => {
    expect(routes.filter((r) => r.url.startsWith("/admin")).length).toBeGreaterThanOrEqual(20);
    expect(routes.some((r) => r.url === "/me/visits")).toBe(true);
  });

  it("answers 401 without a token and 403 to a visitor on admin routes", async () => {
    const wrong: string[] = [];
    for (const { method, url } of routes) {
      const path = fillParams(url);
      const call = (headers: Record<string, string>) =>
        app.inject({ method: method as HTTPMethods, url: path, headers, ...(method !== "GET" && method !== "DELETE" && { payload: {} }) });
      const anonymous = (await call({})).statusCode;
      if (anonymous !== 401) wrong.push(`${method} ${url} without a token: ${anonymous}`);
      if (url.startsWith("/admin")) {
        const visitor = (await call({ authorization: `Bearer ${visitorToken}` })).statusCode;
        if (visitor !== 403) wrong.push(`${method} ${url} as a visitor: ${visitor}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

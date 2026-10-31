/**
 * Integration tests: real PostgreSQL (DATABASE_URL) for the assets, and a stand-in for
 * OpenTripPlanner that replays a recorded answer, so the tests never reach the network.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { TransitEntryPointsResponseSchema, TransitPlanResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { OtpPlanSchema, toItineraries, type TransitPlanner } from "../src/modules/transit/otp.client.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const KARATAY = "konya-selcuklu-karatay-medresesi";
const PLAN = OtpPlanSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/otp-plan-gar-karatay.json", import.meta.url), "utf8")));

describe.skipIf(!DATABASE_URL)("transit routes (PostgreSQL, recorded OTP)", () => {
  let prisma: PrismaClient;
  const apps: Array<ReturnType<typeof buildApp>> = [];
  const calls: Array<{ from: string; to: string; at: Date }> = [];
  const planner: TransitPlanner = {
    async plan(from, to, at) {
      calls.push({ from: from.name, to: to.name, at });
      return toItineraries(PLAN, { from, to });
    },
  };

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await prisma.$disconnect();
  });

  function appWith(transitPlanner: TransitPlanner | null) {
    const app = buildApp({ prisma, rateLimit: false, transitPlanner });
    apps.push(app);
    return app;
  }
  const plan = (app: ReturnType<typeof buildApp>, query: string) => app.inject({ method: "GET", url: `/transit/plan?${query}` });

  it("lists the three arrival points", async () => {
    const res = await appWith(planner).inject({ method: "GET", url: "/transit/entry-points?lang=en" });
    const body = TransitEntryPointsResponseSchema.parse(res.json());
    expect(body.items.map((item) => item.code)).toEqual(["konya-gari", "selcuklu-yht-gari", "konya-otogari"]);
    expect(body.items[0]!.name).toBe("Konya Railway Station");
  });

  it("plans from an arrival point to a Konya asset, naming both ends and the source", async () => {
    const app = appWith(planner);
    const res = await plan(app, `from=konya-gari&to=${KARATAY}&at=2026-11-07T10:00:00%2B03:00`);
    expect(res.statusCode, res.body).toBe(200);
    const body = TransitPlanResponseSchema.parse(res.json());
    expect(body.from.name).toBe("Konya Garı");
    expect(body.to).toMatchObject({ assetId: KARATAY, name: "Karatay Medresesi" });
    expect(body.itineraries[0]!.legs.some((leg) => leg.line?.name === "56-A")).toBe(true);
    expect(body.source.license).toBe("CC BY 4.0");
    expect(calls.at(-1)!.at.toISOString()).toBe("2026-11-07T07:00:00.000Z");

    // The popup asks again for the same trip within the minute: one OTP call.
    const before = calls.length;
    await plan(app, `from=konya-gari&to=${KARATAY}&at=2026-11-07T10:00:30%2B03:00`);
    expect(calls.length).toBe(before);
  });

  it("starts from the visitor's position inside Konya, and refuses other cities", async () => {
    const app = appWith(planner);
    expect((await plan(app, `from=37.87,32.48&to=${KARATAY}`)).statusCode).toBe(200);
    const istanbul = await plan(app, `from=41.01,28.97&to=${KARATAY}`);
    expect([istanbul.statusCode, istanbul.json().error.code]).toEqual([400, "TRANSIT_NOT_AVAILABLE_HERE"]);
    const bursa = await plan(app, "from=konya-gari&to=bursa-osmangazi-ulucami");
    expect([bursa.statusCode, bursa.json().error.code]).toEqual([400, "TRANSIT_NOT_AVAILABLE_HERE"]);
    expect((await plan(app, "from=konya-gari&to=konya-yok-boyle-bir-eser")).statusCode).toBe(404);
    expect((await plan(app, `from=Konya%20Gar%C4%B1&to=${KARATAY}`)).statusCode).toBe(400);
  });

  it("searches from the morning when nothing runs at night", async () => {
    const asked: Date[] = [];
    const nightOnly: TransitPlanner = {
      async plan(from, to, at) {
        asked.push(at);
        return asked.length === 1 ? [] : toItineraries(PLAN, { from, to });
      },
    };
    const res = await plan(appWith(nightOnly), `from=konya-gari&to=${KARATAY}&at=2026-11-07T01:20:00%2B03:00`);
    const body = TransitPlanResponseSchema.parse(res.json());
    expect(body.searchedFrom).toBe("2026-11-07T06:00:00+03:00");
    expect(body.itineraries.length).toBeGreaterThan(0);
    expect(asked).toHaveLength(2);
  });

  it("answers 503 without OpenTripPlanner, or when it does not answer", async () => {
    const off = await plan(appWith(null), `from=konya-gari&to=${KARATAY}`);
    expect([off.statusCode, off.json().error.code]).toEqual([503, "TRANSIT_UNAVAILABLE"]);
    const down = await plan(appWith({ plan: async () => null }), `from=konya-gari&to=${KARATAY}`);
    expect([down.statusCode, down.json().error.code]).toEqual([503, "TRANSIT_UNAVAILABLE"]);
  });
});

import { readFileSync } from "node:fs";
import { TransitItinerarySchema } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";
import {
  createOtpClient,
  decodePolyline,
  OtpPlanSchema,
  simplifyPath,
  toItineraries,
  turkeyOffsetTime,
} from "../src/modules/transit/otp.client.ts";

// A real answer of OTP 2.10.0 on the Konya graph: Konya Garı to Karatay Medresesi, 2026-11-07 10:00.
const PLAN = JSON.parse(readFileSync(new URL("./fixtures/otp-plan-gar-karatay.json", import.meta.url), "utf8"));
const ENDS = {
  from: { name: "Konya Garı", lat: 37.865336, lng: 32.475896 },
  to: { name: "Karatay Medresesi", lat: 37.875031, lng: 32.492897 },
};

describe("OTP plan mapping", () => {
  it("keeps the transit options, with the stops, lines and times of each leg", () => {
    const itineraries = toItineraries(OtpPlanSchema.parse(PLAN), ENDS);
    for (const it of itineraries) TransitItinerarySchema.parse(it);
    // OTP also proposed walking all the way; that is not a transit answer.
    expect(itineraries.every((it) => it.legs.some((leg) => leg.mode !== "walk"))).toBe(true);
    const [first] = itineraries;
    expect(first!.legs.map((leg) => [leg.mode, leg.line?.name ?? null])).toEqual([["walk", null], ["bus", "56-A"], ["walk", null]]);
    expect(first!.legs[1]).toMatchObject({ from: { name: "Millet" }, to: { name: "Alaaddin Turnike 1" } });
    expect(first!.departure).toMatch(/^2026-11-07T10:0\d:\d\d\+03:00$/);
  });

  it("names the ends as the visitor knows them, not as OTP's labels", () => {
    const [first] = toItineraries(OtpPlanSchema.parse(PLAN), ENDS);
    expect(first!.legs[0]!.from).toEqual({ ...ENDS.from, stopCode: null });
    expect(first!.legs.at(-1)!.to).toEqual({ ...ENDS.to, stopCode: null });
  });
});

describe("polyline", () => {
  it("decodes Google's encoding", () => {
    // The example in Google's documentation.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });

  it("drops points on a straight line but keeps the ends and the corners", () => {
    const line: Array<[number, number]> = [[37.87, 32.49], [37.8705, 32.49], [37.871, 32.49], [37.871, 32.491]];
    expect(simplifyPath(line)).toEqual([[37.87, 32.49], [37.871, 32.49], [37.871, 32.491]]);
  });
});

describe("OTP client", () => {
  it("asks for departures at Türkiye's time and returns null when OTP does not answer", async () => {
    expect(turkeyOffsetTime(new Date("2026-11-07T07:00:00Z"))).toBe("2026-11-07T10:00:00+03:00");
    const errors: unknown[] = [];
    const down = createOtpClient({
      baseUrl: "http://otp.test",
      fetchImpl: (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch,
      onError: (err) => errors.push(err),
    });
    expect(await down.plan(ENDS.from, ENDS.to, new Date())).toBeNull();
    expect(errors).toHaveLength(1);
  });
});

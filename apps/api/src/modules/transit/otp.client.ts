import type { TransitItinerary, TransitLeg, TransitMode } from "@vagabonds/contracts";
import { z } from "zod";
import type { Point } from "../assets/assets.network.ts";

/**
 * Client for OpenTripPlanner 2's GTFS GraphQL API (`/otp/gtfs/v1`), serving the Konya graph that
 * deploy/otp/prepare.sh builds. Returns null when OTP does not answer, so the API never fails with it.
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const ITINERARIES = 3;
// Path points closer than this to the simplified line are dropped; the map still follows the streets.
const SIMPLIFY_METERS = 4;

const PLAN_QUERY = `query Plan($from: PlanLabeledLocationInput!, $to: PlanLabeledLocationInput!, $at: OffsetDateTime!, $first: Int!) {
  planConnection(origin: $from, destination: $to, dateTime: { earliestDeparture: $at }, first: $first) {
    edges { node {
      start end duration walkDistance numberOfTransfers
      legs {
        mode duration distance headsign
        start { scheduledTime } end { scheduledTime }
        from { name lat lon stop { code } }
        to { name lat lon stop { code } }
        route { shortName longName color }
        intermediatePlaces { name }
        legGeometry { points }
      }
    } }
  }
}`;

const PlaceSchema = z.object({ name: z.string(), lat: z.number(), lon: z.number(), stop: z.object({ code: z.string().nullable() }).nullable() });

const LegSchema = z.object({
  mode: z.string(),
  duration: z.number(),
  distance: z.number(),
  headsign: z.string().nullable(),
  start: z.object({ scheduledTime: z.string() }),
  end: z.object({ scheduledTime: z.string() }),
  from: PlaceSchema,
  to: PlaceSchema,
  route: z.object({ shortName: z.string().nullable(), longName: z.string().nullable(), color: z.string().nullable() }).nullable(),
  intermediatePlaces: z.array(z.object({ name: z.string() })).nullable(),
  legGeometry: z.object({ points: z.string() }).nullable(),
});

/** The part of a `planConnection` answer we use. */
export const OtpPlanSchema = z.object({
  data: z.object({
    planConnection: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            start: z.string(),
            end: z.string(),
            duration: z.number(),
            walkDistance: z.number(),
            numberOfTransfers: z.number(),
            legs: z.array(LegSchema),
          }),
        }),
      ),
    }),
  }),
});

type OtpLeg = z.infer<typeof LegSchema>;

/** Decodes a Google encoded polyline (precision 5), the format of OTP's `legGeometry.points`. */
export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Douglas–Peucker on a local flat projection; keeps the first and last point. */
export function simplifyPath(points: Array<[number, number]>, toleranceMeters = SIMPLIFY_METERS): Array<[number, number]> {
  if (points.length <= 2) return points;
  const lat0 = (points[0]![0] * Math.PI) / 180;
  const xy = points.map(([lat, lng]) => [lng * 111_320 * Math.cos(lat0), lat * 110_540] as const);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = xy[first]!;
    const [bx, by] = xy[last]!;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let farthest = -1;
    let distance = toleranceMeters;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = xy[i]!;
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (d > distance) [farthest, distance] = [i, d];
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const MODES: Record<string, TransitMode> = { WALK: "walk", BUS: "bus", TRAM: "tram" };
const minutes = (seconds: number) => Math.round(seconds / 60);

function toLeg(leg: OtpLeg, start: Point, end: Point, fromName: string, toName: string, first: boolean, last: boolean): TransitLeg {
  const place = (p: OtpLeg["from"], fallback: Point, label: string, isEnd: boolean) =>
    isEnd
      ? { name: label, lat: fallback.lat, lng: fallback.lng, stopCode: null }
      : { name: p.name, lat: p.lat, lng: p.lon, stopCode: p.stop?.code ?? null };
  const from = place(leg.from, start, fromName, first);
  const to = place(leg.to, end, toName, last);
  const decoded = leg.legGeometry ? decodePolyline(leg.legGeometry.points) : [];
  const path = decoded.length >= 2 ? simplifyPath(decoded) : [[from.lat, from.lng] as [number, number], [to.lat, to.lng] as [number, number]];
  const mode = MODES[leg.mode] ?? "bus";
  return {
    mode,
    from,
    to,
    departure: leg.start.scheduledTime,
    arrival: leg.end.scheduledTime,
    durationMinutes: minutes(leg.duration),
    distanceMeters: Math.round(leg.distance),
    line:
      mode === "walk" || !leg.route
        ? null
        : {
            code: leg.route.shortName ?? leg.route.longName ?? "?",
            // Trams are renamed per language by the route (transit.places.ts).
            name: leg.route.shortName ?? leg.route.longName ?? "?",
            longName: leg.route.longName,
            color: leg.route.color && /^[0-9A-Fa-f]{6}$/.test(leg.route.color) ? `#${leg.route.color}` : null,
          },
    headsign: mode === "walk" ? null : leg.headsign,
    stopsBetween: leg.intermediatePlaces?.length ?? 0,
    path,
  };
}

/** OTP's itineraries in the contract's shape; the ends carry the names the visitor knows. */
export function toItineraries(
  plan: z.infer<typeof OtpPlanSchema>,
  ends: { from: Point & { name: string }; to: Point & { name: string } },
): TransitItinerary[] {
  return plan.data.planConnection.edges
    .map(({ node }) => node)
    // Walking only is not a transit answer; the map and the assistant say so instead.
    .filter((node) => node.legs.some((leg) => leg.mode !== "WALK"))
    .map((node) => ({
      departure: node.start,
      arrival: node.end,
      durationMinutes: minutes(node.duration),
      walkMeters: Math.round(node.walkDistance),
      transfers: node.numberOfTransfers,
      legs: node.legs.map((leg, i) =>
        toLeg(leg, ends.from, ends.to, ends.from.name, ends.to.name, i === 0, i === node.legs.length - 1),
      ),
    }));
}

export interface TransitPlanner {
  /** Itineraries leaving at or after `at`; null when OTP does not answer. */
  plan(from: Point & { name: string }, to: Point & { name: string }, at: Date): Promise<TransitItinerary[] | null>;
}

export interface OtpClientOptions {
  /** e.g. http://otp:8080 */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onError?: (err: unknown) => void;
}

/** "2026-11-07T10:00:00+03:00": OTP reads the offset, and Türkiye has no daylight saving. */
export function turkeyOffsetTime(at: Date): string {
  const local = new Date(at.getTime() + 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}+03:00`;
}

export function createOtpClient({ baseUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, onError }: OtpClientOptions): TransitPlanner {
  const url = `${baseUrl.replace(/\/+$/, "")}/otp/gtfs/v1`;
  const location = (p: Point & { name: string }) => ({ location: { coordinate: { latitude: p.lat, longitude: p.lng } }, label: p.name });
  return {
    async plan(from, to, at) {
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: PLAN_QUERY, variables: { from: location(from), to: location(to), at: turkeyOffsetTime(at), first: ITINERARIES } }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`OTP returned HTTP ${response.status}`);
        return toItineraries(OtpPlanSchema.parse(await response.json()), { from, to });
      } catch (err) {
        onError?.(err);
        return null;
      }
    },
  };
}

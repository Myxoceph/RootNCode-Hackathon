import type { VisitSetting } from "@vagabonds/contracts";
import { distanceMeters, type Point } from "../assets/assets.network.ts";

/** Streets are not straight: straight-line distance × 1.3 approximates the walking distance. */
export const DETOUR_FACTOR = 1.3;
/** Unhurried sightseeing pace. */
export const WALK_METERS_PER_MINUTE = 80;
/** A single leg longer than this is not offered as a walk. */
export const MAX_LEG_WALK_METERS = 3_000;

// Used while the dataset has no `visit` block (as of 2026-10 no record has one).
export const DEFAULT_VISIT_MINUTES: Record<string, number> = {
  kulliye: 45, cami: 25, mescit: 15, turbe: 15, hazire: 10, hamam: 20, medrese: 30, imaret: 15,
  darussifa: 15, mektep: 10, tekke: 15, han: 20, bedesten: 20, kervansaray: 25, cesme: 5, sivil: 10,
  makam: 10, kilise: 15, kutuphane: 10, namazgah: 5, kopru: 10, degirmen: 10, hoyuk: 15,
};
const FALLBACK_VISIT_MINUTES = 10;

export const DEFAULT_SETTING: Record<string, VisitSetting> = {
  cami: "indoor", mescit: "indoor", turbe: "indoor", hamam: "indoor", medrese: "indoor", imaret: "indoor",
  darussifa: "indoor", mektep: "indoor", tekke: "indoor", han: "indoor", bedesten: "indoor", kervansaray: "indoor",
  makam: "indoor", kilise: "indoor", kutuphane: "indoor",
  cesme: "outdoor", hazire: "outdoor", namazgah: "outdoor", kopru: "outdoor", degirmen: "outdoor", hoyuk: "outdoor",
  kulliye: "mixed", sivil: "mixed",
};

/** With `preferIndoor`, an outdoor site counts as this many times farther when choosing the next stop. */
const SETTING_PENALTY: Record<VisitSetting, number> = { indoor: 1, mixed: 1.5, outdoor: 3 };

export interface PlannerCandidate {
  id: string;
  point: Point | null;
  typeCode: string;
  /** From the dataset (`visit.estimated_duration_min`), when known. */
  visitMinutes: number | null;
  /** From the dataset (`visit.setting`), when known. */
  setting: VisitSetting | null;
}

export interface VisitProfile {
  visitMinutes: number;
  visitMinutesEstimated: boolean;
  setting: VisitSetting;
  settingEstimated: boolean;
}

export function visitProfile(candidate: Pick<PlannerCandidate, "typeCode" | "visitMinutes" | "setting">): VisitProfile {
  return {
    visitMinutes: candidate.visitMinutes ?? DEFAULT_VISIT_MINUTES[candidate.typeCode] ?? FALLBACK_VISIT_MINUTES,
    visitMinutesEstimated: candidate.visitMinutes === null,
    setting: candidate.setting ?? DEFAULT_SETTING[candidate.typeCode] ?? "mixed",
    settingEstimated: candidate.setting === null,
  };
}

export function walkMeters(a: Point, b: Point): number {
  return Math.round(distanceMeters(a, b) * DETOUR_FACTOR);
}

export function walkMinutes(meters: number): number {
  return Math.ceil(meters / WALK_METERS_PER_MINUTE);
}

export interface PlannedStop extends VisitProfile {
  id: string;
  legMeters: number;
  legMinutes: number;
  arrivalMinute: number;
}

export interface PlanInput {
  candidates: PlannerCandidate[];
  /** Where the walk starts; when null the route starts at `firstId` or else the densest located candidate. */
  start: Point | null;
  /** Candidate to begin with when no start point is given (the asset a network route is about). */
  firstId?: string;
  maxMinutes: number;
  preferIndoor: boolean;
}

export interface Plan {
  start: (Point & { source: StartSource }) | null;
  stops: PlannedStop[];
  walkMeters: number;
  walkMinutes: number;
  visitMinutes: number;
  skippedWithoutCoordinates: number;
  notReachedCount: number;
}

type Located = PlannerCandidate & { point: Point };
type StartSource = "query" | "theme_asset" | "densest_asset";

/** The located candidate with the smallest total distance to all others (ties: smaller id). */
function densest(located: Located[]): Located {
  let best = located[0] as Located;
  let bestSum = Infinity;
  for (const a of located) {
    const sum = located.reduce((total, b) => total + distanceMeters(a.point, b.point), 0);
    if (sum < bestSum || (sum === bestSum && a.id < best.id)) {
      best = a;
      bestSum = sum;
    }
  }
  return best;
}

/**
 * Greedy nearest-neighbour walk: from the current point, go to the closest site that
 * still fits the time budget (walk + visit) and is within the walking limit; with
 * `preferIndoor` outdoor sites count as farther. Stops when nothing else fits.
 */
export function planRoute({ candidates, start, firstId, maxMinutes, preferIndoor }: PlanInput): Plan {
  const located = candidates.filter((c): c is Located => c.point !== null);
  const skippedWithoutCoordinates = candidates.length - located.length;
  if (located.length === 0) {
    return {
      start: start && { ...start, source: "query" },
      stops: [],
      walkMeters: 0,
      walkMinutes: 0,
      visitMinutes: 0,
      skippedWithoutCoordinates,
      notReachedCount: 0,
    };
  }

  const remaining = new Map(located.map((c) => [c.id, c]));
  const stops: PlannedStop[] = [];
  let elapsed = 0;
  let walked = 0;
  let walkTime = 0;
  let visitTime = 0;

  const visit = (candidate: Located, legMeters: number): Point => {
    const profile = visitProfile(candidate);
    const legMinutes = walkMinutes(legMeters);
    stops.push({ id: candidate.id, legMeters, legMinutes, arrivalMinute: elapsed + legMinutes, ...profile });
    elapsed += legMinutes + profile.visitMinutes;
    walked += legMeters;
    walkTime += legMinutes;
    visitTime += profile.visitMinutes;
    remaining.delete(candidate.id);
    return candidate.point;
  };

  let here: Point;
  let startInfo: Plan["start"];
  if (start) {
    here = start;
    startInfo = { ...start, source: "query" };
  } else {
    const themed = located.find((c) => c.id === firstId);
    const first = themed ?? densest(located);
    startInfo = { ...first.point, source: themed ? "theme_asset" : "densest_asset" };
    here = visitProfile(first).visitMinutes <= maxMinutes ? visit(first, 0) : first.point;
  }

  for (;;) {
    let next: { candidate: Located; legMeters: number; score: number } | null = null;
    for (const candidate of remaining.values()) {
      const legMeters = walkMeters(here, candidate.point);
      if (legMeters > MAX_LEG_WALK_METERS) continue;
      const profile = visitProfile(candidate);
      if (elapsed + walkMinutes(legMeters) + profile.visitMinutes > maxMinutes) continue;
      const score = legMeters * (preferIndoor ? SETTING_PENALTY[profile.setting] : 1);
      if (!next || score < next.score || (score === next.score && candidate.id < next.candidate.id)) {
        next = { candidate, legMeters, score };
      }
    }
    if (!next) break;
    here = visit(next.candidate, next.legMeters);
  }

  return {
    start: startInfo,
    stops,
    walkMeters: walked,
    walkMinutes: walkTime,
    visitMinutes: visitTime,
    skippedWithoutCoordinates,
    notReachedCount: remaining.size,
  };
}

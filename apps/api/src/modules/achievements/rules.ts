import type { AchievementRule } from "@vagabonds/contracts";

/**
 * Achievement rules, evaluated from what a user has done. Pure, so every rule kind is
 * unit-tested without a database; the repository gathers the facts.
 */

export interface VisitFact {
  assetId: string;
  city: string;
  district: string;
  type: string;
  era: string | null;
  at: Date;
}

export interface UserFacts {
  /** First visits only, one per asset. */
  visits: VisitFact[];
  approved: { notes: number; photos: number };
  /** Visible children of each complex a `complex` rule names. */
  complexChildren: Map<string, string[]>;
}

export interface Progress {
  current: number;
  target: number;
}

const HOUR_MS = 60 * 60 * 1000;

/** The largest number of different keys among visits that fall within one `hours`-long window. */
function bestWindow(visits: VisitFact[], key: (v: VisitFact) => string, hours: number): number {
  const sorted = [...visits].sort((a, b) => a.at.getTime() - b.at.getTime());
  let best = 0;
  for (let start = 0; start < sorted.length; start++) {
    const end = sorted[start]!.at.getTime() + hours * HOUR_MS;
    const keys = new Set<string>();
    for (let i = start; i < sorted.length && sorted[i]!.at.getTime() <= end; i++) keys.add(key(sorted[i]!));
    best = Math.max(best, keys.size);
  }
  return best;
}

const districtKey = (v: VisitFact) => `${v.city}/${v.district.toLocaleLowerCase("tr")}`;
const capped = (current: number, target: number): Progress => ({ current: Math.min(current, target), target });

export function progressOf(rule: AchievementRule, facts: UserFacts): Progress {
  switch (rule.kind) {
    case "visit_count": {
      const district = rule.district?.toLocaleLowerCase("tr");
      const matching = facts.visits.filter(
        (v) =>
          (!rule.city || v.city === rule.city) &&
          (!district || v.district.toLocaleLowerCase("tr") === district) &&
          (!rule.types || rule.types.includes(v.type)) &&
          (!rule.era || v.era === rule.era),
      );
      return capped(matching.length, rule.count);
    }
    case "districts": {
      const visits = facts.visits.filter((v) => !rule.city || v.city === rule.city);
      return capped(new Set(visits.map(districtKey)).size, rule.count);
    }
    case "cities":
      return capped(new Set(facts.visits.map((v) => v.city)).size, rule.count);
    case "within": {
      const visits = facts.visits.filter((v) => !rule.city || v.city === rule.city);
      return capped(bestWindow(visits, rule.level === "district" ? districtKey : (v) => v.city, rule.hours), rule.count);
    }
    case "complex": {
      const children = facts.complexChildren.get(rule.parentId) ?? [];
      // A complex without visible buildings cannot be completed.
      if (children.length === 0) return { current: 0, target: 1 };
      const visited = new Set(facts.visits.map((v) => v.assetId));
      return { current: children.filter((id) => visited.has(id)).length, target: children.length };
    }
    case "contributions": {
      const { notes, photos } = facts.approved;
      const current = rule.contribution === "notes" ? notes : rule.contribution === "photos" ? photos : notes + photos;
      return capped(current, rule.count);
    }
  }
}

export const isEarned = (progress: Progress) => progress.current >= progress.target;

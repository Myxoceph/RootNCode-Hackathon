import type { AssetRelation, AssetSummary } from "@vagabonds/contracts";
import type { useTheme } from "@vagabonds/ui";

/** The three kinds of link the fog map draws, each in its own color. */
export type LinkGroup = "revenue" | "patron" | "style";

export const linkGroupLabel: Record<LinkGroup, string> = {
  revenue: "Gelir ve su",
  patron: "Aynı banî",
  style: "Aynı üslup",
};

/**
 * Relation types (data/enums.json) the fog map follows. `same_complex` and
 * `urban_context` are left out: they join next-door buildings, which leaves
 * no trail to follow and crowds the map.
 */
const groupOfType: Record<string, LinkGroup> = {
  waqf_income: "revenue",
  waqf_land: "revenue",
  water_supply: "revenue",
  same_founder: "patron",
  architectural_lineage: "style",
  same_architect: "style",
  same_craftsman: "style",
};

export function linkColor(group: LinkGroup, colors: ReturnType<typeof useTheme>["colors"]): string {
  return group === "revenue" ? colors.highlightMark : group === "patron" ? colors.warning : colors.success;
}

/** A link between two assets, once, however many of its ends record it. */
export interface NetworkLink {
  key: string;
  group: LinkGroup;
  /** The found asset whose relations listed it first, then the other end. */
  ends: [string, string];
  description: string;
}

/**
 * The links out of the found assets, and every asset they reach, by id.
 * Links to an asset without coordinates are skipped: there is nowhere to draw them.
 */
export function networkOf(found: string[], relationsById: Record<string, AssetRelation[]>) {
  const links: NetworkLink[] = [];
  const reached: Record<string, AssetSummary> = {};
  const seen = new Set<string>();
  for (const id of found) {
    for (const relation of relationsById[id] ?? []) {
      const group = groupOfType[relation.type.code];
      if (!group || !relation.asset.coordinates) continue;
      const other = relation.asset.id;
      const key = `${[id, other].sort().join("|")}|${group}`;
      reached[other] ??= relation.asset;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ key, group, ends: [id, other], description: relation.description });
    }
  }
  return { links, reached };
}

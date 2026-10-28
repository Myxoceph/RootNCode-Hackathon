import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { Point } from "../assets/assets.network.ts";
import { summarySelect, visibleStatuses, type AssetVisibility, type LabelRecord } from "../assets/assets.repository.ts";

export const candidateSelect = {
  ...summarySelect,
  type_code: true,
  visit_setting: true,
  visit_duration_min: true,
} satisfies Prisma.assetSelect;

export type CandidateRecord = Prisma.assetGetPayload<{ select: typeof candidateSelect }>;

export interface CandidateFilter {
  city: string;
  type?: string;
  era?: string;
  /** Restrict to these assets (network theme). */
  ids?: string[];
}

export interface PlannerRepository {
  findCity(code: string): Promise<LabelRecord | null>;
  /** Median position of the city's visible located assets; null when none has coordinates. */
  findCityPoint(code: string): Promise<Point | null>;
  findCandidates(filter: CandidateFilter): Promise<CandidateRecord[]>;
  /** Whether the asset is visible (served) at all. */
  isVisible(id: string): Promise<boolean>;
  /** Ids of the assets linked to `id` in either direction (Kentsel Ağ). */
  findLinkedIds(id: string): Promise<string[]>;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function createPlannerRepository(prisma: PrismaClient, visibility: AssetVisibility): PlannerRepository {
  const statuses = visibleStatuses(visibility);
  // Coordinates change only through imports; one computation per process is enough.
  const cityPoints = new Map<string, Point | null>();

  return {
    findCity(code) {
      return prisma.city.findUnique({ where: { code }, select: { code: true, label_tr: true, label_en: true } });
    },

    async findCityPoint(code) {
      if (cityPoints.has(code)) return cityPoints.get(code) ?? null;
      const rows = await prisma.asset.findMany({
        where: { city_code: code, status: { in: statuses }, lat: { not: null }, lng: { not: null } },
        select: { lat: true, lng: true },
      });
      const point = rows.length
        ? { lat: median(rows.map((r) => r.lat as number)), lng: median(rows.map((r) => r.lng as number)) }
        : null;
      cityPoints.set(code, point);
      return point;
    },

    findCandidates({ city, type, era, ids }) {
      return prisma.asset.findMany({
        where: {
          status: { in: statuses },
          city_code: city,
          ...(type && { type_code: type }),
          ...(era && { era_code: era }),
          ...(ids && { id: { in: ids } }),
        },
        select: candidateSelect,
        orderBy: { id: "asc" },
      });
    },

    async isVisible(id) {
      return (await prisma.asset.count({ where: { id, status: { in: statuses } } })) > 0;
    },

    async findLinkedIds(id) {
      const rows = await prisma.asset_relation.findMany({
        where: { OR: [{ source_asset_id: id }, { target_asset_id: id }] },
        select: { source_asset_id: true, target_asset_id: true },
      });
      return [...new Set(rows.map((r) => (r.source_asset_id === id ? r.target_asset_id : r.source_asset_id)))];
    },
  };
}

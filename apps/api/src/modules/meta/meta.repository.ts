import type { PrismaClient } from "../../generated/prisma/client.ts";
import { visibleStatuses, type AssetVisibility, type LabelRecord } from "../assets/assets.repository.ts";

const labelSelect = { code: true, label_tr: true, label_en: true } as const;

export interface MetaRecords {
  regions: LabelRecord[];
  cities: (LabelRecord & { region_code: string; plate: number | null })[];
  assetTypes: LabelRecord[];
  eras: LabelRecord[];
  relationTypes: LabelRecord[];
  timelineEventTypes: LabelRecord[];
  /** Visible assets per code; codes without assets are missing. */
  counts: { city: Map<string, number>; type: Map<string, number>; era: Map<string, number> };
}

export interface MetaRepository {
  load(): Promise<MetaRecords>;
}

export function createMetaRepository(prisma: PrismaClient, visibility: AssetVisibility): MetaRepository {
  const visible = { status: { in: visibleStatuses(visibility) } };

  async function countBy(field: "city_code" | "type_code" | "era_code"): Promise<Map<string, number>> {
    const groups = await prisma.asset.groupBy({ by: [field], where: visible, _count: { _all: true } });
    return new Map(
      groups.flatMap((group) => {
        const code = group[field];
        return code === null ? [] : [[code, group._count._all] as const];
      }),
    );
  }

  return {
    async load() {
      const [regions, cities, assetTypes, eras, relationTypes, timelineEventTypes, city, type, era] =
        await Promise.all([
          prisma.region.findMany({ select: labelSelect }),
          prisma.city.findMany({ select: { ...labelSelect, region_code: true, plate: true } }),
          prisma.asset_type.findMany({ select: labelSelect }),
          prisma.era.findMany({ select: labelSelect }),
          prisma.relation_type.findMany({ select: labelSelect }),
          prisma.timeline_event_type.findMany({ select: labelSelect }),
          countBy("city_code"),
          countBy("type_code"),
          countBy("era_code"),
        ]);
      return { regions, cities, assetTypes, eras, relationTypes, timelineEventTypes, counts: { city, type, era } };
    },
  };
}

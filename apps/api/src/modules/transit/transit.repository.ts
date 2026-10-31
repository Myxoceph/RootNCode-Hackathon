import type { PrismaClient } from "../../generated/prisma/client.ts";

export interface TransitAsset {
  id: string;
  name_tr: string;
  name_en: string | null;
  city_code: string;
  lat: number | null;
  lng: number | null;
}

export interface TransitRepository {
  /** A visible asset's name and point, or null when it is not visible. */
  findAsset(id: string): Promise<TransitAsset | null>;
}

export function createTransitRepository(prisma: PrismaClient, statuses: string[]): TransitRepository {
  return {
    findAsset(id) {
      return prisma.asset.findFirst({
        where: { id, status: { in: statuses } },
        select: { id: true, name_tr: true, name_en: true, city_code: true, lat: true, lng: true },
      });
    },
  };
}

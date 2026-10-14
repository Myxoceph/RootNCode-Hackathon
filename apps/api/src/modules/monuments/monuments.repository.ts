import type { City } from "@vagabonds/contracts";
import type { PrismaClient } from "../../db/prisma.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const relatedMonumentSelect = { id: true, slug: true, name: true } as const;

/** Everything a monument response needs, loaded in one query. */
export const monumentInclude = {
  inscriptions: { orderBy: { id: "asc" } },
  // Only moderated tips are public.
  visitorTips: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" } },
  outgoingRelations: { include: { target: { select: relatedMonumentSelect } } },
  incomingRelations: { include: { source: { select: relatedMonumentSelect } } },
} satisfies Prisma.MonumentInclude;

export type MonumentRecord = Prisma.MonumentGetPayload<{ include: typeof monumentInclude }>;

export interface MonumentFilter {
  city?: City;
}

export function createMonumentsRepository(prisma: PrismaClient) {
  return {
    findMany(filter: MonumentFilter = {}): Promise<MonumentRecord[]> {
      return prisma.monument.findMany({
        where: filter.city ? { city: filter.city } : {},
        include: monumentInclude,
        orderBy: { slug: "asc" },
      });
    },

    findBySlug(slug: string): Promise<MonumentRecord | null> {
      return prisma.monument.findUnique({ where: { slug }, include: monumentInclude });
    },

    findCityCuisines(filter: MonumentFilter = {}) {
      return prisma.cityCuisine.findMany({
        where: filter.city ? { city: filter.city } : {},
        orderBy: [{ city: "asc" }, { dishName: "asc" }],
      });
    },
  };
}

export type MonumentsRepository = ReturnType<typeof createMonumentsRepository>;

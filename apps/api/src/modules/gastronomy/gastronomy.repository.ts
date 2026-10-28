import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { visibleStatuses, type AssetVisibility, type LabelRecord } from "../assets/assets.repository.ts";

export const dishSelect = {
  id: true,
  kind: true,
  name_tr: true,
  name_en: true,
  description_tr: true,
  description_en: true,
  story_tr: true,
  story_en: true,
  district: true,
  gi_portal_id: true,
  gi_registration_number: true,
  gi_registered_on: true,
  gi_type: true,
  gi_registrant: true,
  gi_document_url: true,
  source_url: true,
  confidence: true,
  source: { select: { id: true, title_tr: true, title_en: true } },
} satisfies Prisma.city_dishSelect;

export type DishRecord = Prisma.city_dishGetPayload<{ select: typeof dishSelect }>;

export interface GastronomyRepository {
  findCity(code: string): Promise<LabelRecord | null>;
  /** The city's visible dishes in the data team's order. */
  findDishes(city: string): Promise<DishRecord[]>;
}

export function createGastronomyRepository(prisma: PrismaClient, visibility: AssetVisibility): GastronomyRepository {
  // Dishes follow the same draft → in_review → published flow as assets.
  const statuses = visibleStatuses(visibility);
  return {
    findCity(code) {
      return prisma.city.findUnique({ where: { code }, select: { code: true, label_tr: true, label_en: true } });
    },
    findDishes(city) {
      return prisma.city_dish.findMany({
        where: { city_code: city, status: { in: statuses } },
        select: dishSelect,
        orderBy: { sort_order: "asc" },
      });
    },
  };
}

import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { visibleStatuses, type AssetVisibility } from "../assets/assets.repository.ts";

export const soundSelect = {
  key: true,
  title_tr: true,
  title_en: true,
  file_key: true,
  duration_seconds: true,
  captions: true,
  license: true,
  author: true,
  source_url: true,
} satisfies Prisma.soundSelect;

export type SoundRecord = Prisma.soundGetPayload<{ select: typeof soundSelect }>;

export interface SoundsRepository {
  /** Visible recordings in the data team's order. */
  findAll(): Promise<SoundRecord[]>;
  /** The visible recording for an ambient sound key, if any. */
  findByKey(key: string): Promise<SoundRecord | null>;
}

export function createSoundsRepository(prisma: PrismaClient, visibility: AssetVisibility): SoundsRepository {
  // Recordings follow the same draft → in_review → published flow as assets.
  const statuses = visibleStatuses(visibility);
  return {
    findAll() {
      return prisma.sound.findMany({ where: { status: { in: statuses } }, select: soundSelect, orderBy: { sort_order: "asc" } });
    },
    findByKey(key) {
      return prisma.sound.findFirst({ where: { key, status: { in: statuses } }, select: soundSelect });
    },
  };
}

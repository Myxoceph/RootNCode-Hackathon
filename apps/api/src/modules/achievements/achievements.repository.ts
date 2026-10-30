import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { UserFacts } from "./rules.ts";

export type AchievementRecord = Prisma.achievementGetPayload<object>;

export interface AchievementsRepository {
  /** A visible asset's point (null lat/lng when it has none), or null when it is not visible. */
  findAsset(id: string): Promise<{ id: string; lat: number | null; lng: number | null } | null>;
  /** Records the first visit; false when the user had already visited the asset. */
  recordVisit(data: { userId: string; assetId: string; verified: boolean; distance: number | null }): Promise<boolean>;
  countVisitsSince(userId: string, since: Date): Promise<number>;
  facts(userId: string, complexIds: string[]): Promise<UserFacts>;
  listAchievements(options: { activeOnly: boolean }): Promise<AchievementRecord[]>;
  earnedCounts(): Promise<Map<string, number>>;
  earnedBy(userId: string): Promise<Map<string, Date>>;
  /** Records the achievements as earned now; ones already earned keep their date. */
  award(userId: string, codes: string[]): Promise<void>;
  findAchievement(code: string): Promise<AchievementRecord | null>;
  createAchievement(data: Prisma.achievementUncheckedCreateInput): Promise<AchievementRecord>;
  updateAchievement(code: string, data: Prisma.achievementUncheckedUpdateInput): Promise<AchievementRecord>;
  deleteAchievement(code: string): Promise<boolean>;
  /** Descriptions of the codes and ids a rule refers to that do not exist. */
  missingRefs(refs: { city?: string | undefined; era?: string | undefined; parentId?: string | undefined }): Promise<string[]>;
}

export function createAchievementsRepository(prisma: PrismaClient, statuses: string[]): AchievementsRepository {
  return {
    findAsset(id) {
      return prisma.asset.findFirst({ where: { id, status: { in: statuses } }, select: { id: true, lat: true, lng: true } });
    },

    async recordVisit({ userId, assetId, verified, distance }) {
      const { count } = await prisma.visit.createMany({
        data: [{ user_id: userId, asset_id: assetId, verified, distance_m: distance }],
        skipDuplicates: true,
      });
      return count > 0;
    },

    countVisitsSince(userId, since) {
      return prisma.visit.count({ where: { user_id: userId, visited_at: { gte: since } } });
    },

    async facts(userId, complexIds) {
      const [visits, notes, photos, children] = await Promise.all([
        prisma.visit.findMany({
          where: { user_id: userId, asset: { status: { in: statuses } } },
          select: {
            visited_at: true,
            asset: { select: { id: true, city_code: true, district: true, type_code: true, era_code: true } },
          },
        }),
        prisma.contribution.count({ where: { user_id: userId, status: "approved", kind: { not: "photo" } } }),
        prisma.contribution.count({ where: { user_id: userId, status: "approved", kind: "photo" } }),
        complexIds.length === 0
          ? []
          : prisma.asset.findMany({
              where: { parent_id: { in: complexIds }, status: { in: statuses } },
              select: { id: true, parent_id: true },
            }),
      ]);
      const complexChildren = new Map<string, string[]>();
      for (const child of children) {
        const parent = child.parent_id!;
        complexChildren.set(parent, [...(complexChildren.get(parent) ?? []), child.id]);
      }
      return {
        visits: visits.map(({ visited_at, asset }) => ({
          assetId: asset.id,
          city: asset.city_code,
          district: asset.district,
          type: asset.type_code,
          era: asset.era_code,
          at: visited_at,
        })),
        approved: { notes, photos },
        complexChildren,
      };
    },

    listAchievements({ activeOnly }) {
      return prisma.achievement.findMany({
        where: activeOnly ? { active: true } : {},
        orderBy: [{ sort_order: "asc" }, { code: "asc" }],
      });
    },

    async earnedCounts() {
      const rows = await prisma.user_achievement.groupBy({ by: ["achievement_code"], _count: { _all: true } });
      return new Map(rows.map((r) => [r.achievement_code, r._count._all]));
    },

    async earnedBy(userId) {
      const rows = await prisma.user_achievement.findMany({ where: { user_id: userId } });
      return new Map(rows.map((r) => [r.achievement_code, r.earned_at]));
    },

    async award(userId, codes) {
      if (codes.length === 0) return;
      await prisma.user_achievement.createMany({
        data: codes.map((code) => ({ user_id: userId, achievement_code: code })),
        skipDuplicates: true,
      });
    },

    findAchievement(code) {
      return prisma.achievement.findUnique({ where: { code } });
    },

    createAchievement(data) {
      return prisma.achievement.create({ data });
    },

    updateAchievement(code, data) {
      return prisma.achievement.update({ where: { code }, data });
    },

    async deleteAchievement(code) {
      const { count } = await prisma.achievement.deleteMany({ where: { code } });
      return count > 0;
    },

    async missingRefs({ city, era, parentId }) {
      const [cityRow, eraRow, parentRow] = await Promise.all([
        city ? prisma.city.findUnique({ where: { code: city }, select: { code: true } }) : null,
        era ? prisma.era.findUnique({ where: { code: era }, select: { code: true } }) : null,
        parentId ? prisma.asset.findUnique({ where: { id: parentId }, select: { id: true } }) : null,
      ]);
      return [
        city && !cityRow && `city "${city}"`,
        era && !eraRow && `era "${era}"`,
        parentId && !parentRow && `asset "${parentId}"`,
      ].filter((x): x is string => typeof x === "string");
    },
  };
}

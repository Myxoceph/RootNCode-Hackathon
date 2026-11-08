import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { UserFacts } from "./rules.ts";

/** With the badge picture's hash, if there is one, for its address; not its bytes. */
const withImage = { image: { select: { sha256: true } } } as const;
export type AchievementRecord = Prisma.achievementGetPayload<{ include: typeof withImage }>;

/** A badge picture as stored: checked and without metadata. */
export interface AchievementImage {
  contentType: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  sha256: string;
}

export interface AchievementsRepository {
  /** A visible asset's point (null lat/lng when it has none), or null when it is not visible. */
  findAsset(id: string): Promise<{ id: string; lat: number | null; lng: number | null; coord_source: string | null } | null>;
  /** Records the first visit; false when the user had already visited the asset. */
  recordVisit(data: { userId: string; assetId: string; verified: boolean; distance: number | null }): Promise<boolean>;
  countVisitsSince(userId: string, since: Date): Promise<number>;
  /** The user's visits to visible assets, newest first. */
  listVisits(userId: string): Promise<{ asset_id: string; visited_at: Date; verified: boolean; proven_at: Date | null }[]>;
  /** The bonds of the user's visited assets (both ends) and the visible assets at their ends. */
  connections(userId: string): Promise<ConnectionRecords>;
  /** Whether the asset has a photo with this media key. */
  hasMedia(assetId: string, mediaKey: string): Promise<boolean>;
  /** Records the visit if new and marks it proven; false for `firstVisit` when it existed. */
  proveVisit(data: { userId: string; assetId: string; verified: boolean; distance: number | null; method: string }): Promise<boolean>;
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
  /** Puts the badge picture, in place of an earlier one. */
  saveImage(code: string, image: AchievementImage): Promise<AchievementRecord>;
  /** Removes the badge picture; false when there was none. */
  deleteImage(code: string): Promise<boolean>;
  findImage(code: string): Promise<{ contentType: string; bytes: Uint8Array } | null>;
  /** Descriptions of the codes and ids a rule refers to that do not exist. */
  missingRefs(refs: { city?: string | undefined; era?: string | undefined; parentId?: string | undefined }): Promise<string[]>;
}

/** Bonds that tell no story of their own: a complex's own buildings, and "right next to it". */
export const UNTOLD_RELATION_TYPES = ["same_complex", "urban_context"];

export interface ConnectionRecords {
  visited: Set<string>;
  relations: {
    source_asset_id: string;
    target_asset_id: string;
    description_tr: string;
    description_en: string | null;
    confidence: string;
    relation_type: { code: string; label_tr: string; label_en: string | null };
  }[];
  assets: {
    id: string;
    name_tr: string;
    name_en: string | null;
    lat: number | null;
    lng: number | null;
    coord_verified: boolean;
    coord_source: string | null;
  }[];
}

export function createAchievementsRepository(prisma: PrismaClient, statuses: string[]): AchievementsRepository {
  return {
    findAsset(id) {
      return prisma.asset.findFirst({ where: { id, status: { in: statuses } }, select: { id: true, lat: true, lng: true, coord_source: true } });
    },

    async recordVisit({ userId, assetId, verified, distance }) {
      const { count } = await prisma.visit.createMany({
        data: [{ user_id: userId, asset_id: assetId, verified, distance_m: distance }],
        skipDuplicates: true,
      });
      return count > 0;
    },

    async hasMedia(assetId, mediaKey) {
      return (await prisma.asset_media.count({ where: { asset_id: assetId, media_key: mediaKey } })) > 0;
    },

    async proveVisit({ userId, assetId, verified, distance, method }) {
      const firstVisit = await this.recordVisit({ userId, assetId, verified, distance });
      // The first proof counts; a verified position upgrades an earlier unchecked visit.
      await prisma.visit.updateMany({
        where: { user_id: userId, asset_id: assetId, proven_at: null },
        data: { proven_at: new Date(), proof_method: method, ...(verified && { verified: true, distance_m: distance }) },
      });
      return firstVisit;
    },

    countVisitsSince(userId, since) {
      return prisma.visit.count({ where: { user_id: userId, visited_at: { gte: since } } });
    },

    async connections(userId) {
      const visits = await prisma.visit.findMany({ where: { user_id: userId, asset: { status: { in: statuses } } }, select: { asset_id: true } });
      const visited = new Set(visits.map((v) => v.asset_id));
      if (visited.size === 0) return { visited, relations: [], assets: [] };
      const ids = [...visited];
      const relations = await prisma.asset_relation.findMany({
        where: {
          type_code: { notIn: UNTOLD_RELATION_TYPES },
          OR: [{ source_asset_id: { in: ids } }, { target_asset_id: { in: ids } }],
        },
        select: {
          source_asset_id: true,
          target_asset_id: true,
          description_tr: true,
          description_en: true,
          confidence: true,
          relation_type: { select: { code: true, label_tr: true, label_en: true } },
        },
        orderBy: { id: "asc" },
      });
      const ends = [...new Set(relations.flatMap((r) => [r.source_asset_id, r.target_asset_id]))];
      const assets = await prisma.asset.findMany({
        where: { id: { in: ends }, status: { in: statuses } },
        select: { id: true, name_tr: true, name_en: true, lat: true, lng: true, coord_verified: true, coord_source: true },
      });
      return { visited, relations, assets };
    },

    listVisits(userId) {
      return prisma.visit.findMany({
        where: { user_id: userId, asset: { status: { in: statuses } } },
        select: { asset_id: true, visited_at: true, verified: true, proven_at: true },
        orderBy: [{ visited_at: "desc" }, { asset_id: "asc" }],
      });
    },

    async facts(userId, complexIds) {
      const [visits, contributions, children, inscriptions] = await Promise.all([
        prisma.visit.findMany({
          where: { user_id: userId, asset: { status: { in: statuses } } },
          select: {
            visited_at: true,
            proven_at: true,
            asset: { select: { id: true, city_code: true, district: true, type_code: true, era_code: true } },
          },
        }),
        prisma.contribution.groupBy({
          by: ["kind", "status"],
          where: { user_id: userId, status: { in: ["approved", "pending"] } },
          _count: { _all: true },
        }),
        complexIds.length === 0
          ? []
          : prisma.asset.findMany({
              where: { parent_id: { in: complexIds }, status: { in: statuses } },
              select: { id: true, parent_id: true },
            }),
        // Kitabe Gönüllüleri: an inscription counts once the pipeline has published it (applied_at).
        Promise.all([
          prisma.intake_draft.count({ where: { kind: "inscription", created_by: userId, status: "approved", applied_at: { not: null } } }),
          prisma.intake_draft.count({ where: { kind: "inscription", created_by: userId, status: "pending" } }),
        ]),
      ]);
      const [published, waiting] = inscriptions;
      const count = (status: string, photo: boolean) =>
        contributions
          .filter((group) => group.status === status && (group.kind === "photo") === photo)
          .reduce((sum, group) => sum + group._count._all, 0);
      const complexChildren = new Map<string, string[]>();
      for (const child of children) {
        const parent = child.parent_id!;
        complexChildren.set(parent, [...(complexChildren.get(parent) ?? []), child.id]);
      }
      return {
        visits: visits.map(({ visited_at, proven_at, asset }) => ({
          assetId: asset.id,
          city: asset.city_code,
          district: asset.district,
          type: asset.type_code,
          era: asset.era_code,
          at: visited_at,
          proven: proven_at !== null,
        })),
        approved: { notes: count("approved", false), photos: count("approved", true), inscriptions: published },
        pending: { notes: count("pending", false), photos: count("pending", true), inscriptions: waiting },
        complexChildren,
      };
    },

    listAchievements({ activeOnly }) {
      return prisma.achievement.findMany({
        where: activeOnly ? { active: true } : {},
        include: withImage,
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
      return prisma.achievement.findUnique({ where: { code }, include: withImage });
    },

    createAchievement(data) {
      return prisma.achievement.create({ data, include: withImage });
    },

    updateAchievement(code, data) {
      return prisma.achievement.update({ where: { code }, data, include: withImage });
    },

    async saveImage(code, image) {
      const file = { content_type: image.contentType, bytes: Buffer.from(image.bytes), width: image.width, height: image.height, sha256: image.sha256, updated_at: new Date() };
      await prisma.achievement_image.upsert({ where: { achievement_code: code }, create: { achievement_code: code, ...file }, update: file });
      return prisma.achievement.findUniqueOrThrow({ where: { code }, include: withImage });
    },

    async deleteImage(code) {
      const { count } = await prisma.achievement_image.deleteMany({ where: { achievement_code: code } });
      return count > 0;
    },

    async findImage(code) {
      const image = await prisma.achievement_image.findUnique({ where: { achievement_code: code }, select: { content_type: true, bytes: true } });
      return image ? { contentType: image.content_type, bytes: image.bytes } : null;
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

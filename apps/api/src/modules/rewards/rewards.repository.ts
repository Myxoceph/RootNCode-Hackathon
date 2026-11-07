import { ACTIVITY_POINTS } from "@vagabonds/contracts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

export type RewardRecord = Prisma.rewardGetPayload<object>;

const redemptionSelect = {
  id: true,
  points: true,
  created_at: true,
  issued_code: { select: { code: true } },
  reward: { select: { code: true, title_tr: true, title_en: true, partner: true, kind: true, art: true } },
} satisfies Prisma.redemptionSelect;

export type RedemptionRecord = Prisma.redemptionGetPayload<{ select: typeof redemptionSelect }>;

export interface WalletTotals {
  earned: number;
  spent: number;
  provenVisits: number;
}

export type RedeemResult =
  | { ok: true; redemption: RedemptionRecord; balance: number }
  | { ok: false; reason: "not_found" | "proven_visits" | "points" | "stock"; needed?: number };

export interface RewardsRepository {
  listRewards(options: { activeOnly: boolean }): Promise<RewardRecord[]>;
  /** Codes left per reward. */
  stock(): Promise<Map<string, number>>;
  /** Codes uploaded and used per reward. */
  codeCounts(): Promise<Map<string, { total: number; used: number }>>;
  totals(userId: string): Promise<WalletTotals>;
  redemptions(userId: string): Promise<RedemptionRecord[]>;
  /** Spends the points and takes a free code in one transaction: never twice for one balance or one code. */
  redeem(userId: string, rewardCode: string): Promise<RedeemResult>;
  findReward(code: string): Promise<RewardRecord | null>;
  createReward(data: Prisma.rewardUncheckedCreateInput): Promise<RewardRecord>;
  updateReward(code: string, data: Prisma.rewardUncheckedUpdateInput): Promise<RewardRecord>;
  /** Adds the codes not uploaded yet; returns how many were new. */
  addCodes(rewardCode: string, codes: string[]): Promise<number>;
}

type Db = Prisma.TransactionClient | PrismaClient;

/** Badge points plus activity points (`ACTIVITY_POINTS`), as `GET /me/achievements` adds them up. */
async function totalsIn(db: Db, userId: string): Promise<WalletTotals> {
  const [earned, spent, visits, provenVisits, notes, photos] = await Promise.all([
    db.$queryRaw<[{ sum: bigint | null }]>`
      SELECT sum(a.points) AS sum FROM user_achievement ua JOIN achievement a ON a.code = ua.achievement_code
      WHERE ua.user_id = ${userId}::uuid`,
    db.redemption.aggregate({ where: { user_id: userId }, _sum: { points: true } }),
    db.visit.count({ where: { user_id: userId } }),
    db.visit.count({ where: { user_id: userId, proven_at: { not: null } } }),
    db.contribution.count({ where: { user_id: userId, status: "approved", kind: { not: "photo" } } }),
    db.contribution.count({ where: { user_id: userId, status: "approved", kind: "photo" } }),
  ]);
  const activity =
    visits * ACTIVITY_POINTS.visit + provenVisits * ACTIVITY_POINTS.sealed + notes * ACTIVITY_POINTS.note + photos * ACTIVITY_POINTS.photo;
  return { earned: Number(earned[0].sum ?? 0) + activity, spent: spent._sum.points ?? 0, provenVisits };
}

export function createRewardsRepository(prisma: PrismaClient): RewardsRepository {
  return {
    listRewards({ activeOnly }) {
      return prisma.reward.findMany({
        where: activeOnly ? { active: true } : {},
        orderBy: [{ sort_order: "asc" }, { code: "asc" }],
      });
    },

    async stock() {
      const rows = await prisma.$queryRaw<{ reward_code: string; free: bigint }[]>`
        SELECT rc.reward_code, count(*) AS free FROM reward_code rc
        WHERE NOT EXISTS (SELECT 1 FROM redemption r WHERE r.code_id = rc.id)
        GROUP BY rc.reward_code`;
      return new Map(rows.map((r) => [r.reward_code, Number(r.free)]));
    },

    async codeCounts() {
      const rows = await prisma.$queryRaw<{ reward_code: string; total: bigint; used: bigint }[]>`
        SELECT rc.reward_code, count(*) AS total, count(r.id) AS used FROM reward_code rc
        LEFT JOIN redemption r ON r.code_id = rc.id GROUP BY rc.reward_code`;
      return new Map(rows.map((r) => [r.reward_code, { total: Number(r.total), used: Number(r.used) }]));
    },

    totals(userId) {
      return totalsIn(prisma, userId);
    },

    redemptions(userId) {
      return prisma.redemption.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        select: redemptionSelect,
      });
    },

    redeem(userId, rewardCode) {
      return prisma.$transaction(async (tx): Promise<RedeemResult> => {
        // One redemption per user at a time, so two requests cannot both spend the same balance.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const reward = await tx.reward.findFirst({ where: { code: rewardCode, active: true } });
        if (!reward) return { ok: false, reason: "not_found" };
        const totals = await totalsIn(tx, userId);
        if (totals.provenVisits < reward.min_proven_visits) {
          return { ok: false, reason: "proven_visits", needed: reward.min_proven_visits };
        }
        if (totals.earned - totals.spent < reward.cost_points) {
          return { ok: false, reason: "points", needed: reward.cost_points };
        }
        // SKIP LOCKED: two users redeeming at once take two different codes.
        const [free] = await tx.$queryRaw<{ id: string }[]>`
          SELECT rc.id FROM reward_code rc
          WHERE rc.reward_code = ${rewardCode} AND NOT EXISTS (SELECT 1 FROM redemption r WHERE r.code_id = rc.id)
          ORDER BY rc.created_at, rc.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!free) return { ok: false, reason: "stock" };
        const redemption = await tx.redemption.create({
          data: { user_id: userId, reward_code: rewardCode, code_id: free.id, points: reward.cost_points },
          select: redemptionSelect,
        });
        return { ok: true, redemption, balance: totals.earned - totals.spent - reward.cost_points };
      });
    },

    findReward(code) {
      return prisma.reward.findUnique({ where: { code } });
    },

    createReward(data) {
      return prisma.reward.create({ data });
    },

    updateReward(code, data) {
      return prisma.reward.update({ where: { code }, data });
    },

    async addCodes(rewardCode, codes) {
      const { count } = await prisma.reward_code.createMany({
        data: codes.map((code) => ({ reward_code: rewardCode, code })),
        skipDuplicates: true,
      });
      return count;
    },
  };
}

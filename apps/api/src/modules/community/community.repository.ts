import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

const userSelect = {
  id: true,
  nickname: true,
  role: true,
  created_at: true,
  banned_at: true,
} satisfies Prisma.app_userSelect;

export type UserRecord = Prisma.app_userGetPayload<{ select: typeof userSelect }>;

const contributionSelect = {
  id: true,
  asset_id: true,
  kind: true,
  body: true,
  status: true,
  created_at: true,
  reviewed_at: true,
  reject_reason: true,
} satisfies Prisma.contributionSelect;

export type ContributionRecord = Prisma.contributionGetPayload<{ select: typeof contributionSelect }>;

const moderationSelect = {
  ...contributionSelect,
  asset: { select: { id: true, name_tr: true, name_en: true } },
  user: { select: { id: true, nickname: true, banned_at: true } },
  reviewer: { select: { id: true, nickname: true } },
} satisfies Prisma.contributionSelect;

export type ModerationRecord = Prisma.contributionGetPayload<{ select: typeof moderationSelect }>;

const pulseSelect = {
  ...contributionSelect,
  user: { select: { nickname: true } },
} satisfies Prisma.contributionSelect;

export type PulseContributionRecord = Prisma.contributionGetPayload<{ select: typeof pulseSelect }>;

export interface VisibleAsset {
  id: string;
  name_tr: string;
  name_en: string | null;
}

export interface PulseRecords {
  tips: { id: bigint; text_tr: string; text_en: string | null; origin: string; collected_at: Date | null }[];
  community: PulseContributionRecord[];
  communityTotal: number;
}

export type ContributionStatus = "pending" | "approved" | "rejected";
export type ReviewDecision = { status: "approved" } | { status: "rejected"; reason: string };

export interface CommunityRepository {
  createUser(data: { nickname: string; role: "visitor" | "moderator"; tokenHash: string }): Promise<UserRecord>;
  findUserByTokenHash(tokenHash: string): Promise<UserRecord | null>;
  /** The asset if clients may see it (and so may contribute to it), otherwise null. */
  findVisibleAsset(id: string, statuses: string[]): Promise<VisibleAsset | null>;
  countContributionsSince(userId: string, since: Date): Promise<number>;
  createContribution(data: { assetId: string; userId: string; kind: string; body: string }): Promise<ContributionRecord>;
  listUserContributions(userId: string, limit: number): Promise<ContributionRecord[]>;
  findPulse(assetId: string, limit: number): Promise<PulseRecords>;
  findQueue(query: { status: ContributionStatus; limit: number; offset: number }): Promise<{
    total: number;
    items: ModerationRecord[];
  }>;
  /** Reviews a pending contribution. The status filter makes concurrent reviews safe. */
  review(id: string, reviewerId: string, decision: ReviewDecision): Promise<ModerationRecord | "not_found" | "already_reviewed">;
  /** Bans a visitor; false when no such visitor exists. Moderators cannot be banned this way. */
  banVisitor(id: string): Promise<boolean>;
}

/** Only these kinds appear in the public pulse; corrections go to the editors only. */
const PULSE_KINDS = ["tip", "memory"];

export function createCommunityRepository(prisma: PrismaClient): CommunityRepository {
  const approvedFrom = (assetId: string): Prisma.contributionWhereInput => ({
    asset_id: assetId,
    status: "approved",
    kind: { in: PULSE_KINDS },
    user: { banned_at: null },
  });

  return {
    createUser({ nickname, role, tokenHash }) {
      return prisma.app_user.create({ data: { nickname, role, token_hash: tokenHash }, select: userSelect });
    },

    findUserByTokenHash(tokenHash) {
      return prisma.app_user.findUnique({ where: { token_hash: tokenHash }, select: userSelect });
    },

    findVisibleAsset(id, statuses) {
      return prisma.asset.findFirst({
        where: { id, status: { in: statuses } },
        select: { id: true, name_tr: true, name_en: true },
      });
    },

    countContributionsSince(userId, since) {
      return prisma.contribution.count({ where: { user_id: userId, created_at: { gte: since } } });
    },

    createContribution({ assetId, userId, kind, body }) {
      return prisma.contribution.create({
        data: { asset_id: assetId, user_id: userId, kind, body },
        select: contributionSelect,
      });
    },

    listUserContributions(userId, limit) {
      return prisma.contribution.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        take: limit,
        select: contributionSelect,
      });
    },

    async findPulse(assetId, limit) {
      const [tips, community, communityTotal] = await Promise.all([
        prisma.visitor_tip.findMany({
          where: { asset_id: assetId },
          orderBy: { id: "asc" },
          select: { id: true, text_tr: true, text_en: true, origin: true, collected_at: true },
        }),
        prisma.contribution.findMany({
          where: approvedFrom(assetId),
          orderBy: { created_at: "desc" },
          take: limit,
          select: pulseSelect,
        }),
        prisma.contribution.count({ where: approvedFrom(assetId) }),
      ]);
      return { tips, community, communityTotal };
    },

    async findQueue({ status, limit, offset }) {
      const where = { status };
      const [total, items] = await Promise.all([
        prisma.contribution.count({ where }),
        prisma.contribution.findMany({
          where,
          // The pending queue is worked oldest first; reviewed lists show the latest decisions first.
          orderBy: status === "pending" ? { created_at: "asc" } : { reviewed_at: "desc" },
          skip: offset,
          take: limit,
          select: moderationSelect,
        }),
      ]);
      return { total, items };
    },

    async review(id, reviewerId, decision) {
      // One conditional UPDATE: status, reviewer and time change together, so the
      // `reviewed_by/reviewed_at` CHECK holds and a second moderator cannot overwrite a decision.
      const { count } = await prisma.contribution.updateMany({
        where: { id, status: "pending" },
        data: {
          status: decision.status,
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          reject_reason: decision.status === "rejected" ? decision.reason : null,
        },
      });
      if (count === 0) {
        const exists = await prisma.contribution.findUnique({ where: { id }, select: { id: true } });
        return exists === null ? "not_found" : "already_reviewed";
      }
      return prisma.contribution.findUniqueOrThrow({ where: { id }, select: moderationSelect });
    },

    async banVisitor(id) {
      const { count } = await prisma.app_user.updateMany({
        where: { id, role: "visitor", banned_at: null },
        data: { banned_at: new Date() },
      });
      if (count > 0) return true;
      // Already banned counts as success; a missing user or a moderator does not.
      return (await prisma.app_user.findFirst({ where: { id, role: "visitor" }, select: { id: true } })) !== null;
    },
  };
}

import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

const userSelect = {
  id: true,
  nickname: true,
  username: true,
  role: true,
  created_at: true,
  banned_at: true,
  email: true,
  full_name: true,
  avatar: { select: { sha256: true } },
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
  photo: { select: { width: true, height: true } },
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

const photoSelect = {
  contribution_id: true,
  width: true,
  height: true,
  contribution: { select: { body: true, created_at: true, user: { select: { nickname: true } } } },
} satisfies Prisma.photo_uploadSelect;

export type PhotoRecord = Prisma.photo_uploadGetPayload<{ select: typeof photoSelect }>;

/** The file of a photo, with what decides who may see it. */
export interface PhotoFileRecord {
  contentType: string;
  bytes: Uint8Array;
  /** Approved, its author not banned and its asset visible: anyone may see it. */
  public: boolean;
}

export interface NewPhoto {
  contentType: string;
  bytes: Buffer;
  width: number;
  height: number;
  sha256: string;
}

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

export type UserRole = "visitor" | "moderator" | "admin";

export interface NewUser {
  nickname: string;
  role: UserRole;
  /** The first session's token hash. */
  tokenHash: string;
  /** Both or neither: an account, or an anonymous visitor. */
  credentials?: Credentials;
  fullName?: string | null;
}

export interface Credentials {
  username: string;
  passwordHash: string;
  /** Required at sign-up; null only for staff accounts made with `account:create`. */
  email: string | null;
}

/** Which unique field an account already holds. */
export type TakenField = "username_taken" | "email_taken";

export interface AvatarFile {
  contentType: string;
  bytes: Uint8Array;
}

export interface CommunityRepository {
  /** Creates the user with one session; "username_taken" or "email_taken" when another account has it. */
  createUser(data: NewUser): Promise<UserRecord | TakenField>;
  findUserByTokenHash(tokenHash: string): Promise<UserRecord | null>;
  /** The account with this (lowercase) username and its password hash, or null. */
  findAccount(username: string): Promise<(UserRecord & { password_hash: string | null }) | null>;
  createSession(userId: string, tokenHash: string): Promise<void>;
  /** Ends one session (sign-out on this device). */
  deleteSession(tokenHash: string): Promise<void>;
  /** Gives an anonymous visitor a username and password; "has_account" when it already has one. */
  addCredentials(userId: string, credentials: Credentials): Promise<UserRecord | TakenField | "has_account">;
  /** Changes only the fields given; `fullName: null` removes the name. */
  updateProfile(userId: string, profile: { nickname?: string | undefined; fullName?: string | null | undefined }): Promise<UserRecord>;
  /** Puts the user's profile photo in place of the old one. */
  saveAvatar(userId: string, avatar: NewPhoto): Promise<UserRecord>;
  deleteAvatar(userId: string): Promise<UserRecord>;
  findAvatar(userId: string): Promise<AvatarFile | null>;
  /** The asset if clients may see it (and so may contribute to it), otherwise null. */
  findVisibleAsset(id: string, statuses: string[]): Promise<VisibleAsset | null>;
  /** Text contributions (not photos) since `since`. */
  countContributionsSince(userId: string, since: Date): Promise<number>;
  createContribution(data: { assetId: string; userId: string; kind: string; body: string }): Promise<ContributionRecord>;
  listUserContributions(userId: string, limit: number): Promise<ContributionRecord[]>;
  countPhotosSince(userId: string, since: Date): Promise<number>;
  /** A pending `photo` contribution with its file, in one transaction. */
  createPhotoContribution(data: { assetId: string; userId: string; caption: string; photo: NewPhoto }): Promise<ContributionRecord>;
  /** Approved photos of an asset whose authors are not banned, newest first. */
  findApprovedPhotos(assetId: string, limit: number): Promise<{ items: PhotoRecord[]; total: number }>;
  findPhotoFile(id: string, statuses: string[]): Promise<PhotoFileRecord | null>;
  findPulse(assetId: string, limit: number): Promise<PulseRecords>;
  findQueue(query: { status: ContributionStatus; kind?: "notes" | "photos" | undefined; limit: number; offset: number }): Promise<{
    total: number;
    items: ModerationRecord[];
  }>;
  /** Reviews a pending contribution. The status filter makes concurrent reviews safe. */
  review(id: string, reviewerId: string, decision: ReviewDecision): Promise<ModerationRecord | "not_found" | "already_reviewed" | "own">;
  /** Bans a visitor; false when no such visitor exists. Moderators cannot be banned this way. */
  banVisitor(id: string): Promise<boolean>;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

/** The account field a unique violation is about; Prisma names the column or the index in its metadata. */
function takenField(err: unknown): TakenField {
  const meta = JSON.stringify((err as { meta?: unknown }).meta ?? {});
  return meta.includes("email") ? "email_taken" : "username_taken";
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
    async createUser({ nickname, role, tokenHash, credentials, fullName }) {
      try {
        return await prisma.app_user.create({
          data: {
            nickname,
            role,
            username: credentials?.username ?? null,
            password_hash: credentials?.passwordHash ?? null,
            email: credentials?.email ?? null,
            full_name: fullName ?? null,
            sessions: { create: { token_hash: tokenHash } },
          },
          select: userSelect,
        });
      } catch (err) {
        if (isUniqueViolation(err)) return takenField(err);
        throw err;
      }
    },

    async findUserByTokenHash(tokenHash) {
      const session = await prisma.user_session.findUnique({
        where: { token_hash: tokenHash },
        select: { user: { select: userSelect } },
      });
      return session?.user ?? null;
    },

    findAccount(username) {
      return prisma.app_user.findUnique({ where: { username }, select: { ...userSelect, password_hash: true } });
    },

    async createSession(userId, tokenHash) {
      await prisma.user_session.create({ data: { user_id: userId, token_hash: tokenHash } });
    },

    async deleteSession(tokenHash) {
      await prisma.user_session.deleteMany({ where: { token_hash: tokenHash } });
    },

    async addCredentials(userId, { username, passwordHash, email }) {
      try {
        // The username filter makes two concurrent upgrades of one visitor safe.
        const { count } = await prisma.app_user.updateMany({
          where: { id: userId, username: null },
          data: { username, password_hash: passwordHash, email },
        });
        if (count === 0) return "has_account";
        return await prisma.app_user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
      } catch (err) {
        if (isUniqueViolation(err)) return takenField(err);
        throw err;
      }
    },

    updateProfile(userId, { nickname, fullName }) {
      return prisma.app_user.update({ where: { id: userId }, data: { nickname, full_name: fullName }, select: userSelect });
    },

    async saveAvatar(userId, { contentType, bytes, width, height, sha256 }) {
      const file = { content_type: contentType, bytes: new Uint8Array(bytes), width, height, sha256, updated_at: new Date() };
      await prisma.user_avatar.upsert({ where: { user_id: userId }, create: { user_id: userId, ...file }, update: file });
      return prisma.app_user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    },

    async deleteAvatar(userId) {
      await prisma.user_avatar.deleteMany({ where: { user_id: userId } });
      return prisma.app_user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    },

    async findAvatar(userId) {
      const avatar = await prisma.user_avatar.findUnique({ where: { user_id: userId }, select: { content_type: true, bytes: true } });
      return avatar ? { contentType: avatar.content_type, bytes: avatar.bytes } : null;
    },

    findVisibleAsset(id, statuses) {
      return prisma.asset.findFirst({
        where: { id, status: { in: statuses } },
        select: { id: true, name_tr: true, name_en: true },
      });
    },

    countContributionsSince(userId, since) {
      // Photos have their own daily limit.
      return prisma.contribution.count({ where: { user_id: userId, kind: { not: "photo" }, created_at: { gte: since } } });
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

    countPhotosSince(userId, since) {
      return prisma.contribution.count({ where: { user_id: userId, kind: "photo", created_at: { gte: since } } });
    },

    createPhotoContribution({ assetId, userId, caption, photo }) {
      return prisma.contribution.create({
        data: {
          asset_id: assetId,
          user_id: userId,
          kind: "photo",
          body: caption,
          photo: {
            create: {
              content_type: photo.contentType,
              bytes: new Uint8Array(photo.bytes),
              width: photo.width,
              height: photo.height,
              sha256: photo.sha256,
            },
          },
        },
        select: contributionSelect,
      });
    },

    async findApprovedPhotos(assetId, limit) {
      const where: Prisma.photo_uploadWhereInput = {
        contribution: { asset_id: assetId, status: "approved", user: { banned_at: null } },
      };
      const [items, total] = await Promise.all([
        prisma.photo_upload.findMany({ where, orderBy: { created_at: "desc" }, take: limit, select: photoSelect }),
        prisma.photo_upload.count({ where }),
      ]);
      return { items, total };
    },

    async findPhotoFile(id, statuses) {
      const row = await prisma.photo_upload.findUnique({
        where: { contribution_id: id },
        select: {
          content_type: true,
          bytes: true,
          contribution: { select: { status: true, user: { select: { banned_at: true } }, asset: { select: { status: true } } } },
        },
      });
      if (!row) return null;
      const { contribution } = row;
      return {
        contentType: row.content_type,
        bytes: row.bytes,
        public:
          contribution.status === "approved" && contribution.user.banned_at === null && statuses.includes(contribution.asset.status),
      };
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

    async findQueue({ status, kind, limit, offset }) {
      const where: Prisma.contributionWhereInput = {
        status,
        ...(kind && { kind: kind === "photos" ? "photo" : { not: "photo" } }),
      };
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
        // Not their own: approved notes earn achievements and points.
        where: { id, status: "pending", user_id: { not: reviewerId } },
        data: {
          status: decision.status,
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          reject_reason: decision.status === "rejected" ? decision.reason : null,
        },
      });
      if (count === 0) {
        const found = await prisma.contribution.findUnique({ where: { id }, select: { user_id: true, status: true } });
        if (found === null) return "not_found";
        return found.status === "pending" && found.user_id === reviewerId ? "own" : "already_reviewed";
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

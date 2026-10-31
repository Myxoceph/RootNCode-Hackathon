import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema, LangSchema } from "./asset.schema";

/**
 * Topluluk Ziyaretçi Nabzı (module 6): anonymous sessions, visitor contributions,
 * the per-asset pulse feed and the moderation queue.
 *
 * Visitors start anonymous: they pick a nickname and get an opaque bearer token
 * (`Authorization: Bearer <token>`). They may later create an account (username +
 * password) to sign in on other devices; an anonymous visitor who signs up keeps
 * their contributions. Contributions appear in the pulse only after a moderator approves them.
 */

/** 2–32 characters: letters, digits, space, `.`, `_`, `-`; starts with a letter or digit. */
export const NicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, "nickname may contain letters, digits, space, '.', '_' and '-'");

/**
 * Cleans free text before it is stored or shown: Unicode NFC, unified line breaks,
 * control and bidi-override characters removed, trailing spaces and runs of blank
 * lines collapsed. Clients can use it to show the character count the API enforces.
 */
export function normalizeContributionText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[  ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Length of a contribution after `normalizeContributionText`; clients show it as a counter. */
export const CONTRIBUTION_TEXT_MIN = 10;
export const CONTRIBUTION_TEXT_MAX = 1000;

export const ContributionTextSchema = z
  .string()
  .transform(normalizeContributionText)
  .pipe(
    z
      .string()
      .min(CONTRIBUTION_TEXT_MIN, `at least ${CONTRIBUTION_TEXT_MIN} characters`)
      .max(CONTRIBUTION_TEXT_MAX, `at most ${CONTRIBUTION_TEXT_MAX} characters`),
  );

/** `moderator` reviews contributions; `admin` also adds assets and manages roles. */
export const UserRoleSchema = z.enum(["visitor", "moderator", "admin"]);

/** 3–32 characters: lowercase letters, digits, `_` and `.`, starting with a letter or digit. Sign-in ignores case. */
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.]{2,31}$/, "username may contain lowercase letters, digits, '_' and '.' (3-32 characters)");

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const AppUserSchema = z.strictObject({
  id: z.uuid(),
  nickname: z.string().min(1),
  /**
   * Null for an anonymous visitor who has not created an account. The API always sends it;
   * the default keeps sessions the app stored before 0.3.6 readable.
   */
  username: z.string().min(1).nullable().default(null),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
});

/** `POST /auth/anonymous` */
export const AnonymousSessionRequestSchema = z.strictObject({ nickname: NicknameSchema });

/** The token is shown once; the API stores only its hash. Keep it in secure storage. */
export const AnonymousSessionResponseSchema = z.strictObject({
  user: AppUserSchema,
  token: z.string().min(32),
});

/** `POST /auth/register`: a new account. Without `nickname`, the username is shown as the nickname. */
export const RegisterRequestSchema = z.strictObject({
  username: UsernameSchema,
  password: PasswordSchema,
  nickname: NicknameSchema.optional(),
});

/** `POST /auth/login` */
export const LoginRequestSchema = z.strictObject({
  username: z.string().trim().toLowerCase().min(1).max(32),
  password: z.string().min(1).max(PASSWORD_MAX),
});

/** `POST /auth/upgrade`: the signed-in anonymous visitor becomes an account and keeps their contributions. */
export const UpgradeAccountRequestSchema = z.strictObject({
  username: UsernameSchema,
  password: PasswordSchema,
});

/** Response of register and login: the token is shown once, as for anonymous sessions. */
export const SessionResponseSchema = AnonymousSessionResponseSchema;

/** `photo` is sent with `POST /assets/:id/photos`; the others are text (`POST /assets/:id/contributions`). */
export const ContributionKindSchema = z.enum(["tip", "memory", "correction", "photo"]);
export const TextContributionKindSchema = z.enum(["tip", "memory", "correction"]);
export const ContributionStatusSchema = z.enum(["pending", "approved", "rejected"]);

/** `POST /assets/:id/contributions` */
export const CreateContributionRequestSchema = z.strictObject({
  kind: TextContributionKindSchema,
  body: ContributionTextSchema,
});

/** Largest photo upload, in bytes; the API answers 413 above it. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Photos one user may send per day. */
export const PHOTOS_PER_DAY = 10;
/** Shorter side of a photo, in pixels: smaller ones are icons or thumbnails. */
export const PHOTO_MIN_SIDE = 300;

/**
 * `caption` of `POST /assets/:id/photos` (query parameter): what the photo shows, cleaned
 * like contribution text. It is also the photo's alt text for screen readers.
 */
export const PHOTO_CAPTION_MIN = 3;
export const PHOTO_CAPTION_MAX = 200;
export const PhotoCaptionSchema = z
  .string()
  .transform(normalizeContributionText)
  .pipe(z.string().min(PHOTO_CAPTION_MIN).max(PHOTO_CAPTION_MAX));

/**
 * A visitor photo file. `path` is relative to the API base URL (e.g. `${apiUrl}${path}`);
 * for photos that are not approved it is signed and expires within a day.
 */
export const PhotoFileSchema = z.strictObject({
  path: z.string().startsWith("/photos/"),
  width: z.int().positive(),
  height: z.int().positive(),
});

/** A contribution as its author sees it (`POST` response, `GET /me/contributions`). */
export const ContributionSchema = z.strictObject({
  id: z.uuid(),
  assetId: AssetIdSchema,
  kind: ContributionKindSchema,
  /** The text, or a photo's caption. */
  body: z.string().min(1),
  /** Set for `kind: "photo"`. The default keeps answers of an API before 0.3.7 readable. */
  photo: PhotoFileSchema.nullable().default(null),
  status: ContributionStatusSchema,
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  /** Shown to the author when a moderator rejects the contribution. */
  rejectReason: z.string().nullable(),
});

export const MyContributionsResponseSchema = z.strictObject({
  items: z.array(ContributionSchema),
});

/**
 * Pulse feed origins: the three dataset origins (see `VisitorTipSchemaV2`) plus
 * `community` for approved visitor contributions.
 */
export const PulseOriginSchema = z.enum(["official", "field_visit", "visitor_reviews_summary", "community"]);

export const PulseItemSchema = z.strictObject({
  id: z.string().min(1),
  /** `memory` items are personal recollections, not field tips; show them apart. */
  kind: z.enum(["tip", "memory"]),
  text: z.string().min(1),
  origin: PulseOriginSchema,
  /** Nickname for `community` items, otherwise null. */
  author: z.string().nullable(),
  /** When the tip was collected or the contribution was sent. */
  date: z.iso.date().nullable(),
});

/** `GET /assets/:id/pulse`: dataset tips first, then approved contributions, newest first. */
export const PulseResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  assetId: AssetIdSchema,
  items: z.array(PulseItemSchema),
  /** All approved contributions for the asset; `items` holds at most `limit` of them. */
  communityTotal: z.int().min(0),
});

/** An approved visitor photo of an asset. Show it apart from the dataset's gallery, with the author's nickname. */
export const CommunityPhotoSchema = PhotoFileSchema.extend({
  id: z.uuid(),
  /** Also the alt text. */
  caption: z.string().min(1),
  author: z.string().min(1),
  date: z.iso.date(),
});

/** `GET /assets/:id/photos`: newest first. */
export const CommunityPhotosResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  assetId: AssetIdSchema,
  items: z.array(CommunityPhotoSchema),
  total: z.int().min(0),
});

export const ModerationItemSchema = ContributionSchema.extend({
  asset: z.strictObject({ id: AssetIdSchema, name: z.string().min(1) }),
  author: z.strictObject({ id: z.uuid(), nickname: z.string().min(1), banned: z.boolean() }),
  reviewer: z.strictObject({ id: z.uuid(), nickname: z.string().min(1) }).nullable(),
});

/** `GET /admin/contributions?status=pending`: oldest first, so the queue is worked in order. */
export const ModerationListResponseSchema = z.strictObject({
  total: z.int().min(0),
  limit: z.int().min(1),
  offset: z.int().min(0),
  items: z.array(ModerationItemSchema),
});

/** `POST /admin/contributions/:id/reject`; the reason is shown to the author. */
export const RejectContributionRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
});

export type AppUser = z.infer<typeof AppUserSchema>;
export type AnonymousSessionRequest = z.infer<typeof AnonymousSessionRequestSchema>;
export type AnonymousSessionResponse = z.infer<typeof AnonymousSessionResponseSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type UpgradeAccountRequest = z.infer<typeof UpgradeAccountRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type ContributionKind = z.infer<typeof ContributionKindSchema>;
export type TextContributionKind = z.infer<typeof TextContributionKindSchema>;
export type PhotoFile = z.infer<typeof PhotoFileSchema>;
export type CommunityPhoto = z.infer<typeof CommunityPhotoSchema>;
export type CommunityPhotosResponse = z.infer<typeof CommunityPhotosResponseSchema>;
export type ContributionStatus = z.infer<typeof ContributionStatusSchema>;
export type CreateContributionRequest = z.input<typeof CreateContributionRequestSchema>;
export type Contribution = z.infer<typeof ContributionSchema>;
export type MyContributionsResponse = z.infer<typeof MyContributionsResponseSchema>;
export type PulseItem = z.infer<typeof PulseItemSchema>;
export type PulseResponse = z.infer<typeof PulseResponseSchema>;
export type ModerationItem = z.infer<typeof ModerationItemSchema>;
export type ModerationListResponse = z.infer<typeof ModerationListResponseSchema>;
export type RejectContributionRequest = z.infer<typeof RejectContributionRequestSchema>;

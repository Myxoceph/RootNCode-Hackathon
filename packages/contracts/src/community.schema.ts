import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema, LangSchema } from "./asset.schema";

/**
 * Topluluk Ziyaretçi Nabzı (module 6): anonymous sessions, visitor contributions,
 * the per-asset pulse feed and the moderation queue.
 *
 * Visitors are anonymous: they pick a nickname and get an opaque bearer token
 * (`Authorization: Bearer <token>`). Contributions are plain text and appear in
 * the pulse only after a moderator approves them.
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

export const UserRoleSchema = z.enum(["visitor", "moderator"]);

export const AppUserSchema = z.strictObject({
  id: z.uuid(),
  nickname: z.string().min(1),
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

/** Photo contributions need the upload pipeline (R2) and are not accepted yet. */
export const ContributionKindSchema = z.enum(["tip", "memory", "correction"]);
export const ContributionStatusSchema = z.enum(["pending", "approved", "rejected"]);

/** `POST /assets/:id/contributions` */
export const CreateContributionRequestSchema = z.strictObject({
  kind: ContributionKindSchema,
  body: ContributionTextSchema,
});

/** A contribution as its author sees it (`POST` response, `GET /me/contributions`). */
export const ContributionSchema = z.strictObject({
  id: z.uuid(),
  assetId: AssetIdSchema,
  kind: ContributionKindSchema,
  body: z.string().min(1),
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
export type ContributionKind = z.infer<typeof ContributionKindSchema>;
export type ContributionStatus = z.infer<typeof ContributionStatusSchema>;
export type CreateContributionRequest = z.input<typeof CreateContributionRequestSchema>;
export type Contribution = z.infer<typeof ContributionSchema>;
export type MyContributionsResponse = z.infer<typeof MyContributionsResponseSchema>;
export type PulseItem = z.infer<typeof PulseItemSchema>;
export type PulseResponse = z.infer<typeof PulseResponseSchema>;
export type ModerationItem = z.infer<typeof ModerationItemSchema>;
export type ModerationListResponse = z.infer<typeof ModerationListResponseSchema>;
export type RejectContributionRequest = z.infer<typeof RejectContributionRequestSchema>;

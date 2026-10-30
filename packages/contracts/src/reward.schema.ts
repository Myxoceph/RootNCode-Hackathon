import { z } from "zod";
import { ContractVersionSchema, LangSchema } from "./asset.schema";

/**
 * Ödül kataloğu ve cüzdan. Points earned with achievements are spent on rewards from
 * partner institutions: the partner uploads single-use codes, a visitor redeems points
 * for one. Points cannot be bought or cashed out. The list is in docs/rewards.md.
 */

const CodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase code");

/** `merch` (picked up at a branch), `museum` (entry), `discount`, `experience`. */
export const RewardKindSchema = z.enum(["merch", "museum", "discount", "experience"]);

export const RewardSchema = z.strictObject({
  code: CodeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  /** The institution that gives the reward, e.g. "Vakıf Katılım". */
  partner: z.string().min(1),
  kind: RewardKindSchema,
  costPoints: z.int().positive(),
  /** Proven visits (position plus recognition of the site) needed before redeeming; 0 for none. */
  minProvenVisits: z.int().min(0),
  /** Codes left; 0 means out of stock. */
  stock: z.int().min(0),
  /** A sample for the demo with no real agreement behind it: label it as such. */
  sample: z.boolean(),
});

/** `GET /rewards?lang=`: active rewards in display order. */
export const RewardsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  items: z.array(RewardSchema),
});

export const RedemptionSchema = z.strictObject({
  id: z.uuid(),
  reward: z.strictObject({
    code: CodeSchema,
    title: z.string().min(1),
    partner: z.string().min(1),
    kind: RewardKindSchema,
  }),
  /** The single-use code to show at the branch, museum or café. */
  code: z.string().min(1),
  points: z.int().positive(),
  createdAt: z.iso.datetime(),
});

/** `GET /me/wallet?lang=` */
export const WalletResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  /** `earned − spent`. */
  balance: z.int().min(0),
  /** Points of the achievements earned. */
  earned: z.int().min(0),
  spent: z.int().min(0),
  provenVisits: z.int().min(0),
  /** Newest first. */
  redemptions: z.array(RedemptionSchema),
});

/** `POST /rewards/:code/redeem?lang=` */
export const RedeemResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  redemption: RedemptionSchema,
  balance: z.int().min(0),
});

const I18n = z.strictObject({
  tr: z.string().trim().min(1).max(300),
  en: z.string().trim().min(1).max(300).nullable().optional(),
});

const RewardFields = {
  title: I18n,
  description: I18n,
  partner: z.string().trim().min(1).max(120),
  kind: RewardKindSchema,
  costPoints: z.int().min(1).max(100_000),
  minProvenVisits: z.int().min(0).max(1000),
  sample: z.boolean(),
  sortOrder: z.int().min(0).max(10_000),
  active: z.boolean(),
};

/** `POST /admin/rewards` (admin only). */
export const AdminRewardInputSchema = z.strictObject({
  ...RewardFields,
  code: CodeSchema.max(60),
  minProvenVisits: RewardFields.minProvenVisits.default(0),
  sample: RewardFields.sample.default(false),
  sortOrder: RewardFields.sortOrder.default(1000),
  active: RewardFields.active.default(true),
});

/** `PATCH /admin/rewards/:code`: any field except the code. */
export const AdminRewardPatchSchema = z
  .strictObject(RewardFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "at least one field");

export const AdminRewardSchema = RewardSchema.extend({
  active: z.boolean(),
  sortOrder: z.int().min(0),
  createdBy: z.string().min(1),
  codesTotal: z.int().min(0),
  codesUsed: z.int().min(0),
});

/** `GET /admin/rewards`: all rewards, active or not, with code counts. */
export const AdminRewardsResponseSchema = z.strictObject({ items: z.array(AdminRewardSchema) });

/** `POST /admin/rewards/:code/codes`: single-use codes from the partner. */
export const AddRewardCodesRequestSchema = z.strictObject({
  codes: z
    .array(z.string().trim().regex(/^[A-Za-z0-9_-]{4,64}$/, "4-64 letters, digits, '_' or '-'"))
    .min(1)
    .max(1000),
});

export const AddRewardCodesResponseSchema = z.strictObject({
  added: z.int().min(0),
  /** Codes already uploaded for this reward, skipped. */
  duplicates: z.int().min(0),
  stock: z.int().min(0),
});

export type RewardKind = z.infer<typeof RewardKindSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type RewardsResponse = z.infer<typeof RewardsResponseSchema>;
export type Redemption = z.infer<typeof RedemptionSchema>;
export type WalletResponse = z.infer<typeof WalletResponseSchema>;
export type RedeemResponse = z.infer<typeof RedeemResponseSchema>;
export type AdminRewardInput = z.input<typeof AdminRewardInputSchema>;
export type AdminRewardPatch = z.input<typeof AdminRewardPatchSchema>;
export type AdminReward = z.infer<typeof AdminRewardSchema>;
export type AdminRewardsResponse = z.infer<typeof AdminRewardsResponseSchema>;
export type AddRewardCodesRequest = z.infer<typeof AddRewardCodesRequestSchema>;
export type AddRewardCodesResponse = z.infer<typeof AddRewardCodesResponseSchema>;

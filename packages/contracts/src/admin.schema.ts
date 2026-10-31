import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema } from "./asset.schema";
import { UserRoleSchema } from "./community.schema";

/**
 * Admin panel: users and roles, assets added from the panel, and the counts on its
 * first screen. Every route needs a moderator or admin; roles and assets need an admin.
 * The review queue itself is `GET /admin/contributions` (community.schema.ts).
 */

const CodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase code");

/** `GET /admin/summary` */
export const AdminSummaryResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  pending: z.strictObject({
    /** Tips, memories and corrections waiting for review. */
    notes: z.int().min(0),
    photos: z.int().min(0),
  }),
  users: z.strictObject({
    total: z.int().min(0),
    /** With a username and password, as opposed to anonymous visitors. */
    accounts: z.int().min(0),
    banned: z.int().min(0),
  }),
  /** Assets added from the panel, in any status. */
  panelAssets: z.int().min(0),
});

export const AdminUserSchema = z.strictObject({
  id: z.uuid(),
  nickname: z.string().min(1),
  username: z.string().min(1).nullable(),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
  bannedAt: z.iso.datetime().nullable(),
  contributions: z.int().min(0),
});

/** `GET /admin/users?q=&role=&limit=&offset=`: newest first; `q` matches nickname or username. */
export const AdminUsersResponseSchema = z.strictObject({
  total: z.int().min(0),
  limit: z.int().min(1),
  offset: z.int().min(0),
  items: z.array(AdminUserSchema),
});

/** `POST /admin/users/:id/role` (admin only; not on oneself). */
export const SetUserRoleRequestSchema = z.strictObject({ role: UserRoleSchema });

const TrText = z.string().trim().min(1);
const OptionalText = z.string().trim().min(1).nullable().optional();

const AdminAssetFields = {
  name: z.strictObject({ tr: TrText.max(120), en: OptionalText }),
  /** `asset_types` code from `GET /meta/enums`, e.g. `cami`. */
  type: CodeSchema,
  /** `cities` code, e.g. `bursa`. */
  city: CodeSchema,
  district: TrText.max(60),
  /** `eras` code; null when unknown. */
  era: CodeSchema.nullable().optional(),
  summary: z.strictObject({ tr: TrText.max(400), en: OptionalText }),
  /** The asset page's text, shown as one section titled "Tanıtım". */
  description: z.strictObject({ tr: TrText.max(5000), en: OptionalText }),
  dating: z.strictObject({ tr: TrText.max(120), en: OptionalText }).nullable().optional(),
  founder: z.string().trim().min(1).max(120).nullable().optional(),
  address: z.string().trim().min(1).max(200).nullable().optional(),
  coordinates: z
    .strictObject({ lat: z.number().min(35.5).max(42.5), lng: z.number().min(25.5).max(45) })
    .nullable()
    .optional(),
};

const AdminAssetStatusSchema = z.enum(["draft", "published"]);

/**
 * `POST /admin/assets`: a new asset from the panel. It is stored like a dataset record
 * (`meta.prepared_by: "admin:<username>"`) so it can be exported into `data/eserler` later.
 */
export const AdminAssetInputSchema = z.strictObject({
  ...AdminAssetFields,
  /** `draft` stays hidden from visitors; `published` appears in the app at once. */
  status: AdminAssetStatusSchema.default("draft"),
});

/** `PATCH /admin/assets/:id`: any of the fields; only assets added from the panel can be edited. */
export const AdminAssetPatchSchema = z
  .strictObject({ ...AdminAssetFields, status: AdminAssetStatusSchema })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "at least one field");

export const AdminAssetSchema = z.strictObject({
  id: AssetIdSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  city: z.string().min(1),
  district: z.string().min(1),
  status: AdminAssetStatusSchema,
  /** Username of the admin who added it. */
  createdBy: z.string().min(1),
  updatedAt: z.iso.datetime(),
});

/** `GET /admin/assets`: assets added from the panel, newest first. Dataset assets are edited in `data/`. */
export const AdminAssetsResponseSchema = z.strictObject({
  items: z.array(AdminAssetSchema),
});

export type AdminSummaryResponse = z.infer<typeof AdminSummaryResponseSchema>;
export type AdminUser = z.infer<typeof AdminUserSchema>;
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;
export type SetUserRoleRequest = z.infer<typeof SetUserRoleRequestSchema>;
export type AdminAssetInput = z.input<typeof AdminAssetInputSchema>;
export type AdminAssetPatch = z.input<typeof AdminAssetPatchSchema>;
export type AdminAsset = z.infer<typeof AdminAssetSchema>;
export type AdminAssetsResponse = z.infer<typeof AdminAssetsResponseSchema>;

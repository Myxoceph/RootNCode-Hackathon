import {
  AddRewardCodesResponseSchema,
  AdminAchievementSchema,
  AdminAchievementsResponseSchema,
  AdminAssetRecordResponseSchema,
  AssetDetailSchema,
  AdminAssetSchema,
  AdminAssetsResponseSchema,
  AdminRewardSchema,
  AdminRewardsResponseSchema,
  AdminSummaryResponseSchema,
  AdminUserSchema,
  AdminUsersResponseSchema,
  MetaEnumsResponseSchema,
  ModerationItemSchema,
  ModerationListResponseSchema,
  type AddRewardCodesResponse,
  type AdminAchievement,
  type AdminAchievementInput,
  type AdminAchievementPatch,
  type AdminAsset,
  type AdminAssetRecord,
  type AdminAssetRecordResponse,
  type AssetDetail,
  type AdminAssetInput,
  type AdminAssetPatch,
  type AdminReward,
  type AdminRewardInput,
  type AdminRewardPatch,
  type AdminSummaryResponse,
  type AdminUser,
  type AdminUsersResponse,
  type MetaEnumsResponse,
  type ModerationItem,
  type ModerationListResponse,
  type UserRole,
} from "@vagabonds/contracts";

import { accountToken, sessionRejected } from "./community";
import { resolveApiUrl } from "./config";
import { DataError, type SchemaParser } from "./errors";
import { request, statusError } from "./http";

/**
 * The admin panel's requests (`/admin/*`). Every one is sent with the signed-in account's token;
 * the API decides what a moderator or an admin may do, and its refusals come back in Turkish.
 */

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Oturumun sona ermiş. Yeniden giriş yap.",
  ACCOUNT_REQUIRED: "Panel için hesabınla giriş yapmalısın.",
  FORBIDDEN: "Bu işlem için yetkin yok.",
  OWN_ROLE: "Kendi rolünü değiştiremezsin.",
  OWN_CONTRIBUTION: "Kendi notunu inceleyemezsin.",
  ALREADY_REVIEWED: "Bu not zaten incelenmiş.",
  UNKNOWN_CODE: "Tür, il, dönem, olay türü ya da külliye tanınmadı.",
  PAYLOAD_TOO_LARGE: "Kayıt çok büyük; metinleri kısaltıp tekrar dene.",
  ASSET_EXISTS: "Bu adla ve ilçede bir eser zaten var.",
  ACHIEVEMENT_EXISTS: "Bu kodla bir başarım zaten var.",
  REWARD_EXISTS: "Bu kodla bir ödül zaten var.",
  ASSET_NOT_FOUND: "Eser bulunamadı; silinmiş olabilir.",
  USER_NOT_FOUND: "Kullanıcı bulunamadı.",
  CONTRIBUTION_NOT_FOUND: "Not bulunamadı.",
  ACHIEVEMENT_NOT_FOUND: "Başarım bulunamadı.",
  REWARD_NOT_FOUND: "Ödül bulunamadı.",
  INVALID_BODY: "Bilgiler kurallara uymuyor; alanları kontrol et.",
  INVALID_QUERY: "Arama kurallara uymuyor.",
};

/** A void schema for answers with nothing to read (204). */
const Nothing: SchemaParser<null> = { safeParse: () => ({ success: true, data: null }) } as unknown as SchemaParser<null>;

async function admin<T>(path: string, schema: SchemaParser<T>, init: { body?: unknown; method?: "POST" | "PUT" | "DELETE" | "PATCH" } = {}): Promise<T> {
  const token = await accountToken();
  if (!token) throw new DataError("rejected", "Panel için yönetici hesabıyla giriş yapmalısın.", [], "ACCOUNT_REQUIRED");
  const result = await request(`${resolveApiUrl()}${path}`, schema, {
    ...init,
    token,
    errorFor: (status, code, details) => {
      if (status === 401) sessionRejected(token);
      const message = code ? MESSAGES[code] : undefined;
      return message ? new DataError("rejected", message, details, code) : statusError(status, code, details);
    },
  });
  return result as T;
}

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return pairs.length === 0 ? "" : `?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join("&")}`;
};

export const fetchAdminSummary = (): Promise<AdminSummaryResponse> => admin("/admin/summary", AdminSummaryResponseSchema);

export const fetchMetaEnums = (): Promise<MetaEnumsResponse> => admin("/meta/enums?lang=tr", MetaEnumsResponseSchema);

// Review queue.
export type QueueKind = "notes" | "photos";
export type QueueStatus = "pending" | "approved" | "rejected";

export const fetchQueue = (params: { status: QueueStatus; kind?: QueueKind; limit?: number; offset?: number }): Promise<ModerationListResponse> =>
  admin(`/admin/contributions${query({ ...params, lang: "tr" })}`, ModerationListResponseSchema);

/** Every contribution with a status, page by page, up to `cap`: for counts the API does not give. */
export async function fetchWholeQueue(status: QueueStatus, cap = 1000): Promise<ModerationItem[]> {
  const items: ModerationItem[] = [];
  for (;;) {
    const page = await fetchQueue({ status, limit: 100, offset: items.length });
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total || items.length >= cap) return items;
  }
}

export const approveContribution = (id: string): Promise<ModerationItem> =>
  admin(`/admin/contributions/${id}/approve?lang=tr`, ModerationItemSchema, { method: "POST" });

export const rejectContribution = (id: string, reason: string): Promise<ModerationItem> =>
  admin(`/admin/contributions/${id}/reject?lang=tr`, ModerationItemSchema, { body: { reason } });

// Users.
export const fetchUsers = (params: { q?: string; role?: UserRole; limit?: number; offset?: number }): Promise<AdminUsersResponse> =>
  admin(`/admin/users${query(params)}`, AdminUsersResponseSchema);

export const setUserRole = (id: string, role: UserRole): Promise<AdminUser> => admin(`/admin/users/${id}/role`, AdminUserSchema, { body: { role } });

export const banUser = (id: string): Promise<null> => admin(`/admin/users/${id}/ban`, Nothing, { method: "POST" });

export const unbanUser = (id: string): Promise<AdminUser> => admin(`/admin/users/${id}/unban`, AdminUserSchema, { method: "POST" });

// Assets: the panel's own and the dataset's.
export const fetchPanelAssets = async (): Promise<AdminAsset[]> => (await admin("/admin/assets", AdminAssetsResponseSchema)).items;

/** Everything the editor edits about an asset. */
export const fetchAssetRecord = (id: string): Promise<AdminAssetRecordResponse> => admin(`/admin/assets/${id}/record`, AdminAssetRecordResponseSchema);

export const saveAssetRecord = (id: string, record: AdminAssetRecord): Promise<AdminAssetRecordResponse> =>
  admin(`/admin/assets/${id}/record`, AdminAssetRecordResponseSchema, { method: "PUT", body: record });

/** A new asset from the editor; its id comes from its name and district. */
export const createAssetRecord = (record: AdminAssetRecord): Promise<AdminAssetRecordResponse> =>
  admin("/admin/assets/record", AdminAssetRecordResponseSchema, { body: record });

/** The asset's page as the app shows it, drafts included: for the panel's preview. */
export const fetchAssetPreview = (id: string): Promise<AssetDetail> => admin(`/admin/assets/${id}/preview?lang=tr`, AssetDetailSchema);

export const createPanelAsset = (input: AdminAssetInput): Promise<AdminAsset> => admin("/admin/assets", AdminAssetSchema, { body: input });

export const updatePanelAsset = (id: string, patch: AdminAssetPatch): Promise<AdminAsset> =>
  admin(`/admin/assets/${id}`, AdminAssetSchema, { body: patch, method: "PATCH" });

export const deletePanelAsset = (id: string): Promise<null> => admin(`/admin/assets/${id}`, Nothing, { method: "DELETE" });

// Achievements.
export const fetchAdminAchievements = async (): Promise<AdminAchievement[]> =>
  (await admin("/admin/achievements?lang=tr", AdminAchievementsResponseSchema)).items;

export const createAchievement = (input: AdminAchievementInput): Promise<AdminAchievement> =>
  admin("/admin/achievements", AdminAchievementSchema, { body: input });

export const updateAchievement = (code: string, patch: AdminAchievementPatch): Promise<AdminAchievement> =>
  admin(`/admin/achievements/${code}`, AdminAchievementSchema, { body: patch, method: "PATCH" });

export const deleteAchievement = (code: string): Promise<null> => admin(`/admin/achievements/${code}`, Nothing, { method: "DELETE" });

// Rewards.
export const fetchAdminRewards = async (): Promise<AdminReward[]> => (await admin("/admin/rewards?lang=tr", AdminRewardsResponseSchema)).items;

export const createReward = (input: AdminRewardInput): Promise<AdminReward> => admin("/admin/rewards", AdminRewardSchema, { body: input });

export const updateReward = (code: string, patch: AdminRewardPatch): Promise<AdminReward> =>
  admin(`/admin/rewards/${code}`, AdminRewardSchema, { body: patch, method: "PATCH" });

export const addRewardCodes = (code: string, codes: string[]): Promise<AddRewardCodesResponse> =>
  admin(`/admin/rewards/${code}/codes`, AddRewardCodesResponseSchema, { body: { codes } });

import {
  AddRewardCodesResponseSchema,
  AdminAchievementSchema,
  AdminAchievementsResponseSchema,
  AdminAssetRecordResponseSchema,
  AdminPhotoUploadResponseSchema,
  AssetDetailSchema,
  AdminAssetSchema,
  AdminAssetsResponseSchema,
  AdminRewardSchema,
  AdminRewardsResponseSchema,
  AdminSummaryResponseSchema,
  AdminUserSchema,
  AdminUsersResponseSchema,
  IntakeDraftListResponseSchema,
  IntakeDraftResponseSchema,
  IntakeJobListResponseSchema,
  IntakeJobResponseSchema,
  IntakeUploadResponseSchema,
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
  type AdminPhotoUploadQuery,
  type AdminPhotoUploadResponse,
  type AssetDetail,
  type IntakeDraft,
  type IntakeDraftKind,
  type IntakeDraftStatus,
  type IntakeJob,
  type IntakeUpload,
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

import { Platform } from "react-native";

import { accountToken, sessionRejected } from "./community";
import { resolveApiUrl } from "./config";
import { DataError, type SchemaParser } from "./errors";
import { request, statusError } from "./http";
import { uploadFile } from "./upload";

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
  ALREADY_REVIEWED: "Bu zaten incelenmiş; listeyi yenile.",
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
  INVALID_IMAGE: "Bu görsel kullanılamıyor: JPEG ya da PNG olmalı.",
  UNSUPPORTED_MEDIA_TYPE: "Görsel JPEG ya da PNG olmalı.",
  IMAGE_TOO_SMALL: "Görsel çok küçük: kenarları en az 128 piksel olmalı.",
  IMAGE_NOT_SQUARE: "Görsel kareye yakın olmalı; rozet dairenin içinde çizilir.",
  PAYLOAD_TOO_LARGE_IMAGE: "Görsel çok büyük: en çok 2 MB olabilir.",
  INVALID_QUERY: "Arama kurallara uymuyor.",
  JOB_NOT_FOUND: "Sohbet bulunamadı; silinmiş olabilir.",
  DRAFTING: "Taslak şu an yazılıyor. Bitince mesajını yeniden gönder.",
  CHAT_CLOSED: "Bu sohbetin taslağı onaylandı ya da reddedildi; yeni mesaj alınmıyor.",
  CHAT_CHANGED: "Sohbet bu arada değişti (başka bir mesaj geldi ya da taslak yazılmaya başladı). Mesajını yeniden gönder.",
  CHAT_UNREADABLE: "Sohbetin kayıtlı mesajları okunamıyor.",
  UNKNOWN_UPLOAD: "Fotoğraflardan biri bulunamadı ya da zaten gönderildi. Kaldırıp yeniden ekle.",
  TOO_MANY_MESSAGES: "Bir sohbette en çok 200 mesaj olabilir.",
  TOO_MANY_PHOTOS: "Bir sohbette en çok 60 fotoğraf olabilir.",
  DRAFT_NOT_FOUND: "Taslak bulunamadı; silinmiş olabilir.",
  HAS_ERRORS: "Taslakta doğrulama hataları var: önce düzelt, sonra onayla.",
  ASSET_GONE: "Bu taslağın eklendiği eser artık yok.",
  INVALID_RECORD: "Kayıt kurallara uymuyor; alanları kontrol et.",
  NOT_READ: "Kitabe okunmadan onaylanamaz: dil, transkripsiyon ve Türkçe çeviriyi yaz.",
  NOTHING_TO_RETRY: "Bu taslak zaten yeniden sırada ya da yayınlandı; sayfayı yenile.",
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
      if (message) return new DataError("rejected", message, details, code);
      // The generic text, with the API's code kept for a caller that acts on it (fetchChats: NOT_FOUND).
      const generic = statusError(status, code, details);
      return new DataError(generic.kind, generic.message, details, code);
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
/** Only written notes are reviewed: visitors no longer send photos. */
export type QueueKind = "notes";
export type QueueStatus = "pending" | "approved" | "rejected";

export const fetchQueue = (params: { status: QueueStatus; kind?: QueueKind; limit?: number; offset?: number }): Promise<ModerationListResponse> =>
  admin(`/admin/contributions${query({ kind: "notes", ...params, lang: "tr" })}`, ModerationListResponseSchema);

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

/** The asset photo upload's refusals, in Turkish; they differ from a badge picture's. */
const PHOTO_MESSAGES: Record<string, string> = {
  INVALID_IMAGE: "Bu dosya kullanılamıyor: resim değil ya da çok küçük (kısa kenarı en az 300 piksel olmalı).",
  PHOTO_ON_ASSET: "Bu fotoğraf bu eserde zaten var.",
  DATASET_PHOTO: "Bu fotoğraf veri setinden geliyor; panelden kaldırılamaz.",
  PHOTO_NOT_FOUND: "Fotoğraf bulunamadı; kaldırılmış olabilir.",
  MEDIA_UPLOAD_OFF: "Fotoğraf yükleme bu sunucuda açık değil (R2 anahtarı yok).",
  INVALID_QUERY: "Fotoğrafın bilgileri eksik: ne göründüğünü (en az 3 harf) ve çekeni yaz.",
  ASSET_NOT_FOUND: MESSAGES.ASSET_NOT_FOUND!,
};

const photoError = (token: string) => (status: number, code: string | null, details: string[]) => {
  if (status === 401) sessionRejected(token);
  const message =
    status === 413
      ? "Dosya çok büyük: en çok 15 MB olabilir."
      : status === 415
        ? "Bu dosya türü desteklenmiyor: JPEG, PNG ya da WebP olmalı."
        : (code && (PHOTO_MESSAGES[code] ?? MESSAGES[code])) || undefined;
  return message ? new DataError("rejected", message, details, code) : statusError(status, code, details);
};

/**
 * Uploads a photo to an asset (`POST /admin/assets/:id/media`, admins only): the file itself as
 * the body, a JPEG, PNG or WebP of at most 15 MB, its short side 300 px or more. The server makes
 * its sizes, which takes a few seconds; the answer is the photo as the asset page shows it.
 */
export async function uploadAssetPhoto(id: string, file: { uri: string; type: string }, about: AdminPhotoUploadQuery): Promise<AdminPhotoUploadResponse> {
  const token = await accountToken();
  if (!token) throw new DataError("rejected", "Panel için yönetici hesabıyla giriş yapmalısın.", [], "ACCOUNT_REQUIRED");
  const url = `${resolveApiUrl()}/admin/assets/${id}/media${query({
    alt: about.alt,
    altEn: about.altEn,
    caption: about.caption,
    captionEn: about.captionEn,
    credit: about.credit,
    license: about.license,
    isCover: about.isCover,
  })}`;
  const errorFor = photoError(token);
  if (Platform.OS !== "web") return uploadFile(file.uri, url, AdminPhotoUploadResponseSchema, { type: file.type, token, errorFor, timeoutMs: 120_000, method: "POST" });
  let data: Blob;
  try {
    data = await (await fetch(file.uri)).blob();
  } catch (error) {
    throw new DataError("rejected", "Fotoğraf okunamadı. Tekrar dene.", [file.uri, String(error)]);
  }
  return (await request(url, AdminPhotoUploadResponseSchema, { rawBody: { data, type: file.type }, method: "POST", token, timeoutMs: 120_000, errorFor }))!;
}

/** Removes a photo uploaded from the panel (`DELETE /admin/assets/:id/media/:key`); the dataset's own cannot be. */
export async function deleteAssetPhoto(id: string, key: string): Promise<null> {
  const token = await accountToken();
  if (!token) throw new DataError("rejected", "Panel için yönetici hesabıyla giriş yapmalısın.", [], "ACCOUNT_REQUIRED");
  return request(`${resolveApiUrl()}/admin/assets/${id}/media/${encodeURIComponent(key)}`, Nothing, { method: "DELETE", token, errorFor: photoError(token) }) as Promise<null>;
}

// Achievements.
export const fetchAdminAchievements = async (): Promise<AdminAchievement[]> =>
  (await admin("/admin/achievements?lang=tr", AdminAchievementsResponseSchema)).items;

export const createAchievement = (input: AdminAchievementInput): Promise<AdminAchievement> =>
  admin("/admin/achievements", AdminAchievementSchema, { body: input });

export const updateAchievement = (code: string, patch: AdminAchievementPatch): Promise<AdminAchievement> =>
  admin(`/admin/achievements/${code}`, AdminAchievementSchema, { body: patch, method: "PATCH" });

export const deleteAchievement = (code: string): Promise<null> => admin(`/admin/achievements/${code}`, Nothing, { method: "DELETE" });

/**
 * Puts a badge's picture (`PUT /admin/achievements/:code/image`): the picked file on a phone, a
 * blob or object URL on the web. JPEG or PNG, at most 2 MB, about square, sides 128 px or more.
 */
export async function uploadAchievementImage(code: string, uri: string, type: "image/jpeg" | "image/png"): Promise<AdminAchievement> {
  const token = await accountToken();
  if (!token) throw new DataError("rejected", "Panel için yönetici hesabıyla giriş yapmalısın.", [], "ACCOUNT_REQUIRED");
  const url = `${resolveApiUrl()}/admin/achievements/${code}/image`;
  const errorFor = (status: number, errorCode: string | null, details: string[]) => {
    if (status === 401) sessionRejected(token);
    const message = status === 413 ? MESSAGES.PAYLOAD_TOO_LARGE_IMAGE : errorCode ? MESSAGES[errorCode] : undefined;
    return message ? new DataError("rejected", message, details, errorCode) : statusError(status, errorCode, details);
  };
  if (Platform.OS !== "web") return uploadFile(uri, url, AdminAchievementSchema, { type, token, errorFor, timeoutMs: 30_000, method: "PUT" });
  let data: Blob;
  try {
    data = await (await fetch(uri)).blob();
  } catch (error) {
    throw new DataError("rejected", "Görsel okunamadı. Tekrar dene.", [uri, String(error)]);
  }
  return (await request(url, AdminAchievementSchema, { rawBody: { data, type }, method: "PUT", token, timeoutMs: 30_000, errorFor }))!;
}

export const deleteAchievementImage = (code: string): Promise<AdminAchievement> =>
  admin(`/admin/achievements/${code}/image`, AdminAchievementSchema, { method: "DELETE" });

// Rewards.
export const fetchAdminRewards = async (): Promise<AdminReward[]> => (await admin("/admin/rewards?lang=tr", AdminRewardsResponseSchema)).items;

export const createReward = (input: AdminRewardInput): Promise<AdminReward> => admin("/admin/rewards", AdminRewardSchema, { body: input });

export const updateReward = (code: string, patch: AdminRewardPatch): Promise<AdminReward> =>
  admin(`/admin/rewards/${code}`, AdminRewardSchema, { body: patch, method: "PATCH" });

export const addRewardCodes = (code: string, codes: string[]): Promise<AddRewardCodesResponse> =>
  admin(`/admin/rewards/${code}/codes`, AddRewardCodesResponseSchema, { body: { codes } });

// Sohbetten Kabul (Veri Döngüsü, docs/plans/yigit-veri-dongusu.md §1.4): an admin tells about a new
// asset in a chat, the worker (data/pipeline) writes its draft. Only on an API with INTAKE_ENABLED.

export type ChatJob = IntakeJob & { kind: "chat" };

/** The chats, newest first; null when this API has no intake routes (INTAKE_ENABLED off). */
export async function fetchChats(): Promise<IntakeJob[] | null> {
  try {
    return (await admin("/admin/intake/jobs", IntakeJobListResponseSchema)).items.filter((job) => job.kind === "chat");
  } catch (error) {
    if (error instanceof DataError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/** A chat with its messages and, once the worker wrote it, its draft: polled while the worker works. */
export const fetchChat = (id: string) => admin(`/admin/intake/jobs/${id}`, IntakeJobResponseSchema);

export const startChat = (body: { city: string; text: string; uploads: string[] }) => admin("/admin/intake/chats", IntakeJobResponseSchema, { body });

export const addChatMessage = (id: string, body: { text: string; uploads: string[] }) =>
  admin(`/admin/intake/chats/${id}/messages`, IntakeJobResponseSchema, { body });

/**
 * A photo for a chat message (`POST /admin/intake/uploads`): sent before the message, which then
 * names it. The API keeps the original as sent (the worker reads where it was taken from its EXIF).
 */
export async function uploadChatPhoto(file: { uri: string; type: string; name: string }): Promise<IntakeUpload> {
  const token = await accountToken();
  if (!token) throw new DataError("rejected", "Panel için yönetici hesabıyla giriş yapmalısın.", [], "ACCOUNT_REQUIRED");
  const url = `${resolveApiUrl()}/admin/intake/uploads${query({ name: file.name.slice(0, 200) })}`;
  const photoErrorFor = photoError(token);
  const errorFor = (status: number, code: string | null, details: string[]) =>
    code === "MEDIA_UPLOAD_OFF"
      ? new DataError("rejected", "Sohbet fotoğrafları yalnızca yerel geliştirmede (INTAKE_LOCAL_ONLY) yüklenebilir.", details, code)
      : code === "INVALID_IMAGE"
        ? new DataError("rejected", "Bu dosya kullanılamıyor: resim değil ya da çok küçük.", details, code)
        : code === "INVALID_QUERY"
          ? new DataError("rejected", "Dosyanın adı okunamadı; yeniden adlandırıp tekrar dene.", details, code)
          : photoErrorFor(status, code, details);
  let data: Blob;
  try {
    data = await (await fetch(file.uri)).blob();
  } catch (error) {
    throw new DataError("rejected", "Fotoğraf okunamadı. Tekrar dene.", [file.uri, String(error)]);
  }
  return (await request(url, IntakeUploadResponseSchema, { rawBody: { data, type: file.type }, method: "POST", token, timeoutMs: 120_000, errorFor }))!.upload;
}

/** A photo the API keeps in its local media store (INTAKE_LOCAL_ONLY), by its key. */
export const localMediaUrl = (key: string) => `${resolveApiUrl()}/local-media/${key.split("/").map(encodeURIComponent).join("/")}`;

// The review queue's drafts (Veri Döngüsü): new assets from chats and books, visitors' inscriptions.

export const fetchDrafts = (params: { status: IntakeDraftStatus; kind?: IntakeDraftKind; limit?: number; offset?: number }) =>
  admin(`/admin/intake/drafts${query(params)}`, IntakeDraftListResponseSchema);

export const fetchDraft = async (id: string): Promise<IntakeDraft> => (await admin(`/admin/intake/drafts/${id}`, IntakeDraftResponseSchema)).draft;

/** Approve (with the reviewer's corrected record, when anything was changed) or reject with a reason. */
/** Sends an approved draft whose publishing failed back to the worker (its error is cleared). */
export const retryDraft = async (id: string): Promise<IntakeDraft> =>
  (await admin(`/admin/intake/drafts/${id}/retry`, IntakeDraftResponseSchema, { method: "POST" })).draft;

export const reviewDraft = async (
  id: string,
  decision: { decision: "approve"; record?: Record<string, unknown>; note?: string } | { decision: "reject"; note: string },
): Promise<IntakeDraft> => (await admin(`/admin/intake/drafts/${id}/review`, IntakeDraftResponseSchema, { body: decision })).draft;

import {
  AdminAssetInputSchema,
  AdminAssetRecordInputSchema,
  AdminAssetRecordResponseSchema,
  AdminAssetPatchSchema,
  AdminAssetSchema,
  AdminAssetsResponseSchema,
  AdminSummaryResponseSchema,
  AdminUserSchema,
  AdminUsersResponseSchema,
  AssetIdSchema,
  CONTRACT_VERSION,
  SetUserRoleRequestSchema,
  UserRoleSchema,
  type AdminAsset,
  type AdminAssetRecord,
  type AdminAssetRecordResponse,
  type AdminAssetsResponse,
  type AdminSummaryResponse,
  type AdminUser,
  type AdminUsersResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { turkeyToday } from "../planner/planner.routes.ts";
import type { AdminRepository, AdminUserRecord, PanelAssetRecord } from "./admin.repository.ts";
import { datasetJson, toAssetRecord } from "./asset-record.ts";
import { applyPatch, PANEL_PREFIX, PANEL_TODO, panelAssetId, recordFromInput } from "./panel-asset.ts";

const UsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(40).optional().describe("Takma ad ya da kullanıcı adında geçen"),
  role: UserRoleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const UserParamsSchema = z.object({ id: z.uuid() });
const AssetParamsSchema = z.object({ id: AssetIdSchema });

const bearer = [{ bearerAuth: [] }];
/** A whole asset record: Ulucami's, the longest in the dataset, is about 120 KB. */
const RECORD_BODY_LIMIT = 2 * 1024 * 1024;

function toAdminUser(record: AdminUserRecord): AdminUser {
  return {
    id: record.id,
    nickname: record.nickname,
    username: record.username,
    role: UserRoleSchema.parse(record.role),
    createdAt: record.created_at.toISOString(),
    bannedAt: record.banned_at?.toISOString() ?? null,
    contributions: record._count.contributions,
  };
}

const isPanel = (preparedBy: string | null) => preparedBy?.startsWith(PANEL_PREFIX) ?? false;

function toAdminAsset(record: PanelAssetRecord): AdminAsset {
  const panel = isPanel(record.prepared_by);
  return AdminAssetSchema.parse({
    id: record.id,
    name: record.name_tr,
    type: record.asset_type.label_tr,
    city: record.city.label_tr,
    district: record.district,
    status: record.status,
    origin: panel ? "panel" : "dataset",
    createdBy: panel ? record.prepared_by!.slice(PANEL_PREFIX.length) : record.prepared_by || "veri seti",
    updatedAt: record.updated_at.toISOString(),
  });
}


const userNotFound = () => new HttpError(404, "USER_NOT_FOUND", "User not found");
const assetNotFound = (id: string) => new HttpError(404, "ASSET_NOT_FOUND", `No asset "${id}"`);

export interface AdminRoutesOptions {
  repository: AdminRepository;
  /** For signing in the caller. */
  community: CommunityRepository;
}

/** The admin panel's data. Moderators see the summary and users; roles and assets are for admins. */
export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (app, { repository, community }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };

  /** Checks the codes and returns the city's region, which the stored record needs. */
  async function regionFor(input: { type: string; city: string; era?: string | null }): Promise<string> {
    const codes = await repository.findCodes({ type: input.type, city: input.city, era: input.era ?? null });
    const unknown = [
      !codes.type && `type "${input.type}"`,
      codes.region === null && `city "${input.city}"`,
      !codes.era && `era "${input.era}"`,
    ].filter(Boolean);
    if (unknown.length > 0 || codes.region === null) {
      throw new HttpError(400, "UNKNOWN_CODE", `Unknown ${unknown.join(", ")}; see GET /meta/enums`);
    }
    return codes.region;
  }

  /**
   * Writes a whole record after checking its codes. A panel asset's `source_json` is rebuilt as a
   * dataset file; a dataset asset keeps its own, which the next import restores it from.
   */
  async function saveRecord(id: string, record: AdminAssetRecord, username: string, target: { mode: "create" } | { mode: "update"; preparedBy: string | null; createdAt: Date }) {
    const region = await regionFor(record);
    const panel = target.mode === "create" || (target.preparedBy?.startsWith(PANEL_PREFIX) ?? false);
    const createdAt = (target.mode === "create" ? new Date() : target.createdAt).toISOString().slice(0, 10);
    const todos = [PANEL_TODO];
    const sourceJson = panel ? datasetJson(id, record, { region, username, createdAt, today: turkeyToday(), todos }) : undefined;
    try {
      return await repository.writeRecord(id, record, {
        mode: target.mode,
        reviewer: username,
        ...(sourceJson && { sourceJson }),
        ...(target.mode === "create" && { preparedBy: `${PANEL_PREFIX}${username}`, todos }),
      });
    } catch (error) {
      // A code no table knows: a timeline event type or the complex's id.
      if ((error as { code?: string }).code === "P2003") throw new HttpError(400, "UNKNOWN_CODE", "A code or the complex id is unknown; see GET /meta/enums");
      throw error;
    }
  }

  async function recordResponse(id: string): Promise<AdminAssetRecordResponse> {
    const row = await repository.readRecord(id);
    if (!row) throw assetNotFound(id);
    return AdminAssetRecordResponseSchema.parse({ id, origin: isPanel(row.prepared_by) ? "panel" : "dataset", record: toAssetRecord(row) });
  }

  app.get("/admin/summary", {
    schema: {
      tags: ["moderation"],
      summary: "Panelin ilk ekranı: bekleyen notlar ve fotoğraflar, kullanıcılar, panelden eklenen eserler",
      security: bearer,
      response: { 200: toOpenApiSchema(AdminSummaryResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<AdminSummaryResponse> => {
    await requireUser(request, community, "moderator");
    const s = await repository.summary();
    reply.header("cache-control", "no-store");
    return AdminSummaryResponseSchema.parse({
      version: CONTRACT_VERSION,
      pending: { notes: s.pendingNotes, photos: s.pendingPhotos },
      users: { total: s.users, accounts: s.accounts, banned: s.banned },
      panelAssets: s.panelAssets,
    });
  });

  app.get("/admin/users", {
    schema: {
      tags: ["moderation"],
      summary: "Kullanıcılar (yeniden eskiye), takma ad ya da kullanıcı adıyla aranır",
      security: bearer,
      querystring: toOpenApiSchema(UsersQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AdminUsersResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<AdminUsersResponse> => {
    await requireUser(request, community, "moderator");
    const query = parseWith(UsersQuerySchema, request.query, "INVALID_QUERY");
    const { total, items } = await repository.listUsers(query);
    reply.header("cache-control", "no-store");
    return AdminUsersResponseSchema.parse({
      total,
      limit: query.limit,
      offset: query.offset,
      items: items.map(toAdminUser),
    });
  });

  app.post("/admin/users/:id/role", {
    schema: {
      tags: ["moderation"],
      summary: "Rol ver (yalnızca admin; kendi rolünü değiştiremez)",
      security: bearer,
      params: toOpenApiSchema(UserParamsSchema, "input"),
      body: toOpenApiSchema(SetUserRoleRequestSchema, "input"),
      response: { 200: toOpenApiSchema(AdminUserSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminUser> => {
    const admin = await requireUser(request, community, "admin");
    const { id } = parseWith(UserParamsSchema, request.params, "INVALID_ID");
    const { role } = parseWith(SetUserRoleRequestSchema, request.body, "INVALID_BODY");
    // An admin who demoted themself could leave the panel without any admin.
    if (id === admin.id) throw new HttpError(400, "OWN_ROLE", "Admins cannot change their own role");
    const user = await repository.setRole(id, role);
    if (!user) throw userNotFound();
    return AdminUserSchema.parse(toAdminUser(user));
  });

  app.post("/admin/users/:id/unban", {
    schema: {
      tags: ["moderation"],
      summary: "Engeli kaldır; onaylı katkıları yeniden görünür",
      security: bearer,
      params: toOpenApiSchema(UserParamsSchema, "input"),
      response: { 200: toOpenApiSchema(AdminUserSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminUser> => {
    await requireUser(request, community, "moderator");
    const { id } = parseWith(UserParamsSchema, request.params, "INVALID_ID");
    const user = await repository.unban(id);
    if (!user) throw userNotFound();
    return AdminUserSchema.parse(toAdminUser(user));
  });

  app.get("/admin/assets", {
    schema: {
      tags: ["moderation"],
      summary: "Tüm eserler: panelden eklenenler ve veri setindekiler",
      security: bearer,
      response: { 200: toOpenApiSchema(AdminAssetsResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<AdminAssetsResponse> => {
    await requireUser(request, community, "admin");
    reply.header("cache-control", "no-store");
    return AdminAssetsResponseSchema.parse({ items: (await repository.listAssets()).map(toAdminAsset) });
  });

  app.post("/admin/assets", {
    schema: {
      tags: ["moderation"],
      summary: "Yeni eser ekle (yalnızca admin); id adından üretilir, taslak ya da yayında",
      security: bearer,
      body: toOpenApiSchema(AdminAssetInputSchema, "input"),
      response: { 201: toOpenApiSchema(AdminAssetSchema), 400: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<AdminAsset> => {
    const admin = await requireUser(request, community, "admin");
    const input = parseWith(AdminAssetInputSchema, request.body, "INVALID_BODY");
    const id = panelAssetId(input);
    if (await repository.assetExists(id)) throw new HttpError(409, "ASSET_EXISTS", `An asset "${id}" already exists`);

    const saved = await saveRecord(id, recordFromInput(input), admin.username ?? admin.nickname, { mode: "create" });
    reply.code(201);
    return toAdminAsset(saved);
  });

  app.post("/admin/assets/record", {
    bodyLimit: RECORD_BODY_LIMIT,
    schema: {
      tags: ["moderation"],
      summary: "Yeni eseri bütün bilgileriyle ekle (yalnızca admin); id adından ve ilçeden üretilir",
      security: bearer,
      body: toOpenApiSchema(AdminAssetRecordInputSchema, "input"),
      response: { 201: toOpenApiSchema(AdminAssetRecordResponseSchema), 400: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<AdminAssetRecordResponse> => {
    const admin = await requireUser(request, community, "admin");
    const record = parseWith(AdminAssetRecordInputSchema, request.body, "INVALID_BODY");
    const id = panelAssetId(record);
    if (!id || (await repository.assetExists(id))) throw new HttpError(409, "ASSET_EXISTS", `An asset "${id}" already exists`);
    await saveRecord(id, { ...record, media: [] }, admin.username ?? admin.nickname, { mode: "create" });
    reply.code(201);
    return recordResponse(id);
  });

  app.get("/admin/assets/:id/record", {
    schema: {
      tags: ["moderation"],
      summary: "Eserin bütün bilgileri, paneldeki düzenleyici için",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      response: { 200: toOpenApiSchema(AdminAssetRecordResponseSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<AdminAssetRecordResponse> => {
    await requireUser(request, community, "admin");
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    reply.header("cache-control", "no-store");
    return recordResponse(id);
  });

  app.put("/admin/assets/:id/record", {
    bodyLimit: RECORD_BODY_LIMIT,
    schema: {
      tags: ["moderation"],
      summary: "Eserin bütün bilgilerini kaydet; veri setindeki eserde bir sonraki içe aktarmada data/'daki hâline döner",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      body: toOpenApiSchema(AdminAssetRecordInputSchema, "input"),
      response: { 200: toOpenApiSchema(AdminAssetRecordResponseSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminAssetRecordResponse> => {
    const admin = await requireUser(request, community, "admin");
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const record = parseWith(AdminAssetRecordInputSchema, request.body, "INVALID_BODY");
    const current = await repository.readRecord(id);
    if (!current) throw assetNotFound(id);
    await saveRecord(id, record, admin.username ?? admin.nickname, { mode: "update", preparedBy: current.prepared_by, createdAt: current.created_at });
    return recordResponse(id);
  });

  app.patch("/admin/assets/:id", {
    schema: {
      tags: ["moderation"],
      summary: "Eseri düzenle ya da yayına al; veri setindeki eserde değişiklik bir sonraki içe aktarmada data/'daki hâline döner",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      body: toOpenApiSchema(AdminAssetPatchSchema, "input"),
      response: { 200: toOpenApiSchema(AdminAssetSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminAsset> => {
    const admin = await requireUser(request, community, "admin");
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const patch = parseWith(AdminAssetPatchSchema, request.body, "INVALID_BODY");
    const current = await repository.readRecord(id);
    if (!current) throw assetNotFound(id);
    // The id stays as created, even when the name or district changes, so links to it keep working.
    const record = applyPatch(toAssetRecord(current), patch);
    return toAdminAsset(await saveRecord(id, record, admin.username ?? admin.nickname, { mode: "update", preparedBy: current.prepared_by, createdAt: current.created_at }));
  });

  app.delete("/admin/assets/:id", {
    schema: {
      tags: ["moderation"],
      summary: "Panelden eklenen eseri sil (katkıları da silinir)",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "admin");
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    if (!(await repository.deletePanelAsset(id))) throw assetNotFound(id);
    return reply.code(204).send();
  });
};

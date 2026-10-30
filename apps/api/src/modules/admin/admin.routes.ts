import {
  AdminAssetInputSchema,
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
import {
  PANEL_PREFIX,
  panelAssetId,
  panelAssetInputOf,
  panelAssetJson,
  panelAssetRow,
  panelAssetSection,
  type PanelAssetInput,
} from "./panel-asset.ts";

const UsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(40).optional().describe("Takma ad ya da kullanıcı adında geçen"),
  role: UserRoleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const UserParamsSchema = z.object({ id: z.uuid() });
const AssetParamsSchema = z.object({ id: AssetIdSchema });

const bearer = [{ bearerAuth: [] }];

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

function toAdminAsset(record: PanelAssetRecord): AdminAsset {
  return AdminAssetSchema.parse({
    id: record.id,
    name: record.name_tr,
    type: record.asset_type.label_tr,
    city: record.city.label_tr,
    district: record.district,
    status: record.status,
    createdBy: (record.prepared_by ?? "").slice(PANEL_PREFIX.length),
    updatedAt: record.updated_at.toISOString(),
  });
}

const userNotFound = () => new HttpError(404, "USER_NOT_FOUND", "User not found");
const assetNotFound = (id: string) => new HttpError(404, "ASSET_NOT_FOUND", `No asset "${id}" was added from the panel`);

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
  async function regionFor(input: PanelAssetInput): Promise<string> {
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

  /** Builds and writes the asset; an update keeps the id it was created with. */
  async function save(id: string, input: PanelAssetInput, username: string, createdAt: string, mode: "create" | "update") {
    const region = await regionFor(input);
    const json = panelAssetJson(id, input, { region, username, createdAt, today: turkeyToday() });
    return repository.savePanelAsset(panelAssetRow(id, input, json, username), panelAssetSection(id, input), mode);
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
      summary: "Panelden eklenen eserler (taslak ve yayında)",
      security: bearer,
      response: { 200: toOpenApiSchema(AdminAssetsResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<AdminAssetsResponse> => {
    await requireUser(request, community, "admin");
    reply.header("cache-control", "no-store");
    return AdminAssetsResponseSchema.parse({ items: (await repository.listPanelAssets()).map(toAdminAsset) });
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

    const saved = await save(id, input, admin.username ?? admin.nickname, turkeyToday(), "create");
    reply.code(201);
    return toAdminAsset(saved);
  });

  app.patch("/admin/assets/:id", {
    schema: {
      tags: ["moderation"],
      summary: "Panelden eklenen eseri düzenle ya da yayına al (veri setindeki eserler data/'da düzenlenir)",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      body: toOpenApiSchema(AdminAssetPatchSchema, "input"),
      response: { 200: toOpenApiSchema(AdminAssetSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminAsset> => {
    const admin = await requireUser(request, community, "admin");
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const patch = parseWith(AdminAssetPatchSchema, request.body, "INVALID_BODY");
    const existing = await repository.findPanelAsset(id);
    if (!existing) throw assetNotFound(id);

    // The id stays as created, even when the name or district changes, so links to it keep working.
    const input: PanelAssetInput = { ...panelAssetInputOf(existing.source_json), ...patch };
    const createdAt = existing.created_at.toISOString().slice(0, 10);
    return toAdminAsset(await save(id, input, admin.username ?? admin.nickname, createdAt, "update"));
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

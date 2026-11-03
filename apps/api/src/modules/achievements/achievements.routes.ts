import {
  AchievementRuleSchema,
  AchievementsResponseSchema,
  AdminAchievementInputSchema,
  AdminAchievementPatchSchema,
  AdminAchievementSchema,
  AdminAchievementsResponseSchema,
  AssetIdSchema,
  CONTRACT_VERSION,
  LangSchema,
  MyAchievementsResponseSchema,
  MyConnectionsResponseSchema,
  MyVisitsResponseSchema,
  VISIT_RADIUS_METERS,
  VisitProofRequestSchema,
  VisitRequestSchema,
  VisitResponseSchema,
  type Achievement,
  type AchievementRule,
  type AchievementsResponse,
  type AdminAchievement,
  type AdminAchievementsResponse,
  type Connection,
  type Lang,
  type MyAchievementsResponse,
  type MyConnectionsResponse,
  type MyVisitsResponse,
  type VisitResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { APPROXIMATE_SOURCE, requiredConfidence, toCoordinates } from "../assets/assets.mapper.ts";
import { distanceMeters } from "../assets/assets.network.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import type { AchievementRecord, AchievementsRepository } from "./achievements.repository.ts";
import { activityPoints, isEarned, progressOf } from "./rules.ts";

/** Visits one user may record per day: a full day of walking, not a script. */
export const VISITS_PER_DAY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const LangQuerySchema = z.object({ lang: LangSchema.optional() });
const AssetParamsSchema = z.object({ id: AssetIdSchema });
const CodeParamsSchema = z.object({ code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

const bearer = [{ bearerAuth: [] }];

function toAchievement(record: AchievementRecord, lang: Lang): Achievement {
  return {
    code: record.code,
    title: pick(record.title_tr, record.title_en, lang),
    description: pick(record.description_tr, record.description_en, lang),
    badge: record.badge,
    points: record.points,
    rule: AchievementRuleSchema.parse(record.rule),
  };
}

const langOf = (request: FastifyRequest) =>
  resolveLang(parseWith(LangQuerySchema, request.query, "INVALID_QUERY").lang, request.headers["accept-language"]);

const notFound = (code: string) => new HttpError(404, "ACHIEVEMENT_NOT_FOUND", `No achievement "${code}"`);

export interface AchievementsRoutesOptions {
  repository: AchievementsRepository;
  /** For signing in the caller. */
  community: CommunityRepository;
  /**
   * `POST /assets/:id/visit/unlock`: a visit recorded without position or photo, for the app's
   * "Kilidi aç" while Ziyaret Mührü is tried away from the sites. Off unless turned on.
   */
  demoUnlock?: boolean;
}

export const achievementsRoutes: FastifyPluginAsync<AchievementsRoutesOptions> = async (
  app,
  { repository, community, demoUnlock = false },
) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };

  /** Progress on every active achievement; records the newly earned ones. */
  async function evaluate(userId: string) {
    const achievements = await repository.listAchievements({ activeOnly: true });
    const rules = achievements.map((record) => ({ record, rule: AchievementRuleSchema.parse(record.rule) }));
    const complexIds = rules.flatMap(({ rule }) => (rule.kind === "complex" ? [rule.parentId] : []));
    const [facts, earned] = await Promise.all([repository.facts(userId, complexIds), repository.earnedBy(userId)]);
    const results = rules.map(({ record, rule }) => ({ record, progress: progressOf(rule, facts) }));
    const fresh = results.filter((r) => !earned.has(r.record.code) && isEarned(r.progress)).map((r) => r.record);
    await repository.award(userId, fresh.map((r) => r.code));
    const now = new Date();
    for (const r of fresh) earned.set(r.code, now);
    return { results, earned, fresh, facts };
  }

  /** A rule may only refer to cities, eras and complexes that exist. */
  async function checkRule(rule: AchievementRule) {
    const missing = await repository.missingRefs({
      city: "city" in rule ? rule.city : undefined,
      era: "era" in rule ? rule.era : undefined,
      parentId: rule.kind === "complex" ? rule.parentId : undefined,
    });
    if (missing.length > 0) throw new HttpError(400, "UNKNOWN_CODE", `Unknown ${missing.join(", ")}`);
  }

  /**
   * The checked distance to the asset, or null when it cannot be checked: an asset without a
   * point, or with only its neighbourhood's centre, takes the visit unchecked.
   */
  function checkPosition(
    asset: { lat: number | null; lng: number | null; coord_source: string | null },
    position: { lat?: number | undefined; lng?: number | undefined },
  ): number | null {
    if (asset.lat === null || asset.lng === null || asset.coord_source === APPROXIMATE_SOURCE) return null;
    if (position.lat === undefined || position.lng === undefined) {
      throw new HttpError(400, "POSITION_REQUIRED", "This asset has a location: send lat and lng");
    }
    const distance = Math.round(distanceMeters({ lat: position.lat, lng: position.lng }, { lat: asset.lat, lng: asset.lng }));
    if (distance > VISIT_RADIUS_METERS) {
      throw new HttpError(400, "TOO_FAR", `You are ${distance} m away; come within ${VISIT_RADIUS_METERS} m`);
    }
    return distance;
  }

  async function checkDailyLimit(userId: string) {
    if ((await repository.countVisitsSince(userId, new Date(Date.now() - DAY_MS))) >= VISITS_PER_DAY) {
      throw new HttpError(429, "VISIT_LIMIT", `At most ${VISITS_PER_DAY} visits per day`);
    }
  }

  app.post("/assets/:id/visit", {
    config: { rateLimit: { max: 60, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["community"],
      summary: `Ziyaret kaydet: noktası olan eserde konum ${VISIT_RADIUS_METERS} m içinde olmalı; kazanılan başarımlar döner`,
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      body: toOpenApiSchema(VisitRequestSchema, "input"),
      response: {
        200: toOpenApiSchema(VisitResponseSchema),
        400: errorSchema,
        404: errorSchema,
        429: errorSchema,
        ...denied,
      },
    },
  }, async (request): Promise<VisitResponse> => {
    const user = await requireUser(request, community);
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const position = parseWith(VisitRequestSchema, request.body ?? {}, "INVALID_BODY");
    const lang = langOf(request);
    const asset = await repository.findAsset(id);
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);

    const distance = checkPosition(asset, position);
    await checkDailyLimit(user.id);
    const firstVisit = await repository.recordVisit({ userId: user.id, assetId: id, verified: distance !== null, distance });
    const { fresh } = await evaluate(user.id);

    return VisitResponseSchema.parse({
      version: CONTRACT_VERSION,
      assetId: id,
      verified: distance !== null,
      distanceMeters: distance,
      firstVisit,
      newAchievements: fresh.map((r) => toAchievement(r, lang)),
    });
  });

  app.post("/assets/:id/visit/proof", {
    config: { rateLimit: { max: 30, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["community"],
      summary: "Ziyareti kanıtla: uygulama eserin mühür fotoğrafını kamerada tanıdı (Ziyaret Mührü); konum kuralı ziyaretteki gibi",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      body: toOpenApiSchema(VisitProofRequestSchema, "input"),
      response: {
        200: toOpenApiSchema(VisitResponseSchema),
        400: errorSchema,
        404: errorSchema,
        429: errorSchema,
        ...denied,
      },
    },
  }, async (request): Promise<VisitResponse> => {
    const user = await requireUser(request, community);
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const proof = parseWith(VisitProofRequestSchema, request.body, "INVALID_BODY");
    const lang = langOf(request);
    const asset = await repository.findAsset(id);
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);
    // The recognised photo must be one of this asset's, not a photo of another site.
    if (!(await repository.hasMedia(id, proof.mediaKey))) {
      throw new HttpError(400, "UNKNOWN_MEDIA", `"${proof.mediaKey}" is not a photo of this asset`);
    }
    const distance = checkPosition(asset, proof);
    await checkDailyLimit(user.id);
    const firstVisit = await repository.proveVisit({
      userId: user.id,
      assetId: id,
      verified: distance !== null,
      distance,
      method: proof.method,
    });
    const { fresh } = await evaluate(user.id);

    return VisitResponseSchema.parse({
      version: CONTRACT_VERSION,
      assetId: id,
      verified: distance !== null,
      distanceMeters: distance,
      firstVisit,
      proven: true,
      newAchievements: fresh.map((r) => toAchievement(r, lang)),
    });
  });

  if (demoUnlock) {
    app.post("/assets/:id/visit/unlock", {
      config: { rateLimit: { max: 60, timeWindow: 60 * 60 * 1000 } },
      schema: {
        tags: ["community"],
        summary: "Deneme: eserin kilidini konum ve fotoğraf olmadan aç (uygulamadaki \"Kilidi aç\"); ziyaret kanıtsız sayılır",
        security: bearer,
        params: toOpenApiSchema(AssetParamsSchema, "input"),
        querystring: toOpenApiSchema(LangQuerySchema, "input"),
        response: { 200: toOpenApiSchema(VisitResponseSchema), 400: errorSchema, 404: errorSchema, 429: errorSchema, ...denied },
      },
    }, async (request): Promise<VisitResponse> => {
      const user = await requireUser(request, community);
      const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
      const lang = langOf(request);
      if (!(await repository.findAsset(id))) throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);
      await checkDailyLimit(user.id);
      const firstVisit = await repository.recordVisit({ userId: user.id, assetId: id, verified: false, distance: null });
      const { fresh } = await evaluate(user.id);

      return VisitResponseSchema.parse({
        version: CONTRACT_VERSION,
        assetId: id,
        verified: false,
        distanceMeters: null,
        firstVisit,
        newAchievements: fresh.map((r) => toAchievement(r, lang)),
      });
    });
  }

  app.get("/achievements", {
    schema: {
      tags: ["community"],
      summary: "Bütün başarımlar, gereksinim kurallarıyla",
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AchievementsResponseSchema), 400: errorSchema },
    },
  }, async (request, reply): Promise<AchievementsResponse> => {
    const lang = langOf(request);
    const items = await repository.listAchievements({ activeOnly: true });
    reply.header("cache-control", "public, max-age=300");
    return AchievementsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      items: items.map((a) => toAchievement(a, lang)),
    });
  });

  app.get("/me/achievements", {
    schema: {
      tags: ["community"],
      summary: "Başarımlarım: ilerleme, kazanılanlar ve toplam puan",
      security: bearer,
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(MyAchievementsResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<MyAchievementsResponse> => {
    const user = await requireUser(request, community);
    const lang = langOf(request);
    // Contributions approved since the last call are counted here.
    const { results, earned, facts } = await evaluate(user.id);
    const items = results.map(({ record, progress }) => ({
      ...toAchievement(record, lang),
      earnedAt: earned.get(record.code)?.toISOString() ?? null,
      progress,
    }));
    const activity = activityPoints(facts);
    reply.header("cache-control", "no-store");
    return MyAchievementsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      totalPoints: items.reduce((sum, item) => sum + (item.earnedAt ? item.points : 0), 0) + activity,
      activityPoints: activity,
      visits: facts.visits.length,
      sealed: facts.visits.filter((v) => v.proven).length,
      notes: { approved: facts.approved.notes, pending: facts.pending.notes },
      photos: { approved: facts.approved.photos, pending: facts.pending.photos },
      items,
    });
  });

  app.get("/me/visits", {
    schema: {
      tags: ["community"],
      summary: "Ziyaret ettiğim eserler (yeniden eskiye); harita bunların sisini kaldırır",
      security: bearer,
      response: { 200: toOpenApiSchema(MyVisitsResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<MyVisitsResponse> => {
    const user = await requireUser(request, community);
    const visits = await repository.listVisits(user.id);
    reply.header("cache-control", "no-store");
    return MyVisitsResponseSchema.parse({
      version: CONTRACT_VERSION,
      items: visits.map((v) => ({
        assetId: v.asset_id,
        visitedAt: v.visited_at.toISOString(),
        verified: v.verified,
        proven: v.proven_at !== null,
      })),
    });
  });

  app.get("/me/connections", {
    schema: {
      tags: ["community"],
      summary: "Keşfettiğim eserlerin bağları; öbür eser keşfedilene kadar yalnızca yeri (gizemli bağ)",
      security: bearer,
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(MyConnectionsResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<MyConnectionsResponse> => {
    const user = await requireUser(request, community);
    const query = parseWith(LangQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    const { visited, relations, assets } = await repository.connections(user.id);
    const byId = new Map(assets.map((a) => [a.id, a]));
    const items: Connection[] = [];
    const hidden = new Set<string>();
    for (const relation of relations) {
      const ends = [
        { from: relation.source_asset_id, to: relation.target_asset_id, direction: "outgoing" as const },
        { from: relation.target_asset_id, to: relation.source_asset_id, direction: "incoming" as const },
      ];
      for (const { from, to, direction } of ends) {
        // Bonds to places outside the dataset, or to assets not published, have no point to glow at.
        const other = byId.get(to);
        if (!visited.has(from) || !byId.has(from) || !other || from === to) continue;
        const coordinates = toCoordinates(other);
        if (!visited.has(to)) {
          // One glow per hidden asset, however many bonds lead to it.
          const key = `${from}>${to}`;
          if (!hidden.has(key)) items.push({ revealed: false, from, to, toCoordinates: coordinates });
          hidden.add(key);
          continue;
        }
        items.push({
          revealed: true,
          from,
          to,
          toCoordinates: coordinates,
          toName: pick(other.name_tr, other.name_en, lang),
          type: { code: relation.relation_type.code, label: pick(relation.relation_type.label_tr, relation.relation_type.label_en, lang) },
          direction,
          description: pick(relation.description_tr, relation.description_en, lang),
          confidence: requiredConfidence(relation.confidence, lang),
        });
      }
    }
    reply.header("cache-control", "no-store");
    return MyConnectionsResponseSchema.parse({ version: CONTRACT_VERSION, lang, items });
  });

  function toAdminAchievement(record: AchievementRecord, earnedCount: number): AdminAchievement {
    return AdminAchievementSchema.parse({
      ...toAchievement(record, "tr"),
      sortOrder: record.sort_order,
      active: record.active,
      createdBy: record.created_by,
      earnedCount,
    });
  }

  app.get("/admin/achievements", {
    schema: {
      tags: ["moderation"],
      summary: "Bütün başarımlar (kapalılar dahil) ve kaç kişinin kazandığı",
      security: bearer,
      response: { 200: toOpenApiSchema(AdminAchievementsResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<AdminAchievementsResponse> => {
    await requireUser(request, community, "moderator");
    const [items, counts] = await Promise.all([repository.listAchievements({ activeOnly: false }), repository.earnedCounts()]);
    reply.header("cache-control", "no-store");
    return AdminAchievementsResponseSchema.parse({ items: items.map((a) => toAdminAchievement(a, counts.get(a.code) ?? 0)) });
  });

  app.post("/admin/achievements", {
    schema: {
      tags: ["moderation"],
      summary: "Yeni başarım ekle (yalnızca admin)",
      security: bearer,
      body: toOpenApiSchema(AdminAchievementInputSchema, "input"),
      response: { 201: toOpenApiSchema(AdminAchievementSchema), 400: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<AdminAchievement> => {
    const admin = await requireUser(request, community, "admin");
    const input = parseWith(AdminAchievementInputSchema, request.body, "INVALID_BODY");
    await checkRule(input.rule);
    if (await repository.findAchievement(input.code)) {
      throw new HttpError(409, "ACHIEVEMENT_EXISTS", `An achievement "${input.code}" already exists`);
    }
    const created = await repository.createAchievement({
      code: input.code,
      title_tr: input.title.tr,
      title_en: input.title.en ?? null,
      description_tr: input.description.tr,
      description_en: input.description.en ?? null,
      badge: input.badge,
      points: input.points,
      rule: input.rule,
      sort_order: input.sortOrder,
      active: input.active,
      created_by: admin.username ?? admin.nickname,
    });
    reply.code(201);
    return toAdminAchievement(created, 0);
  });

  app.patch("/admin/achievements/:code", {
    schema: {
      tags: ["moderation"],
      summary: "Başarımı düzenle ya da kapat (yalnızca admin); kazanılmış olanlar kalır",
      security: bearer,
      params: toOpenApiSchema(CodeParamsSchema, "input"),
      body: toOpenApiSchema(AdminAchievementPatchSchema, "input"),
      response: { 200: toOpenApiSchema(AdminAchievementSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminAchievement> => {
    await requireUser(request, community, "admin");
    const { code } = parseWith(CodeParamsSchema, request.params, "INVALID_ID");
    const patch = parseWith(AdminAchievementPatchSchema, request.body, "INVALID_BODY");
    if (!(await repository.findAchievement(code))) throw notFound(code);
    if (patch.rule) await checkRule(patch.rule);
    const updated = await repository.updateAchievement(code, {
      ...(patch.title && { title_tr: patch.title.tr, title_en: patch.title.en ?? null }),
      ...(patch.description && { description_tr: patch.description.tr, description_en: patch.description.en ?? null }),
      ...(patch.badge !== undefined && { badge: patch.badge }),
      ...(patch.points !== undefined && { points: patch.points }),
      ...(patch.rule && { rule: patch.rule }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      ...(patch.active !== undefined && { active: patch.active }),
    });
    return toAdminAchievement(updated, (await repository.earnedCounts()).get(code) ?? 0);
  });

  app.delete("/admin/achievements/:code", {
    schema: {
      tags: ["moderation"],
      summary: "Başarımı sil (kazananlardan da kalkar); yalnızca gizlemek için PATCH active: false",
      security: bearer,
      params: toOpenApiSchema(CodeParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "admin");
    const { code } = parseWith(CodeParamsSchema, request.params, "INVALID_ID");
    if (!(await repository.deleteAchievement(code))) throw notFound(code);
    return reply.code(204).send();
  });
};

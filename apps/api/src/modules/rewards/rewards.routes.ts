import {
  AddRewardCodesRequestSchema,
  AddRewardCodesResponseSchema,
  AdminRewardInputSchema,
  AdminRewardPatchSchema,
  AdminRewardSchema,
  AdminRewardsResponseSchema,
  CONTRACT_VERSION,
  LangSchema,
  RedeemResponseSchema,
  RewardKindSchema,
  RewardsResponseSchema,
  WalletResponseSchema,
  type AddRewardCodesResponse,
  type AdminReward,
  type AdminRewardsResponse,
  type Lang,
  type Redemption,
  type RedeemResponse,
  type Reward,
  type RewardsResponse,
  type WalletResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import type { RedemptionRecord, RewardRecord, RewardsRepository } from "./rewards.repository.ts";

const LangQuerySchema = z.object({ lang: LangSchema.optional() });
const CodeParamsSchema = z.object({ code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

const bearer = [{ bearerAuth: [] }];

const langOf = (request: FastifyRequest) =>
  resolveLang(parseWith(LangQuerySchema, request.query, "INVALID_QUERY").lang, request.headers["accept-language"]);

function toReward(record: RewardRecord, stock: number, lang: Lang): Reward {
  return {
    code: record.code,
    title: pick(record.title_tr, record.title_en, lang),
    description: pick(record.description_tr, record.description_en, lang),
    partner: record.partner,
    kind: RewardKindSchema.parse(record.kind),
    costPoints: record.cost_points,
    minProvenVisits: record.min_proven_visits,
    stock,
    sample: record.sample,
  };
}

function toRedemption(record: RedemptionRecord, lang: Lang): Redemption {
  return {
    id: record.id,
    reward: {
      code: record.reward.code,
      title: pick(record.reward.title_tr, record.reward.title_en, lang),
      partner: record.reward.partner,
      kind: RewardKindSchema.parse(record.reward.kind),
    },
    code: record.issued_code.code,
    points: record.points,
    createdAt: record.created_at.toISOString(),
  };
}

const rewardNotFound = (code: string) => new HttpError(404, "REWARD_NOT_FOUND", `No reward "${code}"`);

export interface RewardsRoutesOptions {
  repository: RewardsRepository;
  /** For signing in the caller. */
  community: CommunityRepository;
}

/** Reward catalog, wallet and redemption; admins manage rewards and upload the partners' codes. */
export const rewardsRoutes: FastifyPluginAsync<RewardsRoutesOptions> = async (app, { repository, community }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };

  app.get("/rewards", {
    schema: {
      tags: ["community"],
      summary: "Ödül kataloğu: puan bedeli, gereken kanıtlanmış ziyaret ve kalan kod sayısı",
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(RewardsResponseSchema), 400: errorSchema },
    },
  }, async (request, reply): Promise<RewardsResponse> => {
    const lang = langOf(request);
    const [items, stock] = await Promise.all([repository.listRewards({ activeOnly: true }), repository.stock()]);
    reply.header("cache-control", "public, max-age=60");
    return RewardsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      items: items.map((r) => toReward(r, stock.get(r.code) ?? 0, lang)),
    });
  });

  app.get("/me/wallet", {
    schema: {
      tags: ["community"],
      summary: "Cüzdan: bakiye, kazanılan ve harcanan puan, kanıtlanmış ziyaretler, alınan kodlar",
      security: bearer,
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(WalletResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<WalletResponse> => {
    const user = await requireUser(request, community);
    const lang = langOf(request);
    const [totals, redemptions] = await Promise.all([repository.totals(user.id), repository.redemptions(user.id)]);
    reply.header("cache-control", "no-store");
    return WalletResponseSchema.parse({
      version: CONTRACT_VERSION,
      balance: Math.max(0, totals.earned - totals.spent),
      earned: totals.earned,
      spent: totals.spent,
      provenVisits: totals.provenVisits,
      redemptions: redemptions.map((r) => toRedemption(r, lang)),
    });
  });

  app.post("/rewards/:code/redeem", {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    schema: {
      tags: ["community"],
      summary: "Puanla ödül al: bakiyeden düşülür, tek kullanımlık bir kod verilir",
      security: bearer,
      params: toOpenApiSchema(CodeParamsSchema, "input"),
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: {
        200: toOpenApiSchema(RedeemResponseSchema),
        400: errorSchema,
        404: errorSchema,
        409: errorSchema,
        429: errorSchema,
        ...denied,
      },
    },
  }, async (request, reply): Promise<RedeemResponse> => {
    const user = await requireUser(request, community);
    const { code } = parseWith(CodeParamsSchema, request.params, "INVALID_ID");
    const lang = langOf(request);
    const result = await repository.redeem(user.id, code);
    if (!result.ok) {
      if (result.reason === "not_found") throw rewardNotFound(code);
      if (result.reason === "proven_visits") {
        throw new HttpError(409, "PROVEN_VISITS_REQUIRED", `This reward needs ${result.needed} proven visits`);
      }
      if (result.reason === "points") {
        throw new HttpError(409, "INSUFFICIENT_POINTS", `This reward costs ${result.needed} points`);
      }
      throw new HttpError(409, "OUT_OF_STOCK", "No codes left for this reward");
    }
    reply.header("cache-control", "no-store");
    return RedeemResponseSchema.parse({
      version: CONTRACT_VERSION,
      redemption: toRedemption(result.redemption, lang),
      balance: result.balance,
    });
  });

  function toAdminReward(record: RewardRecord, counts: { total: number; used: number } | undefined): AdminReward {
    const { total = 0, used = 0 } = counts ?? {};
    return AdminRewardSchema.parse({
      ...toReward(record, total - used, "tr"),
      active: record.active,
      sortOrder: record.sort_order,
      createdBy: record.created_by,
      codesTotal: total,
      codesUsed: used,
    });
  }

  app.get("/admin/rewards", {
    schema: {
      tags: ["moderation"],
      summary: "Bütün ödüller (kapalılar dahil), yüklenen ve kullanılan kod sayısıyla",
      security: bearer,
      response: { 200: toOpenApiSchema(AdminRewardsResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<AdminRewardsResponse> => {
    await requireUser(request, community, "moderator");
    const [items, counts] = await Promise.all([repository.listRewards({ activeOnly: false }), repository.codeCounts()]);
    reply.header("cache-control", "no-store");
    return AdminRewardsResponseSchema.parse({ items: items.map((r) => toAdminReward(r, counts.get(r.code))) });
  });

  app.post("/admin/rewards", {
    schema: {
      tags: ["moderation"],
      summary: "Ödül ekle (yalnızca admin); kodları sonra /codes ile yüklenir",
      security: bearer,
      body: toOpenApiSchema(AdminRewardInputSchema, "input"),
      response: { 201: toOpenApiSchema(AdminRewardSchema), 400: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<AdminReward> => {
    const admin = await requireUser(request, community, "admin");
    const input = parseWith(AdminRewardInputSchema, request.body, "INVALID_BODY");
    if (await repository.findReward(input.code)) {
      throw new HttpError(409, "REWARD_EXISTS", `A reward "${input.code}" already exists`);
    }
    const created = await repository.createReward({
      code: input.code,
      title_tr: input.title.tr,
      title_en: input.title.en ?? null,
      description_tr: input.description.tr,
      description_en: input.description.en ?? null,
      partner: input.partner,
      kind: input.kind,
      cost_points: input.costPoints,
      min_proven_visits: input.minProvenVisits,
      sample: input.sample,
      active: input.active,
      sort_order: input.sortOrder,
      created_by: admin.username ?? admin.nickname,
    });
    reply.code(201);
    return toAdminReward(created, undefined);
  });

  app.patch("/admin/rewards/:code", {
    schema: {
      tags: ["moderation"],
      summary: "Ödülü düzenle ya da kapat (yalnızca admin); alınmış kodlar geçerli kalır",
      security: bearer,
      params: toOpenApiSchema(CodeParamsSchema, "input"),
      body: toOpenApiSchema(AdminRewardPatchSchema, "input"),
      response: { 200: toOpenApiSchema(AdminRewardSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AdminReward> => {
    await requireUser(request, community, "admin");
    const { code } = parseWith(CodeParamsSchema, request.params, "INVALID_ID");
    const patch = parseWith(AdminRewardPatchSchema, request.body, "INVALID_BODY");
    if (!(await repository.findReward(code))) throw rewardNotFound(code);
    const updated = await repository.updateReward(code, {
      ...(patch.title && { title_tr: patch.title.tr, title_en: patch.title.en ?? null }),
      ...(patch.description && { description_tr: patch.description.tr, description_en: patch.description.en ?? null }),
      ...(patch.partner !== undefined && { partner: patch.partner }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.costPoints !== undefined && { cost_points: patch.costPoints }),
      ...(patch.minProvenVisits !== undefined && { min_proven_visits: patch.minProvenVisits }),
      ...(patch.sample !== undefined && { sample: patch.sample }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      ...(patch.active !== undefined && { active: patch.active }),
    });
    return toAdminReward(updated, (await repository.codeCounts()).get(code));
  });

  app.post("/admin/rewards/:code/codes", {
    schema: {
      tags: ["moderation"],
      summary: "Ortak kurumun verdiği tek kullanımlık kodları yükle (yalnızca admin); tekrar edenler atlanır",
      security: bearer,
      params: toOpenApiSchema(CodeParamsSchema, "input"),
      body: toOpenApiSchema(AddRewardCodesRequestSchema, "input"),
      response: { 200: toOpenApiSchema(AddRewardCodesResponseSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request): Promise<AddRewardCodesResponse> => {
    await requireUser(request, community, "admin");
    const { code } = parseWith(CodeParamsSchema, request.params, "INVALID_ID");
    const { codes } = parseWith(AddRewardCodesRequestSchema, request.body, "INVALID_BODY");
    if (!(await repository.findReward(code))) throw rewardNotFound(code);
    const added = await repository.addCodes(code, [...new Set(codes)]);
    return AddRewardCodesResponseSchema.parse({
      added,
      duplicates: codes.length - added,
      stock: (await repository.stock()).get(code) ?? 0,
    });
  });
};

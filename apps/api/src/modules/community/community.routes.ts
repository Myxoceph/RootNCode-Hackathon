import {
  AnonymousSessionRequestSchema,
  AnonymousSessionResponseSchema,
  AppUserSchema,
  AssetIdSchema,
  CONTRACT_VERSION,
  ContributionSchema,
  CreateContributionRequestSchema,
  LangSchema,
  LoginRequestSchema,
  MyContributionsResponseSchema,
  PulseResponseSchema,
  RegisterRequestSchema,
  SessionResponseSchema,
  UpdateProfileRequestSchema,
  UpgradeAccountRequestSchema,
  type AnonymousSessionResponse,
  type AppUser,
  type Contribution,
  type MyContributionsResponse,
  type PulseResponse,
  type SessionResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { visibleStatuses, type AssetVisibility } from "../assets/assets.repository.ts";
import { bearerToken, hashPassword, hashToken, newToken, requireUser, verifyPassword } from "./auth.ts";
import { toAppUser, toContribution, toPulseItems } from "./community.mapper.ts";
import type { CommunityRepository } from "./community.repository.ts";
import type { PhotoUrls } from "./photo-urls.ts";

/** Contributions one user may send per hour, across all assets. */
export const CONTRIBUTIONS_PER_HOUR = 5;

const AssetParamsSchema = z.object({ id: AssetIdSchema });
const PulseQuerySchema = z.object({
  lang: LangSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20).describe("En fazla kaç topluluk katkısı"),
});
const MyContributionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const HOUR_MS = 60 * 60 * 1000;
// Per IP: room for a family on one connection, too little for password guessing.
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: 15 * 60 * 1000 };
const REGISTER_RATE_LIMIT = { max: 10, timeWindow: HOUR_MS };

const TAKEN = {
  username_taken: () => new HttpError(409, "USERNAME_TAKEN", "This username is already taken"),
  email_taken: () => new HttpError(409, "EMAIL_TAKEN", "An account with this e-mail already exists"),
};
const PROFILE_RATE_LIMIT = { max: 30, timeWindow: HOUR_MS };
const bearer = [{ bearerAuth: [] }];

function assetNotFound(id: string): HttpError {
  return new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);
}

export interface CommunityRoutesOptions {
  repository: CommunityRepository;
  /** Signs the paths of the author's own photos. */
  photoUrls: PhotoUrls;
  visibility: AssetVisibility;
}

export const communityRoutes: FastifyPluginAsync<CommunityRoutesOptions> = async (app, { repository, visibility, photoUrls }) => {
  const statuses = visibleStatuses(visibility);
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  app.post("/auth/anonymous", {
    // Per-IP limit against mass sign-ups; visitors sharing event Wi-Fi still have room.
    config: { rateLimit: { max: 20, timeWindow: HOUR_MS } },
    schema: {
      tags: ["community"],
      summary: "Takma adla anonim oturum aç; token yalnızca bir kez gösterilir",
      body: toOpenApiSchema(AnonymousSessionRequestSchema, "input"),
      response: { 201: toOpenApiSchema(AnonymousSessionResponseSchema), 400: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<AnonymousSessionResponse> => {
    const { nickname } = parseWith(AnonymousSessionRequestSchema, request.body, "INVALID_BODY");
    const token = newToken();
    const user = await repository.createUser({ nickname, role: "visitor", tokenHash: hashToken(token) });
    if (typeof user === "string") throw new Error("An anonymous user has no username or e-mail");

    reply.code(201).header("cache-control", "no-store");
    return AnonymousSessionResponseSchema.parse({ user: toAppUser(user, photoUrls), token });
  });

  app.post("/auth/register", {
    config: { rateLimit: REGISTER_RATE_LIMIT },
    schema: {
      tags: ["community"],
      summary: "Kullanıcı adı, parola ve e-postayla hesap aç; token yalnızca bir kez gösterilir",
      body: toOpenApiSchema(RegisterRequestSchema, "input"),
      response: { 201: toOpenApiSchema(SessionResponseSchema), 400: errorSchema, 409: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<SessionResponse> => {
    const { username, password, email, nickname, fullName } = parseWith(RegisterRequestSchema, request.body, "INVALID_BODY");
    const token = newToken();
    const user = await repository.createUser({
      nickname: nickname ?? username,
      role: "visitor",
      tokenHash: hashToken(token),
      credentials: { username, passwordHash: await hashPassword(password), email },
      fullName: fullName ?? null,
    });
    if (typeof user === "string") throw TAKEN[user]();

    reply.code(201).header("cache-control", "no-store");
    return SessionResponseSchema.parse({ user: toAppUser(user, photoUrls), token });
  });

  app.post("/auth/login", {
    config: { rateLimit: LOGIN_RATE_LIMIT },
    schema: {
      tags: ["community"],
      summary: "Kullanıcı adı ve parolayla giriş; her giriş bu cihaz için yeni bir token verir",
      body: toOpenApiSchema(LoginRequestSchema, "input"),
      response: { 200: toOpenApiSchema(SessionResponseSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<SessionResponse> => {
    const { username, password } = parseWith(LoginRequestSchema, request.body, "INVALID_BODY");
    const account = await repository.findAccount(username);
    // One message for both cases, so the response does not reveal which usernames exist.
    if (!(await verifyPassword(password, account?.password_hash ?? null)) || account === null) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Wrong username or password");
    }
    if (account.banned_at !== null) throw new HttpError(403, "USER_BANNED", "This user can no longer sign in");
    const token = newToken();
    await repository.createSession(account.id, hashToken(token));

    reply.header("cache-control", "no-store");
    return SessionResponseSchema.parse({ user: toAppUser(account, photoUrls), token });
  });

  app.post("/auth/logout", {
    schema: {
      tags: ["community"],
      summary: "Bu cihazdaki oturumu kapat (token geçersiz olur)",
      security: bearer,
      response: { 204: { type: "null" }, 401: errorSchema },
    },
  }, async (request, reply) => {
    await requireUser(request, repository);
    await repository.deleteSession(hashToken(bearerToken(request)!));
    return reply.code(204).send();
  });

  app.post("/auth/upgrade", {
    config: { rateLimit: REGISTER_RATE_LIMIT },
    schema: {
      tags: ["community"],
      summary: "Anonim ziyaretçiyi hesaba çevir; katkıları ve bu oturum korunur",
      security: bearer,
      body: toOpenApiSchema(UpgradeAccountRequestSchema, "input"),
      response: { 200: toOpenApiSchema(AppUserSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<AppUser> => {
    const user = await requireUser(request, repository);
    const { username, password, email } = parseWith(UpgradeAccountRequestSchema, request.body, "INVALID_BODY");
    const result = await repository.addCredentials(user.id, { username, passwordHash: await hashPassword(password), email });
    if (result === "has_account") throw new HttpError(409, "ALREADY_REGISTERED", "This user already has an account");
    if (typeof result === "string") throw TAKEN[result]();

    reply.header("cache-control", "no-store");
    return AppUserSchema.parse(toAppUser(result, photoUrls));
  });

  app.get("/me", {
    schema: {
      tags: ["community"],
      summary: "Token'ın sahibi (oturum hâlâ geçerli mi?)",
      security: bearer,
      response: { 200: toOpenApiSchema(AppUserSchema), 401: errorSchema, 403: errorSchema },
    },
  }, async (request, reply): Promise<AppUser> => {
    const user = await requireUser(request, repository);
    reply.header("cache-control", "no-store");
    return AppUserSchema.parse(toAppUser(user, photoUrls));
  });

  app.patch("/me", {
    config: { rateLimit: PROFILE_RATE_LIMIT },
    schema: {
      tags: ["community"],
      summary: "Takma adı ya da ad soyadı değiştir (fullName: null siler)",
      security: bearer,
      body: toOpenApiSchema(UpdateProfileRequestSchema, "input"),
      response: { 200: toOpenApiSchema(AppUserSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<AppUser> => {
    const user = await requireUser(request, repository);
    const profile = parseWith(UpdateProfileRequestSchema, request.body, "INVALID_BODY");
    reply.header("cache-control", "no-store");
    return AppUserSchema.parse(toAppUser(await repository.updateProfile(user.id, profile), photoUrls));
  });

  app.get("/me/contributions", {
    schema: {
      tags: ["community"],
      summary: "Kendi katkılarım ve moderasyon durumları (yeniden eskiye)",
      security: bearer,
      querystring: toOpenApiSchema(MyContributionsQuerySchema, "input"),
      response: { 200: toOpenApiSchema(MyContributionsResponseSchema), 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply): Promise<MyContributionsResponse> => {
    const user = await requireUser(request, repository);
    const { limit } = parseWith(MyContributionsQuerySchema, request.query, "INVALID_QUERY");
    const items = await repository.listUserContributions(user.id, limit);

    reply.header("cache-control", "no-store");
    return MyContributionsResponseSchema.parse({ items: items.map((item) => toContribution(item, photoUrls)) });
  });

  app.post("/assets/:id/contributions", {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    schema: {
      tags: ["community"],
      summary: "Esere katkı gönder (ipucu, anı, düzeltme); moderatör onayından sonra nabızda görünür",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      body: toOpenApiSchema(CreateContributionRequestSchema, "input"),
      response: {
        201: toOpenApiSchema(ContributionSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        429: errorSchema,
      },
    },
  }, async (request, reply): Promise<Contribution> => {
    const user = await requireUser(request, repository);
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const { kind, body } = parseWith(CreateContributionRequestSchema, request.body, "INVALID_BODY");

    if ((await repository.findVisibleAsset(id, statuses)) === null) throw assetNotFound(id);
    const recent = await repository.countContributionsSince(user.id, new Date(Date.now() - HOUR_MS));
    if (recent >= CONTRIBUTIONS_PER_HOUR) {
      throw new HttpError(429, "CONTRIBUTION_LIMIT", `At most ${CONTRIBUTIONS_PER_HOUR} contributions per hour`);
    }
    const contribution = await repository.createContribution({ assetId: id, userId: user.id, kind, body });

    reply.code(201).header("cache-control", "no-store");
    return ContributionSchema.parse(toContribution(contribution, photoUrls));
  });

  app.get("/assets/:id/pulse", {
    schema: {
      tags: ["community"],
      summary: "Ziyaretçi Nabzı: veri setindeki ipuçları ve onaylanmış topluluk katkıları",
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      querystring: toOpenApiSchema(PulseQuerySchema, "input"),
      response: { 200: toOpenApiSchema(PulseResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<PulseResponse> => {
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const query = parseWith(PulseQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);

    if ((await repository.findVisibleAsset(id, statuses)) === null) throw assetNotFound(id);
    const records = await repository.findPulse(id, query.limit);

    // Short caching: a newly approved contribution shows up within a minute.
    reply.header("cache-control", "public, max-age=60");
    reply.header("content-language", lang);
    reply.header("vary", "Accept-Language");
    return PulseResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      assetId: id,
      items: toPulseItems(records, lang),
      communityTotal: records.communityTotal,
    });
  });
};

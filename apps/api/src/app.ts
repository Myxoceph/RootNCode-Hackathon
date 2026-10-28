import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "./db/prisma.ts";
import { assetsRoutes } from "./modules/assets/assets.routes.ts";
import type { ChatModel } from "./modules/assistant/assistant.model.ts";
import { createAssistantRepository } from "./modules/assistant/assistant.repository.ts";
import { assistantRoutes } from "./modules/assistant/assistant.routes.ts";
import { createAssetsRepository, type AssetVisibility } from "./modules/assets/assets.repository.ts";
import { createCommunityRepository } from "./modules/community/community.repository.ts";
import { communityRoutes } from "./modules/community/community.routes.ts";
import { moderationRoutes } from "./modules/community/moderation.routes.ts";
import { createGastronomyRepository } from "./modules/gastronomy/gastronomy.repository.ts";
import { gastronomyRoutes } from "./modules/gastronomy/gastronomy.routes.ts";
import { createMetaRepository } from "./modules/meta/meta.repository.ts";
import { metaRoutes } from "./modules/meta/meta.routes.ts";
import { createPlannerRepository } from "./modules/planner/planner.repository.ts";
import { createSoundsRepository } from "./modules/sounds/sounds.repository.ts";
import { soundsRoutes } from "./modules/sounds/sounds.routes.ts";
import { plannerRoutes } from "./modules/planner/planner.routes.ts";
import type { WeatherService } from "./modules/weather/weather.service.ts";
import { registerErrorHandlers } from "./plugins/error-handler.ts";
import { registerOpenApi } from "./plugins/openapi.ts";
import { DEFAULT_RATE_LIMIT, registerSecurity, type RateLimitOptions } from "./plugins/security.ts";
import { healthRoutes } from "./routes/health.ts";

export interface BuildAppOptions {
  prisma: PrismaClient;
  logger?: FastifyServerOptions["logger"];
  /** Browser origins allowed by CORS. Native mobile clients are not affected by CORS. */
  corsOrigins?: string[];
  /** Public base URL that media variant keys are appended to. */
  mediaBaseUrl?: string;
  /** `published` serves only published assets; `preview` also serves in_review (never drafts). */
  assetVisibility?: AssetVisibility;
  /** Fastify `trustProxy`: which proxies' X-Forwarded-For to trust for the client IP. */
  trustProxy?: FastifyServerOptions["trustProxy"];
  /** Per-IP request limit; `false` turns it off. */
  rateLimit?: RateLimitOptions | false;
  /** Current-weather provider; by default weather is unavailable (tests never reach the network). */
  weather?: WeatherService;
  /** Model behind the AI assistant (`POST /chat`); without one the assistant reports itself unavailable. */
  assistantModel?: ChatModel | null;
}

const NO_WEATHER: WeatherService = { current: async () => null, forecast: async () => null };

// Request bodies are short JSON (contributions are at most a few KB of text).
const BODY_LIMIT_BYTES = 16 * 1024;

/**
 * Builds the Fastify application without binding a port.
 * The server entry point and the tests share this function, so tests exercise
 * the real routing and error handling through `app.inject()`.
 */
export function buildApp({
  prisma,
  logger = false,
  corsOrigins = [],
  mediaBaseUrl = "https://media.invalid",
  assetVisibility = "published",
  trustProxy = false,
  rateLimit = DEFAULT_RATE_LIMIT,
  weather = NO_WEATHER,
  assistantModel = null,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger, trustProxy, bodyLimit: BODY_LIMIT_BYTES });

  registerErrorHandlers(app);
  // Both hook into route registration, so they come before every route (Swagger's own included).
  registerSecurity(app, rateLimit);
  registerOpenApi(app);
  app.register(cors, { origin: corsOrigins, methods: ["GET", "HEAD", "POST", "OPTIONS"] });
  app.register(healthRoutes, { prisma });
  const assetsRepository = createAssetsRepository(prisma, assetVisibility);
  const soundsRepository = createSoundsRepository(prisma, assetVisibility);
  app.register(assetsRoutes, { repository: assetsRepository, mediaBaseUrl, visibility: assetVisibility, sounds: soundsRepository });
  const gastronomyRepository = createGastronomyRepository(prisma, assetVisibility);
  app.register(plannerRoutes, {
    repository: createPlannerRepository(prisma, assetVisibility),
    assets: assetsRepository,
    weather,
    mediaBaseUrl,
    visibility: assetVisibility,
    gastronomy: gastronomyRepository,
  });
  app.register(metaRoutes, { repository: createMetaRepository(prisma, assetVisibility) });
  app.register(gastronomyRoutes, { repository: gastronomyRepository });
  app.register(soundsRoutes, { repository: soundsRepository, mediaBaseUrl });
  const communityRepository = createCommunityRepository(prisma);
  app.register(communityRoutes, { repository: communityRepository, visibility: assetVisibility });
  app.register(moderationRoutes, { repository: communityRepository });
  app.register(assistantRoutes, { model: assistantModel, repository: createAssistantRepository(prisma, assetVisibility) });

  return app;
}

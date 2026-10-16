import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "./db/prisma.ts";
import { assetsRoutes } from "./modules/assets/assets.routes.ts";
import { createAssetsRepository, type AssetVisibility } from "./modules/assets/assets.repository.ts";
import { registerErrorHandlers } from "./plugins/error-handler.ts";
import { registerOpenApi } from "./plugins/openapi.ts";
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
}

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
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  registerErrorHandlers(app);
  // Applied to the root instance before the routes so @fastify/swagger sees every route.
  registerOpenApi(app);
  app.register(cors, { origin: corsOrigins, methods: ["GET", "HEAD", "OPTIONS"] });
  app.register(healthRoutes, { prisma });
  app.register(assetsRoutes, {
    repository: createAssetsRepository(prisma, assetVisibility),
    mediaBaseUrl,
    visibility: assetVisibility,
  });

  return app;
}

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "./db/prisma.ts";
import { createMonumentsRepository } from "./modules/monuments/monuments.repository.ts";
import { monumentsRoutes } from "./modules/monuments/monuments.routes.ts";
import { registerErrorHandlers } from "./plugins/error-handler.ts";
import { registerOpenApi } from "./plugins/openapi.ts";
import { healthRoutes } from "./routes/health.ts";

export interface BuildAppOptions {
  prisma: PrismaClient;
  logger?: FastifyServerOptions["logger"];
  /** Browser origins allowed by CORS. Native mobile clients are not affected by CORS. */
  corsOrigins?: string[];
}

/**
 * Builds the Fastify application without binding a port.
 * The server entry point and the tests share this function, so tests exercise
 * the real routing and error handling through `app.inject()`.
 */
export function buildApp({ prisma, logger = false, corsOrigins = [] }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  registerErrorHandlers(app);
  // Applied to the root instance before the routes so @fastify/swagger sees every route.
  registerOpenApi(app);
  app.register(cors, { origin: corsOrigins, methods: ["GET", "HEAD", "OPTIONS"] });
  app.register(healthRoutes, { prisma });
  app.register(monumentsRoutes, { repository: createMonumentsRepository(prisma) });

  return app;
}

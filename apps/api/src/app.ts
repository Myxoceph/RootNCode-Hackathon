import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "./db/prisma.ts";
import { registerErrorHandlers } from "./plugins/error-handler.ts";
import { healthRoutes } from "./routes/health.ts";

export interface BuildAppOptions {
  prisma: PrismaClient;
  logger?: FastifyServerOptions["logger"];
}

/**
 * Builds the Fastify application without binding a port.
 * The server entry point and the tests share this function, so tests exercise
 * the real routing and error handling through `app.inject()`.
 */
export function buildApp({ prisma, logger = false }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  registerErrorHandlers(app);
  app.register(healthRoutes, { prisma });

  return app;
}

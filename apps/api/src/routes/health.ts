import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "../db/prisma.ts";

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "up" | "down";
  uptimeSeconds: number;
  timestamp: string;
}

/** Liveness + database readiness. Returns 503 when PostgreSQL is unreachable. */
export const healthRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (app, { prisma }) => {
  app.get("/health", async (request, reply) => {
    let dbUp = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      dbUp = false;
      request.log.warn({ err }, "Database health check failed");
    }

    const body: HealthResponse = {
      status: dbUp ? "ok" : "degraded",
      db: dbUp ? "up" : "down",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    return reply.code(dbUp ? 200 : 503).send(body);
  });
};

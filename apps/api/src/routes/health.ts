import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "../db/prisma.ts";
import { toOpenApiSchema } from "../plugins/openapi.ts";

export const HealthResponseSchema = z.strictObject({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["up", "down"]),
  uptimeSeconds: z.int().min(0),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Liveness + database readiness. Returns 503 when PostgreSQL is unreachable. */
export const healthRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (app, { prisma }) => {
  const healthSchema = toOpenApiSchema(HealthResponseSchema);

  app.get("/health", {
    // Polled by the container health check and uptime monitors.
    config: { rateLimit: false },
    schema: {
      tags: ["system"],
      summary: "Sunucu ve veritabanı durumu",
      response: { 200: healthSchema, 503: healthSchema },
    },
  }, async (request, reply) => {
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

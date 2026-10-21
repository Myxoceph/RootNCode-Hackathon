import { buildApp } from "./app.ts";
import { loadEnv } from "./config/env.ts";
import { createPrismaClient } from "./db/prisma.ts";
import { createWeatherService } from "./modules/weather/weather.service.ts";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const app = buildApp({
  prisma,
  logger: { level: env.LOG_LEVEL },
  corsOrigins: env.CORS_ORIGINS,
  mediaBaseUrl: env.MEDIA_BASE_URL,
  assetVisibility: env.ASSET_VISIBILITY,
  trustProxy: env.TRUST_PROXY,
  rateLimit: env.RATE_LIMIT_MAX === 0 ? false : { max: env.RATE_LIMIT_MAX, timeWindowMs: 60_000 },
  weather: env.OPEN_METEO_URL
    ? createWeatherService({
        baseUrl: env.OPEN_METEO_URL,
        onError: (err) => app.log.warn({ err }, "Weather provider failed; serving without weather"),
      })
    : undefined,
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error({ err }, "Failed to start server");
  await prisma.$disconnect();
  process.exit(1);
}

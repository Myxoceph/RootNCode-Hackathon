import { buildApp } from "./app.ts";
import { loadEnv } from "./config/env.ts";
import { createPrismaClient } from "./db/prisma.ts";
import { createChatModel } from "./modules/assistant/assistant.model.ts";
import { createOtpClient } from "./modules/transit/otp.client.ts";
import { createVoiceClient } from "./modules/voice/voice.client.ts";
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
  assistantModel:
    env.ASSISTANT_BASE_URL && env.ASSISTANT_MODEL
      ? createChatModel({ baseUrl: env.ASSISTANT_BASE_URL, model: env.ASSISTANT_MODEL, apiKey: env.ASSISTANT_API_KEY || undefined })
      : null,
  voice:
    env.ASSISTANT_BASE_URL && env.VOICE_ASR_MODEL && env.VOICE_TTS_MODEL
      ? createVoiceClient({
          baseUrl: env.ASSISTANT_BASE_URL,
          asrModel: env.VOICE_ASR_MODEL,
          ttsModel: env.VOICE_TTS_MODEL,
          apiKey: env.ASSISTANT_API_KEY || undefined,
        })
      : null,
  transitPlanner: env.OTP_URL
    ? createOtpClient({ baseUrl: env.OTP_URL, onError: (err) => app.log.warn({ err }, "OpenTripPlanner failed; no transit directions") })
    : null,
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

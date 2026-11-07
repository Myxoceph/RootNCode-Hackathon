import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalMediaStore, createR2MediaStore } from "./modules/admin/media-store.ts";
import { buildApp } from "./app.ts";
import { loadEnv, localMediaBaseUrl } from "./config/env.ts";
import { createPrismaClient } from "./db/prisma.ts";
import { createChatModel } from "./modules/assistant/assistant.model.ts";
import { createOtpClient } from "./modules/transit/otp.client.ts";
import { createVisionClient } from "./modules/vision/vision.client.ts";
import { createVoiceClient } from "./modules/voice/voice.client.ts";
import { createWeatherService } from "./modules/weather/weather.service.ts";

const env = loadEnv();
/**
 * Veri Döngüsü's development (INTAKE_LOCAL_ONLY): photos stay in the repo's data/build/media. A relative
 * LOCAL_MEDIA_DIR is read from the repo root, as the data pipeline reads it, not from where npm runs the API.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const localMediaDir = env.INTAKE_LOCAL_ONLY
  ? env.LOCAL_MEDIA_DIR
    ? isAbsolute(env.LOCAL_MEDIA_DIR)
      ? env.LOCAL_MEDIA_DIR
      : resolve(REPO_ROOT, env.LOCAL_MEDIA_DIR)
    : resolve(REPO_ROOT, "data/build/media")
  : null;
const mediaStore = localMediaDir
  ? createLocalMediaStore(localMediaDir)
  : env.MEDIA_S3_ENDPOINT && env.MEDIA_BUCKET && env.MEDIA_S3_ACCESS_KEY_ID && env.MEDIA_S3_SECRET_ACCESS_KEY
    ? createR2MediaStore({
        endpoint: env.MEDIA_S3_ENDPOINT,
        bucket: env.MEDIA_BUCKET,
        accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID,
        secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY,
      })
    : null;
const prisma = createPrismaClient(env.DATABASE_URL);
const app = buildApp({
  prisma,
  logger: { level: env.LOG_LEVEL },
  corsOrigins: env.CORS_ORIGINS,
  mediaBaseUrl: localMediaDir ? localMediaBaseUrl(env) : env.MEDIA_BASE_URL,
  assetVisibility: env.ASSET_VISIBILITY,
  trustProxy: env.TRUST_PROXY,
  demoUnlock: env.DEMO_UNLOCK,
  mediaStore,
  // Reads what the local store has, and sends the rest to the shared media host (read only).
  localMedia: localMediaDir ? { dir: localMediaDir, fallbackBaseUrl: env.MEDIA_BASE_URL } : null,
  // Uploaded PDFs and chat photos, where the worker (data/pipeline) reads them; not in git. Chat photos
  // are processed into the local store only: until Veri Döngüsü reaches dev (plan §9), never into R2.
  intake: env.INTAKE_ENABLED ? { root: REPO_ROOT, dir: "data/build/cache/intake", store: localMediaDir ? mediaStore : null } : null,
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
  vision:
    env.ASSISTANT_BASE_URL && env.VISION_MODEL
      ? createVisionClient({ baseUrl: env.ASSISTANT_BASE_URL, model: env.VISION_MODEL, apiKey: env.ASSISTANT_API_KEY || undefined })
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

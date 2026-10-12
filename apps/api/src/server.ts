import { buildApp } from "./app.ts";
import { loadEnv } from "./config/env.ts";
import { createPrismaClient } from "./db/prisma.ts";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const app = buildApp({ prisma, logger: { level: env.LOG_LEVEL } });

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

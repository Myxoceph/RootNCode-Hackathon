/**
 * Development seed: loads packages/contracts/mock/mock_monuments.json into PostgreSQL.
 *
 * The payload is validated with the shared contract before anything is written;
 * the write itself is idempotent and transactional (see src/db/seed.ts).
 * Temporary by design: replaced by the data/ dataset import once the schema is unified.
 *
 * Usage: npm run db:seed --workspace @vagabonds/api
 */
import { MonumentsPayloadSchema } from "@vagabonds/contracts";
import mock from "@vagabonds/contracts/mock/mock_monuments.json" with { type: "json" };
import { loadEnv } from "../src/config/env.ts";
import { createPrismaClient } from "../src/db/prisma.ts";
import { seedDatabase } from "../src/db/seed.ts";

const env = loadEnv();
if (env.NODE_ENV === "production") {
  throw new Error("Refusing to run the development seed against a production environment");
}

const payload = MonumentsPayloadSchema.parse(mock);
const prisma = createPrismaClient(env.DATABASE_URL);

try {
  const summary = await seedDatabase(prisma, payload);
  console.log(
    `✔ Seeded ${summary.monuments} monuments, ${summary.relations} relations, ` +
      `${summary.cityCuisines} city cuisines`,
  );
} finally {
  await prisma.$disconnect();
}

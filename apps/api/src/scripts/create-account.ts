/**
 * Creates a moderator and prints its bearer token once (only the hash is stored).
 *
 *   npm run moderator:create -w @vagabonds/api -- "Ahmet"
 *   docker compose -f deploy/compose.yml exec api npx --no-install tsx src/scripts/create-moderator.ts "Ahmet"
 *
 * Losing the token means creating a new moderator; there is no recovery.
 */
import { NicknameSchema } from "@vagabonds/contracts";
import { loadEnv } from "../config/env.ts";
import { createPrismaClient } from "../db/prisma.ts";
import { hashToken, newToken } from "../modules/community/auth.ts";
import { createCommunityRepository } from "../modules/community/community.repository.ts";

const nickname = NicknameSchema.safeParse(process.argv[2] ?? "");
if (!nickname.success) {
  console.error("Usage: create-moderator <nickname>  (2-32 letters, digits, space, '.', '_', '-')");
  process.exit(1);
}

const prisma = createPrismaClient(loadEnv().DATABASE_URL);
try {
  const token = newToken();
  const user = await createCommunityRepository(prisma).createUser({
    nickname: nickname.data,
    role: "moderator",
    tokenHash: hashToken(token),
  });
  console.log(`Moderator "${user.nickname}" created (id ${user.id}).`);
  console.log("Token (shown once; send it as `Authorization: Bearer <token>`):");
  console.log(token);
} finally {
  await prisma.$disconnect();
}

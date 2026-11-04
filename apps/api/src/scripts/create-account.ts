/**
 * Creates a moderator or admin account and prints its password once (only a scrypt hash is stored).
 * Sign in with it in the app, or at `POST /auth/login`.
 *
 *   npm run account:create -w @vagabonds/api -- ahmet admin
 *   npm run account:create -w @vagabonds/api -- huseyin moderator "Hüseyin"
 *   docker compose -f deploy/compose.yml exec api npx --no-install tsx src/scripts/create-account.ts ahmet admin
 *
 * A lost password means creating a new account; there is no recovery.
 */
import { randomBytes } from "node:crypto";
import { NicknameSchema, UsernameSchema } from "@vagabonds/contracts";
import { z } from "zod";
import { loadEnv } from "../config/env.ts";
import { createPrismaClient } from "../db/prisma.ts";
import { hashPassword, hashToken, newToken } from "../modules/community/auth.ts";
import { createCommunityRepository } from "../modules/community/community.repository.ts";

const args = z
  .tuple([UsernameSchema, z.enum(["moderator", "admin"]), NicknameSchema.optional()])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  console.error("Usage: create-account <username> <moderator|admin> [nickname]");
  console.error("  username: 3-32 lowercase letters, digits, '_' or '.'; nickname defaults to the username");
  process.exit(1);
}
const [username, role, nickname] = args.data;

const prisma = createPrismaClient(loadEnv().DATABASE_URL);
try {
  const password = randomBytes(15).toString("base64url");
  const user = await createCommunityRepository(prisma).createUser({
    nickname: nickname ?? username,
    role,
    // The account signs in with its password; this first session is never handed out.
    tokenHash: hashToken(newToken()),
    // Staff accounts are made here, not through sign-up, so they need no e-mail.
    credentials: { username, passwordHash: await hashPassword(password), email: null },
  });
  if (typeof user === "string") {
    console.error(`Username "${username}" is already taken.`);
    process.exitCode = 1;
  } else {
    console.log(`${role === "admin" ? "Admin" : "Moderator"} "${user.username}" created (id ${user.id}).`);
    console.log("Password (shown once; change by creating a new account):");
    console.log(password);
  }
} finally {
  await prisma.$disconnect();
}

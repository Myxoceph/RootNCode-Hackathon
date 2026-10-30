import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { HttpError } from "../../lib/http-error.ts";
import type { CommunityRepository, UserRecord } from "./community.repository.ts";

const TOKEN_PREFIX = "vgb_";

/** A new opaque bearer token: 32 random bytes. Only its hash is stored. */
export function newToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest; tokens are high-entropy, so a fast hash without salt is enough. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// scrypt with N=2^15 takes ~50 ms here: slow enough against guessing, fast enough for sign-in.
const SCRYPT = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** `scrypt$N$r$p$<salt>$<key>` (base64url); the parameters travel with the hash so they can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

// Compared against when the username does not exist, so a missing account takes as long as a wrong password.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

/** Constant-time check; `stored` null (unknown user or anonymous visitor) is always false. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return stored !== null && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function bearerToken(request: FastifyRequest): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? "");
  return match?.[1] ?? null;
}

/** What a role may do; an admin can do everything a moderator can. */
const ROLE_RANK = { visitor: 0, moderator: 1, admin: 2 } as const;
export type Role = keyof typeof ROLE_RANK;

/**
 * Resolves the caller from `Authorization: Bearer <token>`.
 * 401 when the token is missing or unknown, 403 when the user is banned or lacks the role.
 */
export async function requireUser(
  request: FastifyRequest,
  repository: CommunityRepository,
  role: Role = "visitor",
): Promise<UserRecord> {
  const token = bearerToken(request);
  if (token === null) throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token");
  const user = await repository.findUserByTokenHash(hashToken(token));
  if (user === null) throw new HttpError(401, "UNAUTHORIZED", "Unknown or revoked token");
  if (user.banned_at !== null) throw new HttpError(403, "USER_BANNED", "This user can no longer contribute");
  if ((ROLE_RANK[user.role as Role] ?? -1) < ROLE_RANK[role]) {
    throw new HttpError(403, "FORBIDDEN", `${role[0]!.toUpperCase()}${role.slice(1)} role required`);
  }
  return user;
}

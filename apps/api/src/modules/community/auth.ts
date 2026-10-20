import { createHash, randomBytes } from "node:crypto";
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

function bearerToken(request: FastifyRequest): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? "");
  return match?.[1] ?? null;
}

/**
 * Resolves the caller from `Authorization: Bearer <token>`.
 * 401 when the token is missing or unknown, 403 when the user is banned or lacks the role.
 */
export async function requireUser(
  request: FastifyRequest,
  repository: CommunityRepository,
  role: "visitor" | "moderator" = "visitor",
): Promise<UserRecord> {
  const token = bearerToken(request);
  if (token === null) throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token");
  const user = await repository.findUserByTokenHash(hashToken(token));
  if (user === null) throw new HttpError(401, "UNAUTHORIZED", "Unknown or revoked token");
  if (user.banned_at !== null) throw new HttpError(403, "USER_BANNED", "This user can no longer contribute");
  if (role === "moderator" && user.role !== "moderator") {
    throw new HttpError(403, "FORBIDDEN", "Moderator role required");
  }
  return user;
}

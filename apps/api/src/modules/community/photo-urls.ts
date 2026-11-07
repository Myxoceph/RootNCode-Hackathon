import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Paths of visitor photos, relative to the API's base URL.
 *
 * An approved photo is public at `/photos/<id>`. A pending or rejected one is shown only
 * to its author and to moderators, through a signed path that expires; image tags cannot
 * send a bearer token, so the signature stands in for it. A profile photo is only ever shown
 * to its owner, so it is always signed.
 */

const VALID_MS = 24 * 60 * 60 * 1000;
// Rounding the expiry to the hour gives the same path within an hour, so the image can be cached.
const ROUND_MS = 60 * 60 * 1000;

export interface PhotoUrls {
  publicPath(id: string): string;
  signedPath(id: string, now?: number): string;
  /** True when `exp` and `sig` are this server's, for this photo, and not expired. */
  verify(id: string, exp: string | undefined, sig: string | undefined, now?: number): boolean;
  /** `version` (part of the photo's hash) changes the path when the photo changes, so a cached old one is not shown. */
  avatarPath(userId: string, version: string, now?: number): string;
  verifyAvatar(userId: string, exp: string | undefined, sig: string | undefined, now?: number): boolean;
  /** A photo in a visitor's private journal: only ever shown to its owner, so always signed. */
  journalPath(photoId: string, size: "thumb" | "full", now?: number): string;
  verifyJournal(photoId: string, exp: string | undefined, sig: string | undefined, now?: number): boolean;
}

// Signed apart from photo ids, so a photo's signature never opens an avatar or the other way round.
const avatarKey = (userId: string) => `avatar:${userId}`;
const journalKey = (photoId: string) => `journal:${photoId}`;

/** Without a secret, a random one per process: signed paths then end when the API restarts. */
export function createPhotoUrls(secret: Buffer = randomBytes(32)): PhotoUrls {
  const signature = (id: string, exp: number) => createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");

  const expiry = (now: number) => Math.ceil((now + VALID_MS) / ROUND_MS) * ROUND_MS;
  const verify = (id: string, exp: string | undefined, sig: string | undefined, now = Date.now()) => {
    if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
    const expected = Buffer.from(signature(id, Number(exp)));
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  return {
    publicPath: (id) => `/photos/${id}`,

    signedPath(id, now = Date.now()) {
      const exp = expiry(now);
      return `/photos/${id}?exp=${exp}&sig=${signature(id, exp)}`;
    },

    verify,

    avatarPath(userId, version, now = Date.now()) {
      const exp = expiry(now);
      return `/avatars/${userId}?v=${version}&exp=${exp}&sig=${signature(avatarKey(userId), exp)}`;
    },

    verifyAvatar: (userId, exp, sig, now) => verify(avatarKey(userId), exp, sig, now),

    journalPath(photoId, size, now = Date.now()) {
      const exp = expiry(now);
      return `/journal-photos/${photoId}/${size}?exp=${exp}&sig=${signature(journalKey(photoId), exp)}`;
    },

    verifyJournal: (photoId, exp, sig, now) => verify(journalKey(photoId), exp, sig, now),
  };
}

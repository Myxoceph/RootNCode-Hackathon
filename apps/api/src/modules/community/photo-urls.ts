import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Paths of visitor photos, relative to the API's base URL.
 *
 * An approved photo is public at `/photos/<id>`. A pending or rejected one is shown only
 * to its author and to moderators, through a signed path that expires; image tags cannot
 * send a bearer token, so the signature stands in for it.
 */

const VALID_MS = 24 * 60 * 60 * 1000;
// Rounding the expiry to the hour gives the same path within an hour, so the image can be cached.
const ROUND_MS = 60 * 60 * 1000;

export interface PhotoUrls {
  publicPath(id: string): string;
  signedPath(id: string, now?: number): string;
  /** True when `exp` and `sig` are this server's, for this photo, and not expired. */
  verify(id: string, exp: string | undefined, sig: string | undefined, now?: number): boolean;
}

/** Without a secret, a random one per process: signed paths then end when the API restarts. */
export function createPhotoUrls(secret: Buffer = randomBytes(32)): PhotoUrls {
  const signature = (id: string, exp: number) => createHmac("sha256", secret).update(`${id}.${exp}`).digest("base64url");

  return {
    publicPath: (id) => `/photos/${id}`,

    signedPath(id, now = Date.now()) {
      const exp = Math.ceil((now + VALID_MS) / ROUND_MS) * ROUND_MS;
      return `/photos/${id}?exp=${exp}&sig=${signature(id, exp)}`;
    },

    verify(id, exp, sig, now = Date.now()) {
      if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
      const expected = Buffer.from(signature(id, Number(exp)));
      const given = Buffer.from(sig);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

/**
 * Where a capsule's sound comes from (Y17). The CC0 recordings (H9) go into the media
 * bucket as `sounds/<sound key>.mp3`, the address data/README.md §9 gives
 * `ambientSound`; once one is there it plays, with no app change. Until the API returns
 * that URL itself (A14), the app builds it from the key.
 */
const SOUNDS_URL = "https://media.allbytech.com/sounds";

export function recordingUrl(soundKey: string): string {
  return `${SOUNDS_URL}/${encodeURIComponent(soundKey)}.mp3`;
}

/** Recordings that failed to play in this app run: not tried again, so the stand-in starts at once. */
const missing = new Set<string>();

export function isMissing(soundKey: string): boolean {
  return missing.has(soundKey);
}

export function markMissing(soundKey: string) {
  missing.add(soundKey);
}

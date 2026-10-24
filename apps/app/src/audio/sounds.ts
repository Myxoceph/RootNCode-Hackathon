/**
 * Where a capsule's sound comes from (Y17). The CC0 recordings (H9) go into the media
 * bucket as `sounds/<sound key>.mp3`, the address data/README.md §9 gives
 * `ambientSound`; once one is there it plays, with no app change. Until the API returns
 * that URL itself (A14), the app builds it from the key.
 */
const SOUNDS_URL = "https://media.allbytech.com/sounds";
/** A missing recording must not hold up the stand-in for long. */
const CHECK_TIMEOUT_MS = 2500;

export function recordingUrl(soundKey: string): string {
  return `${SOUNDS_URL}/${encodeURIComponent(soundKey)}.mp3`;
}

const known = new Map<string, boolean>();

/** Whether the recording is in the bucket; asked once per key and app run. */
export async function hasRecording(soundKey: string): Promise<boolean> {
  const cached = known.get(soundKey);
  if (cached !== undefined) return cached;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(recordingUrl(soundKey), { method: "HEAD", signal: abort.signal });
    known.set(soundKey, response.ok);
    return response.ok;
  } catch {
    // Offline or slow: try again next time.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

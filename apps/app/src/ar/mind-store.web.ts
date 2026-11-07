/**
 * The web has no camera for Taşın Dili (ADR 0001) and no file system: a `.mind` file is only
 * downloaded, and the browser's own cache keeps it (the media host marks it immutable).
 */
export async function loadMind(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function hasMind(_url: string): boolean {
  return false;
}

/** Nothing to keep on the web. */
export async function prefetchMinds(_urls: readonly string[]): Promise<void> {}

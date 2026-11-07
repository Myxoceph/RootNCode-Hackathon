import { Directory, File, Paths } from "expo-file-system";

/**
 * The `.mind` files (MindAR targets) kept on the phone, so a target downloads once. Their address
 * holds the target photo's checksum (`<asset>/<media>-<sha>/target-mindar-<version>.mind`), so a
 * file never changes under the same address: one on disk is never stale.
 */
const folder = new Directory(Paths.document, "mind");

/** The file a `.mind` address is kept in: its path after the host, made one flat name. */
function fileFor(url: string): File {
  const path = url.replace(/^[a-z]+:\/\/[^/]+\//i, "").replace(/[^a-zA-Z0-9.-]+/g, "_");
  return new File(folder, path);
}

/** Downloads in flight, so a prefetch and the camera asking at once share one download. */
const pending = new Map<string, Promise<File>>();

async function download(url: string): Promise<File> {
  const file = fileFor(url);
  if (file.exists) return file;
  let running = pending.get(url);
  if (!running) {
    running = (async () => {
      folder.create({ idempotent: true, intermediates: true });
      // Into a temporary name first: a download cut short never passes for a whole file.
      const part = new File(folder, `${file.name}.part`);
      if (part.exists) part.delete();
      await File.downloadFileAsync(url, part);
      part.move(file);
      return file;
    })().finally(() => pending.delete(url));
    pending.set(url, running);
  }
  return running;
}

/**
 * How every `.mind` file starts, base64: MessagePack for `{ v: … }` (bytes 82 a1 76). A missing
 * target answers 404 with a web page, which must not be kept as one.
 */
const MIND_START = "gqF2";

/**
 * The `.mind` file at `url`, base64: from the phone when it was fetched before, else downloaded and
 * kept. Throws when there is none (not compiled yet), and keeps nothing then.
 */
export async function loadMind(url: string): Promise<string> {
  const file = await download(url);
  const mind = await file.base64();
  if (!mind.startsWith(MIND_START)) {
    try {
      file.delete();
    } catch {
      // Gone already.
    }
    throw new Error(`not a .mind file: ${url}`);
  }
  return mind;
}

/** Whether the file at `url` is on the phone already. */
export function hasMind(url: string): boolean {
  try {
    return fileFor(url).exists;
  } catch {
    return false;
  }
}

/** Fetches what is not on the phone yet, one after another so as not to crowd the network. Never throws. */
export async function prefetchMinds(urls: readonly string[]): Promise<void> {
  for (const url of urls) {
    if (hasMind(url)) continue;
    await download(url).catch(() => {});
  }
}

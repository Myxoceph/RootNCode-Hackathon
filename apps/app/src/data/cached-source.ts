import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  CONTRACT_VERSION,
  MetaEnumsResponseSchema,
  PulseResponseSchema,
} from "@vagabonds/contracts";

import { DataError, type SchemaParser } from "./errors";
import { markFresh, markStale } from "./offline";
import type { CityOption, DataSource } from "./source";

/** Answers of another contract version are never read; they are cleared on the first save. */
const PREFIX = "vagabonds-cache:";
export const VERSION_PREFIX = `${PREFIX}${CONTRACT_VERSION}:`;
const INDEX_KEY = `${VERSION_PREFIX}index`;
/**
 * Kept by size, not count: the fog map stores a small relations answer per found asset, and a
 * count limit pushed the asset pages out. The map's city list is the largest answer (~620 KB),
 * an asset page ~50 KB; Android's storage holds 6 MB by default.
 */
const MAX_CHARS = 4_000_000;
/** With a stored answer at hand, a slow network is not waited for longer than this. */
const SLOW_MS = 4000;

interface Entry {
  savedAt: number;
  data: unknown;
}

/** `listCities` returns the cities of `/meta/enums` cut down to these fields. */
const CitiesSchema: SchemaParser<CityOption[]> = MetaEnumsResponseSchema.shape.cities.element
  .pick({ code: true, label: true, assetCount: true, plate: true })
  .array();

/**
 * The API, with every answer kept on the device. When the network fails,
 * or is slow and a stored answer exists, the stored one is shown and the offline banner
 * says since when; the request goes on and refreshes the store if it gets through.
 * Without a stored answer the screen shows the error as before. Storage never breaks a
 * request: if it fails, the app behaves as if nothing was stored.
 */
export function createCachedSource(source: DataSource): DataSource {
  return {
    listAssets: (query, lang) =>
      cached(`assets:${lang}:${query.city ?? ""}:${query.limit}:${query.offset}`, AssetListResponseSchema, () =>
        source.listAssets(query, lang),
      ),
    getAsset: (id, lang) => cached(`asset:${lang}:${id}`, AssetDetailSchema, () => source.getAsset(id, lang)),
    getRelations: (id, lang) =>
      cached(`relations:${lang}:${id}`, AssetRelationsResponseSchema, () => source.getRelations(id, lang)),
    getPulse: (id, lang) => cached(`pulse:${lang}:${id}`, PulseResponseSchema, () => source.getPulse(id, lang)),
    listCities: (lang) => cached(`cities:${lang}`, CitiesSchema, () => source.listCities(lang)),
  };
}

type Outcome<T> = { ok: true; data: T } | { ok: false; error: unknown };

async function cached<T>(key: string, schema: SchemaParser<NonNullable<T>>, load: () => Promise<T>): Promise<T> {
  const fresh: Promise<Outcome<T>> = load().then(
    (data) => {
      void save(key, data);
      return { ok: true, data };
    },
    (error: unknown) => ({ ok: false, error }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), SLOW_MS)));
  const first = await Promise.race([fresh, slow]);
  clearTimeout(timer);
  if (first?.ok) {
    markFresh(key);
    return first.data;
  }
  // Only a failed fetch falls back (network, server, a Wi-Fi login page; see api-source.ts):
  // data that breaks the contract is a bug to show.
  if (first && !(first.error instanceof DataError && first.error.kind === "unavailable")) throw first.error;

  // Read only now: on a healthy network the stored copy is never touched.
  const entry = await read(key, schema);
  if (entry) {
    markStale(key, entry.savedAt);
    return entry.data as T;
  }
  if (first) throw first.error;

  // Slow, and nothing stored: keep waiting.
  const outcome = await fresh;
  if (!outcome.ok) throw outcome.error;
  markFresh(key);
  return outcome.data;
}

async function read<T>(key: string, schema: SchemaParser<T>): Promise<{ savedAt: number; data: T | null } | null> {
  try {
    const raw = await AsyncStorage.getItem(VERSION_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    // `null`: the API said "no such asset"; that answer is worth keeping too.
    if (entry.data === null) return { savedAt: entry.savedAt, data: null };
    const parsed = schema.safeParse(entry.data);
    return parsed.success ? { savedAt: entry.savedAt, data: parsed.data } : null;
  } catch {
    return null;
  }
}

/** Stored keys with their size, most recently saved last. */
type Index = Array<[key: string, chars: number]>;

/** Loaded once; writes are queued so they do not overwrite each other. */
let index: Promise<Index> | null = null;
let writes = Promise.resolve();

function loadIndex(): Promise<Index> {
  index ??= (async () => {
    try {
      // First save of this run: drop answers of older contract versions.
      const keys = await AsyncStorage.getAllKeys();
      const old = keys.filter((k) => k.startsWith(PREFIX) && !k.startsWith(VERSION_PREFIX));
      if (old.length > 0) await AsyncStorage.multiRemove(old);
      const raw = await AsyncStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      // An index written before sizes were kept lists bare keys.
      return (JSON.parse(raw) as Array<string | [string, number]>).map((e): [string, number] => (typeof e === "string" ? [e, 0] : e));
    } catch {
      return [];
    }
  })();
  return index;
}

function save(key: string, data: unknown): Promise<void> {
  writes = writes.then(async () => {
    try {
      const value = JSON.stringify({ savedAt: Date.now(), data } satisfies Entry);
      const entries = (await loadIndex()).filter(([k]) => k !== key);
      entries.push([key, value.length]);
      let total = entries.reduce((sum, [, chars]) => sum + chars, 0);
      const dropped: string[] = [];
      while (total > MAX_CHARS && entries.length > 1) {
        const [oldest, chars] = entries.shift()!;
        dropped.push(oldest);
        total -= chars;
      }
      index = Promise.resolve(entries);
      if (dropped.length > 0) await AsyncStorage.multiRemove(dropped.map((k) => VERSION_PREFIX + k));
      await AsyncStorage.setItem(VERSION_PREFIX + key, value);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(entries));
    } catch {
      // Full or unavailable storage: the app works on, only without this answer offline.
    }
  });
  return writes;
}

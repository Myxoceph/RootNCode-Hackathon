import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  CONTRACT_VERSION,
  type AssetDetail,
  type AssetListResponse,
  type AssetRelationsResponse,
} from "@vagabonds/contracts";

import { DataError, type SchemaParser } from "./errors";
import { pulseItemsFromTips } from "./pulse";
import type { DataSource } from "./source";

/** The fixtures are all in Bursa; the plate code finds its province on the map. */
const FIXTURE_PLATES: Record<string, number> = { bursa: 16 };

/** Raw fixture files, captured from a local API with `npm run fixtures --workspace @vagabonds/app`. */
export interface MockFixtures {
  list: unknown;
  /** Asset id → `GET /assets/:id` body. */
  details: Record<string, unknown>;
  /** Asset id → `GET /assets/:id/relations` body. */
  relations: Record<string, unknown>;
}

/** Loaded on demand, so the fixtures stay out of builds that use the API. */
async function loadBundledFixtures(): Promise<MockFixtures> {
  const [list, details, relations] = await Promise.all([
    import("./fixtures/assets.json"),
    import("./fixtures/details.json"),
    import("./fixtures/relations.json"),
  ]);
  return { list: list.default, details: details.default, relations: relations.default };
}

function parse<T>(raw: unknown, schema: SchemaParser<T>, what: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw DataError.fromSchema(what, result.error);
  return result.data;
}

/**
 * Serves a small Turkish snapshot of the API, for working without the API running.
 * Fixtures are validated on first use, not at import, so a stale fixture shows
 * the error screen instead of crashing the app on launch.
 */
export function createMockSource(load: () => Promise<MockFixtures> = loadBundledFixtures): DataSource {
  let fixtures: Promise<MockFixtures> | undefined;
  const getFixtures = () => (fixtures ??= load());

  let parsedList: AssetListResponse | undefined;
  const parsedDetails = new Map<string, AssetDetail>();
  const parsedRelations = new Map<string, AssetRelationsResponse>();

  async function getAsset(id: string): Promise<AssetDetail | null> {
    const raw = (await getFixtures()).details[id];
    if (raw === undefined) return null;
    if (!parsedDetails.has(id)) parsedDetails.set(id, parse(raw, AssetDetailSchema, "Örnek eser verisi"));
    return parsedDetails.get(id)!;
  }

  return {
    async listAssets({ city, bbox, limit, offset }) {
      parsedList ??= parse((await getFixtures()).list, AssetListResponseSchema, "Örnek eser listesi");
      const inBox = (a: AssetListResponse["items"][number]) =>
        !bbox || (a.coordinates !== null && a.coordinates.lng >= bbox[0] && a.coordinates.lat >= bbox[1] && a.coordinates.lng <= bbox[2] && a.coordinates.lat <= bbox[3]);
      const matching = parsedList.items.filter((a) => (!city || a.city.code === city) && inBox(a));
      return { ...parsedList, total: matching.length, limit, offset, items: matching.slice(offset, offset + limit) };
    },
    getAsset: (id) => getAsset(id),
    async getRelations(id) {
      const raw = (await getFixtures()).relations[id];
      if (raw === undefined) return null;
      if (!parsedRelations.has(id)) {
        parsedRelations.set(id, parse(raw, AssetRelationsResponseSchema, "Örnek bağ verisi"));
      }
      return parsedRelations.get(id)!;
    },
    async getPulse(id, lang) {
      // The fixtures carry the dataset tips only; visitor notes need the API.
      const asset = await getAsset(id);
      if (!asset) return null;
      return { version: CONTRACT_VERSION, lang, assetId: id, items: pulseItemsFromTips(asset.visitorTips), communityTotal: 0 };
    },
    async listArTargets() {
      // The targets of the sample assets, as the API would list them.
      const fixtures = await getFixtures();
      const details = (await Promise.all(Object.keys(fixtures.details).map(getAsset))).filter((a): a is AssetDetail => a !== null);
      const items = details.flatMap((asset) =>
        asset.inscriptions.flatMap((inscription) =>
          inscription.arTarget
            ? [{
                assetId: asset.id,
                inscriptionId: inscription.id,
                city: asset.city.code,
                coordinates: asset.coordinates ? { lat: asset.coordinates.lat, lng: asset.coordinates.lng } : null,
                ...inscription.arTarget,
              }]
            : [],
        ),
      );
      return { version: CONTRACT_VERSION, items };
    },
    // The fixtures have no weather.
    getWeather: async () => null,
    getWeatherAt: async () => null,
    async listCities() {
      // The fixtures have no /meta/enums snapshot; the list's own cities are enough offline.
      parsedList ??= parse((await getFixtures()).list, AssetListResponseSchema, "Örnek eser listesi");
      const counts = new Map<string, { label: string; count: number }>();
      for (const { city } of parsedList.items) {
        counts.set(city.code, { label: city.label, count: (counts.get(city.code)?.count ?? 0) + 1 });
      }
      return [...counts].map(([code, { label, count }]) => ({ code, label, assetCount: count, plate: FIXTURE_PLATES[code] ?? null }));
    },
  };
}

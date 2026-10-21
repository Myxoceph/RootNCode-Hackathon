import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  type AssetDetail,
  type AssetListResponse,
  type AssetRelationsResponse,
} from "@vagabonds/contracts";

import { DataError, type SchemaParser } from "./errors";
import type { DataSource } from "./source";

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

  return {
    async listAssets({ city, limit, offset }) {
      parsedList ??= parse((await getFixtures()).list, AssetListResponseSchema, "Örnek eser listesi");
      const matching = city ? parsedList.items.filter((a) => a.city.code === city) : parsedList.items;
      return { ...parsedList, total: matching.length, limit, offset, items: matching.slice(offset, offset + limit) };
    },
    async getAsset(id) {
      const raw = (await getFixtures()).details[id];
      if (raw === undefined) return null;
      if (!parsedDetails.has(id)) parsedDetails.set(id, parse(raw, AssetDetailSchema, "Örnek eser verisi"));
      return parsedDetails.get(id)!;
    },
    async getRelations(id) {
      const raw = (await getFixtures()).relations[id];
      if (raw === undefined) return null;
      if (!parsedRelations.has(id)) {
        parsedRelations.set(id, parse(raw, AssetRelationsResponseSchema, "Örnek bağ verisi"));
      }
      return parsedRelations.get(id)!;
    },
  };
}

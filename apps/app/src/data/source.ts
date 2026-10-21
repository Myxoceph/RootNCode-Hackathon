import type {
  AssetDetail,
  AssetListResponse,
  AssetRelationsResponse,
  Lang,
} from "@vagabonds/contracts";

/** A city that has published assets, for the list filter. */
export interface CityOption {
  code: string;
  label: string;
  assetCount: number;
}

export interface AssetListQuery {
  /** City code from `/meta/enums`, e.g. `bursa`. */
  city?: string;
  limit: number;
  offset: number;
}

/**
 * Where the app reads its data from. Screens never talk to a source directly;
 * they use the hooks in `./hooks`, which go through the source picked in `./active-source`.
 *
 * Every implementation validates what it returns against `@vagabonds/contracts`
 * and throws a `DataError` when it cannot.
 */
export interface DataSource {
  listAssets(query: AssetListQuery, lang: Lang): Promise<AssetListResponse>;
  /** Resolves to `null` when no published asset has this id. */
  getAsset(id: string, lang: Lang): Promise<AssetDetail | null>;
  /** Resolves to `null` when no published asset has this id. */
  getRelations(id: string, lang: Lang): Promise<AssetRelationsResponse | null>;
  /** Cities with at least one published asset, in the API's order. */
  listCities(lang: Lang): Promise<CityOption[]>;
}

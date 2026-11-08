import type {
  ArTargetsResponse,
  AssetDetail,
  AssetListResponse,
  AssetRelationsResponse,
  CityDishesResponse,
  Lang,
  PulseResponse,
  WeatherResponse,
} from "@vagabonds/contracts";

/** A city that has published assets, for the list filter. */
export interface CityOption {
  code: string;
  label: string;
  assetCount: number;
  /** The province's licence plate code (16 = Bursa); it finds the province on the map. */
  plate: number | null;
}

export interface AssetListQuery {
  /** City code from `/meta/enums`, e.g. `bursa`. */
  city?: string;
  /** Only assets with coordinates in this box: [minLng, minLat, maxLng, maxLat]. */
  bbox?: [number, number, number, number];
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
  /** Ziyaretçi Nabzı: dataset tips and approved visitor notes. `null` when no published asset has this id. */
  getPulse(id: string, lang: Lang): Promise<PulseResponse | null>;
  /** Cities with at least one published asset, in the API's order. */
  listCities(lang: Lang): Promise<CityOption[]>;
  /** Today's weather in a city (`cities` code); `null` when it cannot be had. Never stored: old weather misleads. */
  getWeather(city: string, lang: Lang): Promise<WeatherResponse | null>;
  /** Today's weather at a point (the visitor's location); `null` when it cannot be had. Never stored either. */
  getWeatherAt(point: { lat: number; lng: number }, lang: Lang): Promise<WeatherResponse | null>;
  /** A city's dishes (module 5, `GET /cities/:code/dishes`); `null` when there is no such city. */
  getCityDishes(city: string, lang: Lang): Promise<CityDishesResponse | null>;
  /** Taşın Dili: every inscription the camera can find, with where it is (`GET /ar-targets`). */
  listArTargets(): Promise<ArTargetsResponse>;
}

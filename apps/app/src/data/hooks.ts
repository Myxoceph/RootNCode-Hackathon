import type {
  AssetDetail,
  AssetRelation,
  AssetRelationsResponse,
  AssetSummary,
  CityDishesResponse,
  Contribution,
  Lang,
  MyAchievementsResponse,
  PulseResponse,
  Reward,
  WalletResponse,
  WeatherResponse,
} from "@vagabonds/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { getLang, getMessages, useLang, useLangSettled } from "@/i18n";

import { dataSource } from "./active-source";
import { fetchMyAchievements, fetchMyContributions, fetchRewards, fetchWallet, useCommunity } from "./community";
import { DataError } from "./errors";
import { useRefreshEpoch } from "./offline";
import type { CityOption } from "./source";

const PAGE_SIZE = 30;

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: DataError }
  | { status: "success"; data: T };

export type ResourceWithRetry<T> = Resource<T> & { retry: () => void };

function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  return new DataError("unavailable", getMessages().errors.noData, [String(error)]);
}

export function useResource<T>(load: () => Promise<T>): ResourceWithRetry<T> {
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // "Yenile" on the offline banner refetches every resource on screen.
  const epoch = useRefreshEpoch();
  const lastEpoch = useRef(epoch);
  // Nothing is asked before the visitor's language is known: a web page is first drawn in Turkish and
  // turns to the visitor's language a moment later, and each request would otherwise go once in each.
  const langSettled = useLangSettled();

  useEffect(() => {
    if (!langSettled) return;
    let active = true;
    // A refresh keeps what is on screen until the new answer is in: no spinner, and a
    // failed refresh leaves the data shown rather than replacing it with an error.
    const refreshing = epoch !== lastEpoch.current;
    lastEpoch.current = epoch;
    if (!refreshing) setState({ status: "loading" });
    load().then(
      (data) => active && setState({ status: "success", data }),
      (error: unknown) =>
        active && setState((current) => (refreshing && current.status === "success" ? current : { status: "error", error: toDataError(error) })),
    );
    return () => {
      active = false;
    };
  }, [load, attempt, epoch, langSettled]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** `data` is `null` when no published asset has this id. */
export function useAsset(id: string): ResourceWithRetry<AssetDetail | null> {
  const lang = useLang();
  const load = useCallback(() => dataSource.getAsset(id, lang), [id, lang]);
  return useResource(load);
}

/** `data` is `null` when no published asset has this id. */
export function useAssetRelations(id: string): ResourceWithRetry<AssetRelationsResponse | null> {
  const lang = useLang();
  const load = useCallback(() => dataSource.getRelations(id, lang), [id, lang]);
  return useResource(load);
}

/** Ziyaretçi Nabzı of an asset; `data` is `null` when no published asset has this id. */
export function usePulse(id: string): ResourceWithRetry<PulseResponse | null> {
  const lang = useLang();
  const load = useCallback(() => dataSource.getPulse(id, lang), [id, lang]);
  return useResource(load);
}

/** The visitor's own notes ("Notlarım"); fetched again after each note sent. `null` without a session. */
/** Today's weather in a city; `null` while there is no city, or when the weather cannot be had. */
export function useWeather(city: string | null): ResourceWithRetry<WeatherResponse | null> {
  const lang = useLang();
  const load = useCallback(() => (city ? dataSource.getWeather(city, lang) : Promise.resolve(null)), [city, lang]);
  return useResource(load);
}

/** A city's dishes; `data` is `null` without a city, or for one the API does not know. */
export function useCityDishes(city: string | null): ResourceWithRetry<CityDishesResponse | null> {
  const lang = useLang();
  const load = useCallback(() => (city ? dataSource.getCityDishes(city, lang) : Promise.resolve(null)), [city, lang]);
  return useResource(load);
}

/** Today's weather at a point (the visitor's location); `null` without one. */
export function useWeatherAt(point: { lat: number; lng: number } | null): ResourceWithRetry<WeatherResponse | null> {
  const lang = useLang();
  const lat = point?.lat;
  const lng = point?.lng;
  const load = useCallback(
    () => (lat !== undefined && lng !== undefined ? dataSource.getWeatherAt({ lat, lng }, lang) : Promise.resolve(null)),
    [lat, lng, lang],
  );
  return useResource(load);
}

/** The visitor's badges (Rozetlerim): fetched again for a new session. `null` without a server. */
export function useMyAchievements(): ResourceWithRetry<MyAchievementsResponse | null> {
  const { user } = useCommunity();
  // The language in the key: the badges' words come from the API in it.
  const lang = useLang();
  const key = user === undefined ? null : `${user?.id ?? ""}:${lang}`;
  const load = useCallback(() => (key === null ? new Promise<never>(() => {}) : fetchMyAchievements()), [key]);
  return useResource(load);
}

/** The rewards on offer (Ödüllerim); `null` without a server. */
export function useRewards(): ResourceWithRetry<Reward[] | null> {
  const lang = useLang();
  const load = useCallback(() => fetchRewards(lang), [lang]);
  return useResource(load);
}

/** The visitor's wallet, fetched again for a new session or after `version` changes (a reward taken). */
export function useWallet(version = 0): ResourceWithRetry<WalletResponse | null> {
  const { user } = useCommunity();
  const lang = useLang();
  const key = user === undefined ? null : `${user?.id ?? ""}:${version}:${lang}`;
  const load = useCallback(() => (key === null ? new Promise<never>(() => {}) : fetchWallet()), [key]);
  return useResource(load);
}

export function useMyContributions(): ResourceWithRetry<Contribution[] | null> {
  const { user, sent } = useCommunity();
  // A new session or a new note means a new list. Until the stored session has been read
  // (`undefined`), nothing is fetched: that read decides whether there is a list at all.
  const lang = useLang();
  const key = user === undefined ? null : `${user?.id ?? ""}:${sent}:${lang}`;
  const load = useCallback(
    () => (key === null ? new Promise<never>(() => {}) : fetchMyContributions()),
    [key],
  );
  return useResource(load);
}

export interface RelationsOf {
  /** Links of each asset whose relations have arrived; an unpublished asset has none. */
  byId: Record<string, AssetRelation[]>;
  /** Assets whose relations are still on the way. */
  loading: string[];
  failed: string[];
  retry: () => void;
}

/**
 * The relations of a growing set of assets (the fog map's found assets). Each
 * asset is fetched once; one that fails is fetched again on `retry`.
 */
export function useRelationsOf(ids: string[]): RelationsOf {
  const [byId, setById] = useState<Record<string, AssetRelation[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const epoch = useRefreshEpoch();
  const requested = useRef(new Set<string>());
  const lang = useLang();
  // Another language: every link's words again.
  const askedIn = useRef(lang);
  if (askedIn.current !== lang) {
    askedIn.current = lang;
    requested.current.clear();
  }

  useEffect(() => {
    for (const id of ids) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      dataSource.getRelations(id, lang).then(
        (response) => {
          // An answer in the language left behind is dropped: the new language's own is on the way.
          if (askedIn.current !== lang) return;
          setById((map) => ({ ...map, [id]: response?.items ?? [] }));
        },
        () => {
          if (askedIn.current !== lang) return;
          requested.current.delete(id);
          setFailed((list) => (list.includes(id) ? list : [...list, id]));
        },
      );
    }
  }, [ids, attempt, lang]);

  const retry = useCallback(() => {
    setFailed([]);
    setAttempt((n) => n + 1);
  }, []);
  // "Yenile" on the offline banner: fetch every one again, as some came from storage.
  // What is shown stays until the new answers arrive.
  useEffect(() => {
    if (epoch === 0) return;
    requested.current.clear();
    retry();
  }, [epoch, retry]);
  const loading = ids.filter((id) => !(id in byId) && !failed.includes(id));
  return { byId, loading, failed, retry };
}

async function loadMapAssets(city: string | undefined, lang: Lang): Promise<{ located: AssetSummary[]; total: number }> {
  const page = await dataSource.listAssets({ city, limit: 500, offset: 0 }, lang);
  return { located: page.items.filter((asset) => asset.coordinates !== null), total: page.total };
}

/** Every published asset that has coordinates, in one request (the API allows 500), for the map. */
export function useMapAssets(city?: string): ResourceWithRetry<{ located: AssetSummary[]; total: number }> {
  const lang = useLang();
  const load = useCallback(() => loadMapAssets(city, lang), [city, lang]);
  return useResource(load);
}

/**
 * The same for one chosen city; `null` (and no request) while none is chosen. The answer
 * names its city: right after a new choice the previous answer is still in for a render.
 */
export function useCityMapAssets(
  city: string | null,
): ResourceWithRetry<{ city: string; located: AssetSummary[]; total: number } | null> {
  const lang = useLang();
  const load = useCallback(async () => (city ? { city, ...(await loadMapAssets(city, lang)) } : null), [city, lang]);
  return useResource(load);
}

/** Every published asset, located or not, 500 a request (the API's most). */
export async function loadAllAssets(lang: Lang = getLang()): Promise<AssetSummary[]> {
  const items: AssetSummary[] = [];
  for (;;) {
    const page = await dataSource.listAssets({ limit: 500, offset: items.length }, lang);
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total) return items;
  }
}

/** Every published asset, for the search on the map; `null` (and no request) until it is `wanted`. */
export function useSearchableAssets(wanted: boolean): ResourceWithRetry<AssetSummary[] | null> {
  const lang = useLang();
  const load = useCallback(async () => (wanted ? loadAllAssets(lang) : null), [wanted, lang]);
  return useResource(load);
}

export function useCities(): ResourceWithRetry<CityOption[]> {
  const lang = useLang();
  const load = useCallback(() => dataSource.listCities(lang), [lang]);
  return useResource(load);
}

export interface AssetListPage {
  items: AssetSummary[];
  total: number;
  /** True while the next page is being fetched. */
  loadingMore: boolean;
  /** Set when fetching a further page failed; the items already shown stay. */
  moreError: DataError | null;
  /** Fetches the next page; does nothing while one is loading or when everything is in. */
  loadMore: () => void;
}

/** The asset list, one page at a time. */
export function useAssetList(city?: string): ResourceWithRetry<AssetListPage> {
  const [items, setItems] = useState<AssetSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<DataError | null>(null);
  const busy = useRef(false);
  // Paging state lives in refs, not in render state: FlatList can call onEndReached again
  // before the appended page re-renders, and a stale `items.length` would fetch the same
  // page twice (duplicate keys in the list).
  const loaded = useRef(0);
  const knownTotal = useRef(0);
  // A page that arrives after the city changed, or after the list was loaded again
  // ("Yenile"), belongs to the old list and is dropped.
  const lang = useLang();
  const currentCity = useRef(city);
  currentCity.current = city;
  const currentLang = useRef(lang);
  currentLang.current = lang;
  const generation = useRef(0);

  // The first page goes through useResource for the loading and error screens.
  const loadFirst = useCallback(async () => {
    const page = await dataSource.listAssets({ city, limit: PAGE_SIZE, offset: 0 }, lang);
    generation.current++;
    loaded.current = page.items.length;
    knownTotal.current = page.total;
    setItems(page.items);
    setTotal(page.total);
    setMoreError(null);
    return page;
  }, [city, lang]);
  const first = useResource(loadFirst);

  const loadMore = useCallback(() => {
    if (busy.current || first.status !== "success" || loaded.current >= knownTotal.current) return;
    busy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const started = generation.current;
    const current = () => currentCity.current === city && currentLang.current === lang && generation.current === started;
    dataSource
      .listAssets({ city, limit: PAGE_SIZE, offset: loaded.current }, lang)
      .then(
        (page) => {
          if (!current()) return;
          loaded.current += page.items.length;
          knownTotal.current = page.total;
          setItems((current) => {
            const seen = new Set(current.map((a) => a.id));
            return [...current, ...page.items.filter((a) => !seen.has(a.id))];
          });
          setTotal(page.total);
        },
        (error: unknown) => current() && setMoreError(toDataError(error)),
      )
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  }, [city, lang, first.status]);

  if (first.status !== "success") return first;
  return { status: "success", data: { items, total, loadingMore, moreError, loadMore }, retry: first.retry };
}

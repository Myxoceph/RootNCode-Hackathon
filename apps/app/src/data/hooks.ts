import type {
  AssetDetail,
  AssetRelation,
  AssetRelationsResponse,
  AssetSummary,
  Contribution,
  Lang,
  PulseResponse,
} from "@vagabonds/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { dataSource } from "./active-source";
import { fetchMyContributions, useCommunity } from "./community";
import { DataError } from "./errors";
import { useRefreshEpoch } from "./offline";
import type { CityOption } from "./source";

/** Content language. Fixed to Turkish until the language setting lands (Ayarlar). */
const LANG: Lang = "tr";
const PAGE_SIZE = 30;

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: DataError }
  | { status: "success"; data: T };

export type ResourceWithRetry<T> = Resource<T> & { retry: () => void };

function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  return new DataError("unavailable", "Veriye şu an ulaşılamıyor.", [String(error)]);
}

function useResource<T>(load: () => Promise<T>): ResourceWithRetry<T> {
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // "Yenile" on the offline banner refetches every resource on screen.
  const epoch = useRefreshEpoch();
  const lastEpoch = useRef(epoch);

  useEffect(() => {
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
  }, [load, attempt, epoch]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** `data` is `null` when no published asset has this id. */
export function useAsset(id: string): ResourceWithRetry<AssetDetail | null> {
  const load = useCallback(() => dataSource.getAsset(id, LANG), [id]);
  return useResource(load);
}

/** `data` is `null` when no published asset has this id. */
export function useAssetRelations(id: string): ResourceWithRetry<AssetRelationsResponse | null> {
  const load = useCallback(() => dataSource.getRelations(id, LANG), [id]);
  return useResource(load);
}

/** Ziyaretçi Nabzı of an asset; `data` is `null` when no published asset has this id. */
export function usePulse(id: string): ResourceWithRetry<PulseResponse | null> {
  const load = useCallback(() => dataSource.getPulse(id, LANG), [id]);
  return useResource(load);
}

/** The visitor's own notes ("Notlarım"); fetched again after each note sent. `null` without a session. */
export function useMyContributions(): ResourceWithRetry<Contribution[] | null> {
  const { user, sent } = useCommunity();
  const userId = user?.id;
  // Not read inside, but a new session or a new note means a new list.
  const load = useCallback(() => fetchMyContributions(), [userId, sent]);
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

  useEffect(() => {
    for (const id of ids) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      dataSource.getRelations(id, LANG).then(
        (response) => setById((map) => ({ ...map, [id]: response?.items ?? [] })),
        () => {
          requested.current.delete(id);
          setFailed((list) => (list.includes(id) ? list : [...list, id]));
        },
      );
    }
  }, [ids, attempt]);

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

/** Every published asset that has coordinates, in one request (the API allows 500), for the map. */
export function useMapAssets(city?: string): ResourceWithRetry<{ located: AssetSummary[]; total: number }> {
  const load = useCallback(async () => {
    const page = await dataSource.listAssets({ city, limit: 500, offset: 0 }, LANG);
    return { located: page.items.filter((asset) => asset.coordinates !== null), total: page.total };
  }, [city]);
  return useResource(load);
}

export function useCities(): ResourceWithRetry<CityOption[]> {
  const load = useCallback(() => dataSource.listCities(LANG), []);
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
  const currentCity = useRef(city);
  currentCity.current = city;
  const generation = useRef(0);

  // The first page goes through useResource for the loading and error screens.
  const loadFirst = useCallback(async () => {
    const page = await dataSource.listAssets({ city, limit: PAGE_SIZE, offset: 0 }, LANG);
    generation.current++;
    loaded.current = page.items.length;
    knownTotal.current = page.total;
    setItems(page.items);
    setTotal(page.total);
    setMoreError(null);
    return page;
  }, [city]);
  const first = useResource(loadFirst);

  const loadMore = useCallback(() => {
    if (busy.current || first.status !== "success" || loaded.current >= knownTotal.current) return;
    busy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const started = generation.current;
    const current = () => currentCity.current === city && generation.current === started;
    dataSource
      .listAssets({ city, limit: PAGE_SIZE, offset: loaded.current }, LANG)
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
  }, [city, first.status]);

  if (first.status !== "success") return first;
  return { status: "success", data: { items, total, loadingMore, moreError, loadMore }, retry: first.retry };
}

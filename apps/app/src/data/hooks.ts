import type { AssetDetail, AssetRelationsResponse, AssetSummary, Lang } from "@vagabonds/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { dataSource } from "./active-source";
import { DataError } from "./errors";
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

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    load().then(
      (data) => active && setState({ status: "success", data }),
      (error: unknown) => active && setState({ status: "error", error: toDataError(error) }),
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);

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
  // A page that arrives after the city changed belongs to the old list and is dropped.
  const currentCity = useRef(city);
  currentCity.current = city;

  // The first page goes through useResource for the loading and error screens.
  const loadFirst = useCallback(async () => {
    const page = await dataSource.listAssets({ city, limit: PAGE_SIZE, offset: 0 }, LANG);
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
    dataSource
      .listAssets({ city, limit: PAGE_SIZE, offset: loaded.current }, LANG)
      .then(
        (page) => {
          if (currentCity.current !== city) return;
          loaded.current += page.items.length;
          knownTotal.current = page.total;
          setItems((current) => {
            const seen = new Set(current.map((a) => a.id));
            return [...current, ...page.items.filter((a) => !seen.has(a.id))];
          });
          setTotal(page.total);
        },
        (error: unknown) => currentCity.current === city && setMoreError(toDataError(error)),
      )
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  }, [city, first.status]);

  if (first.status !== "success") return first;
  return { status: "success", data: { items, total, loadingMore, moreError, loadMore }, retry: first.retry };
}

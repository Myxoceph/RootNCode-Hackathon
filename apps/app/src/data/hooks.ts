import type { Monument } from "@vagabonds/contracts";
import { useCallback, useEffect, useState } from "react";

import { DataError } from "./errors";
import { dataSource } from "./active-source";

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

export function useMonuments(): ResourceWithRetry<Monument[]> {
  const load = useCallback(() => dataSource.listMonuments(), []);
  return useResource(load);
}

/** `data` is `null` when no monument has this slug. */
export function useMonument(slug: string): ResourceWithRetry<Monument | null> {
  const load = useCallback(() => dataSource.getMonument(slug), [slug]);
  return useResource(load);
}

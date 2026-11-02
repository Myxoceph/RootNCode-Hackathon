import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

import type { Duration, Region } from "@/content/routes";

/** Profil · Rotalarım: the routes the visitor saved from the planner, newest first, on this device. */
const KEY = "vagabonds-saved-routes";

export interface SavedRoute {
  id: string;
  region: Region;
  duration: Duration;
  /** The food stops added to it ("Rotaya ekle"). */
  dishes: string[];
  title: string;
  stops: number;
  savedAt: string;
}

let routes: readonly SavedRoute[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: readonly SavedRoute[]) {
  routes = next;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {
    // Kept for this run only.
  });
}

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        routes = parsed as SavedRoute[];
        listeners.forEach((listener) => listener());
      }
    } catch {
      // Unreadable: the list starts empty.
    }
  })();
  return loaded;
}

/** The same plan twice is one route: the region, the length and the food stops make it. */
export function routeKey(route: Pick<SavedRoute, "region" | "duration" | "dishes">): string {
  return [route.region, route.duration, [...route.dishes].sort().join("+")].join("|");
}

export async function saveRoute(route: Omit<SavedRoute, "id" | "savedAt">): Promise<void> {
  await load();
  const key = routeKey(route);
  set([
    { ...route, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, savedAt: new Date().toISOString() },
    ...routes.filter((r) => routeKey(r) !== key),
  ]);
}

export async function removeRoute(id: string): Promise<void> {
  await load();
  set(routes.filter((route) => route.id !== id));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSavedRoutes(): readonly SavedRoute[] {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => routes,
    () => routes,
  );
}

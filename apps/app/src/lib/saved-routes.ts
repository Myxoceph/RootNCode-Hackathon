import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TripPlanResponse } from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import type { Duration, Region } from "@/content/routes";

/**
 * Profil · Rotalarım: the routes the visitor saved from the planner and the trips Rehber planned
 * for them, newest first, on this device.
 */
const KEY = "vagabonds-saved-routes";

/** A route saved from the planner ("Rotayı kaydet"); routes saved before trips came have no `kind`. */
export interface PlannerRoute {
  kind?: "planner";
  id: string;
  region: Region;
  duration: Duration;
  /** The food stops added to it ("Rotaya ekle"). */
  dishes: string[];
  title: string;
  stops: number;
  savedAt: string;
}

/** A trip plan Rehber gave in the chat, kept as it was planned. */
export interface TripRoute {
  kind: "trip";
  id: string;
  title: string;
  stops: number;
  trip: TripPlanResponse;
  savedAt: string;
}

export type SavedRoute = PlannerRoute | TripRoute;

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

/**
 * The same plan twice is one route. A planner route is its region, length and food stops; a
 * Rehber trip is its city, length, theme and first day.
 */
export function routeKey(route: Pick<PlannerRoute, "region" | "duration" | "dishes"> | Pick<TripRoute, "kind" | "trip">): string {
  if ("trip" in route) {
    const { trip } = route;
    return ["trip", trip.city.code, trip.duration, trip.theme?.code ?? "", trip.days[0]?.date ?? ""].join("|");
  }
  return [route.region, route.duration, [...route.dishes].sort().join("+")].join("|");
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function keep(route: SavedRoute): Promise<void> {
  await load();
  const key = routeKey(route);
  set([route, ...routes.filter((r) => routeKey(r) !== key)]);
}

export function saveRoute(route: Omit<PlannerRoute, "id" | "savedAt" | "kind">): Promise<void> {
  return keep({ ...route, kind: "planner", id: newId(), savedAt: new Date().toISOString() });
}

/** Keeps a trip Rehber planned; the same trip again replaces the one before. */
export function saveTrip(trip: TripPlanResponse): Promise<void> {
  const stops = trip.days.reduce((sum, day) => sum + day.items.filter((item) => item.kind === "stop").length, 0);
  return keep({ kind: "trip", id: newId(), title: `${trip.city.label} gezi planı`, stops, trip, savedAt: new Date().toISOString() });
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

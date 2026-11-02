import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedRoute, TripPlanResponse } from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { currentUserId, deleteMyRoute, fetchMyRoutes, saveMyRoute, useCommunity } from "@/data/community";

export type { SavedRoute } from "@vagabonds/contracts";

/**
 * Profil · Rotalarım: the routes the visitor saved from the planner and the trips Rehber planned
 * for them, newest first, on their account (`/me/routes`): every device shows the same list, and
 * another account on the same phone shows its own. Signed out, a route is kept for this run only.
 */
/** Before 2026-11-03 one list for the whole phone; removed, it belonged to no account. */
const SHARED_KEY = "vagabonds-saved-routes";

/** A route saved from the planner ("Rotayı kaydet"). */
export type PlannerRoute = Extract<SavedRoute, { kind: "planner" }>;

/** A trip plan Rehber gave in the chat, kept as it was planned. */
export type TripRoute = Extract<SavedRoute, { kind: "trip" }>;

/** Whose routes are loaded: an account or session id, null when signed out, undefined before the first load. */
let owner: string | null | undefined;
let routes: readonly SavedRoute[] = [];
/** The owner's list on its way: a save waits for it, so the list that arrives cannot drop the new route. */
let loading: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function set(next: readonly SavedRoute[]) {
  routes = next;
  listeners.forEach((listener) => listener());
}

function loadFor(userId: string | null): Promise<void> {
  if (owner === userId) return loading;
  owner = userId;
  set([]);
  void AsyncStorage.removeItem(SHARED_KEY).catch(() => {});
  loading =
    userId === null
      ? Promise.resolve()
      : fetchMyRoutes()
          .catch(() => null)
          .then((mine) => {
            // Signed out or switched account while loading: those routes are someone else's.
            if (owner === userId && mine) set(mine);
          });
  return loading;
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

/**
 * Shown at once; sent to the account. If the API refuses it, the list goes back to how it was.
 * Rehber saves trips before Rotalarım was ever opened: the account's list is loaded first, so the
 * new route is not lost when it arrives.
 */
async function keep(route: SavedRoute): Promise<void> {
  await loadFor(await currentUserId());
  const key = routeKey(route);
  const before = routes;
  set([route, ...routes.filter((r) => routeKey(r) !== key)]);
  if (!owner) return;
  const { savedAt: _savedAt, ...unsaved } = route;
  try {
    const saved = await saveMyRoute(key, unsaved);
    set(routes.map((r) => (r.id === saved.id ? saved : r)));
  } catch {
    if (routes[0]?.id === route.id) set(before);
  }
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
  await loadFor(await currentUserId());
  set(routes.filter((route) => route.id !== id));
  if (owner) await deleteMyRoute(id).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSavedRoutes(): readonly SavedRoute[] {
  const { user } = useCommunity();
  const userId = user === undefined ? undefined : (user?.id ?? null);
  useEffect(() => {
    if (userId !== undefined) void loadFor(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribe,
    () => routes,
    () => routes,
  );
}

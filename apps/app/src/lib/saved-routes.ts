import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRANSIT_CITY, type ChatResponse, type SavedAnswerAbout, type SavedRoute, type TripPlanResponse } from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { currentUserId, deleteMyRoute, fetchMyRoutes, saveMyRoute, useCommunity } from "@/data/community";
import { getLang, getMessages } from "@/i18n";

export type { SavedRoute } from "@vagabonds/contracts";

/**
 * Profil · Kaydettiklerim: the routes the visitor saved from the planner, and the trips, food
 * suggestions and transport directions Rehber gave them, newest first, on their account (`/me/routes`): every device shows the same list, and
 * another account on the same phone shows its own. Signed out, a route is kept for this run only.
 */
/** Before 2026-11-03 one list for the whole phone; removed, it belonged to no account. */
const SHARED_KEY = "vagabonds-saved-routes";

/** A route saved from the planner ("Rotayı kaydet"). */
export type PlannerRoute = Extract<SavedRoute, { kind: "planner" }>;

/** A trip plan Rehber gave in the chat, kept as it was planned. */
export type TripRoute = Extract<SavedRoute, { kind: "trip" }>;

/** A food suggestion Rehber gave in the chat. */
export type FoodAdvice = Extract<SavedRoute, { kind: "food" }>;

/** Bus and tram directions Rehber gave in the chat. */
export type TransitAdvice = Extract<SavedRoute, { kind: "transit" }>;

/** The kept entries that are routes to walk, as Kaydettiklerim's Rotalar tab lists them. */
export function isRoute(route: SavedRoute): route is PlannerRoute | TripRoute {
  return route.kind === "planner" || route.kind === "trip";
}

/** Longest `key` the API accepts (`SaveRouteRequestSchema`). */
const KEY_MAX = 300;
/** Longest title the API accepts (`SavedRouteSchema`). */
const TITLE_MAX = 120;
/** Dishes a food suggestion's title names; the rest are counted. */
const TITLE_DISHES = 3;

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
 * Rehber trip is its city, length, theme and first day; a food suggestion is the dishes it names;
 * directions are where they go from and to.
 */
type KeyedRoute =
  | Pick<PlannerRoute, "region" | "duration" | "dishes">
  | Pick<TripRoute, "kind" | "trip">
  | (Pick<FoodAdvice, "kind" | "dishes"> & { about?: SavedAnswerAbout | null })
  | (Pick<TransitAdvice, "kind" | "transit"> & { about?: SavedAnswerAbout | null });

export function routeKey(route: KeyedRoute): string {
  if ("trip" in route) {
    const { trip } = route;
    return ["trip", trip.city.code, trip.duration, trip.theme?.code ?? "", trip.days[0]?.date ?? ""].join("|");
  }
  // Under each route and asset its own: the same dishes suggested for two routes are kept for both.
  const about = "about" in route ? (route.about?.key ?? "") : "";
  if ("transit" in route) {
    const { from, to } = route.transit;
    return ["transit", about, from.name, to.assetId ?? to.name].join("|").slice(0, KEY_MAX);
  }
  if ("kind" in route && route.kind === "food") {
    return ["food", about, ...route.dishes.map((dish) => dish.id).sort()].join("|").slice(0, KEY_MAX);
  }
  const planner = route as Pick<PlannerRoute, "region" | "duration" | "dishes">;
  return [planner.region, planner.duration, [...planner.dishes].sort().join("+")].join("|");
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

const tripTitle = (trip: TripPlanResponse) => getMessages().shared.tripTitle(trip.city.label);

/** Keeps a trip Rehber planned; the same trip again replaces the one before. */
export function saveTrip(trip: TripPlanResponse): Promise<void> {
  const stops = trip.days.reduce((sum, day) => sum + day.items.filter((item) => item.kind === "stop").length, 0);
  return keep({ kind: "trip", id: newId(), title: tripTitle(trip), stops, trip, savedAt: new Date().toISOString() });
}

/** The first dishes by name, the rest counted: "Etliekmek, Tirit, Höşmerim +4". */
function dishesTitle(dishes: ReadonlyArray<{ title: string }>): string {
  const named = dishes.slice(0, TITLE_DISHES).map((dish) => dish.title).join(", ");
  return `${named}${dishes.length > TITLE_DISHES ? ` +${dishes.length - TITLE_DISHES}` : ""}`.slice(0, TITLE_MAX);
}

/** Where in the chat a question was asked: its asset's page, and the trips planned before it, oldest first. */
export interface AskedIn {
  asset?: { id: string; name: string } | undefined;
  trips?: readonly TripPlanResponse[];
}

const tripAbout = (trip: TripPlanResponse): SavedAnswerAbout => ({ kind: "route", key: routeKey({ kind: "trip", trip }), title: tripTitle(trip) });

/**
 * What an answer was about: the page it was asked from, else the last trip planned in the
 * conversation, if the answer is in that trip's city (a question about another city leaves it alone).
 */
function aboutOf(inCity: (trip: TripPlanResponse) => boolean, { asset, trips = [] }: AskedIn): SavedAnswerAbout | null {
  if (asset) return { kind: "asset", key: asset.id, title: asset.name.slice(0, TITLE_MAX) };
  const trip = trips.at(-1);
  return trip && inCity(trip) ? tripAbout(trip) : null;
}

/**
 * What of a Rehber answer belongs in Kaydettiklerim: the dishes it cites and the directions it gives,
 * each with what they were asked about. A trip is kept whole by `saveTrip`, its meals with it; a
 * journey no bus helps with is no directions.
 */
export function adviceOf(question: string, response: ChatResponse, asked: AskedIn = {}): Array<Omit<FoodAdvice, "id" | "savedAt"> | Omit<TransitAdvice, "id" | "savedAt">> {
  if (response.attachments.trip) return [];
  const answer = response.answer.replace(/\s*\[\d+\]/g, "").replace(/\*\*/g, "").trim();
  const dishes = response.citations.filter((citation) => citation.kind === "dish").map(({ id, title }) => ({ id, title }));
  const unique = dishes.filter((dish, i) => dishes.findIndex((other) => other.id === dish.id) === i);
  const transit = response.attachments.transit;
  return [
    ...(unique.length > 0
      ? [{ kind: "food" as const, title: dishesTitle(unique), question, answer, dishes: unique, about: aboutOf((trip) => unique.some((dish) => dish.id.startsWith(`${trip.city.code}-`)), asked) }]
      : []),
    ...(transit && transit.itineraries.length > 0
      ? [{ kind: "transit" as const, title: `${transit.from.name} → ${transit.to.name}`.slice(0, TITLE_MAX), question, answer, transit, about: aboutOf((trip) => trip.city.code === TRANSIT_CITY, asked) }]
      : []),
  ];
}

/** Keeps what a Rehber answer suggested; the same dishes or journey for the same route replace the one before. */
export async function saveAdvice(question: string, response: ChatResponse, asked: AskedIn): Promise<void> {
  for (const advice of adviceOf(question, response, asked)) {
    await keep({ ...advice, id: newId(), savedAt: new Date().toISOString() });
  }
}

/** A kept food answer as a menu: the words around it, and its "- Yemek: açıklaması" lines as dishes. */
export function menuOf(answer: string): { intro: string; dishes: Array<{ name: string; text: string }>; outro: string } {
  const intro: string[] = [];
  const outro: string[] = [];
  const dishes: Array<{ name: string; text: string }> = [];
  for (const line of answer.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const item = line.match(/^[-•]\s*(.+)$/)?.[1];
    if (item) {
      const colon = item.indexOf(": ");
      const text = colon > 0 ? item.slice(colon + 2) : "";
      dishes.push({ name: colon > 0 ? item.slice(0, colon) : item, text: `${text.charAt(0).toLocaleUpperCase(getLang())}${text.slice(1)}` });
    } else {
      (dishes.length > 0 ? outro : intro).push(line);
    }
  }
  return { intro: intro.join(" "), dishes, outro: outro.join(" ") };
}

/** Which kind of what an answer suggested is in the list, whatever it was kept under; null when none (yet). */
export function savedKindOf(saved: readonly SavedRoute[], response: ChatResponse): "food" | "transit" | null {
  const entry = adviceOf("", response).find((advice) =>
    saved.some((route) => route.kind === advice.kind && routeKey({ ...route, about: null } as KeyedRoute) === routeKey({ ...advice, about: null })),
  );
  return entry?.kind ?? null;
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

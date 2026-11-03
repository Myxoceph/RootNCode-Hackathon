import { useSyncExternalStore } from "react";

/** Where a tab's button is on screen, in window pixels. */
export interface TabSpot {
  x: number;
  y: number;
  width: number;
  height: number;
}

type TabSpots = Readonly<Record<string, TabSpot>>;

/**
 * The tab bar's buttons, as the bar measures them: the map tour points at them. Kept outside
 * React's tree because the bar and the map screen are siblings under the tabs.
 */
let spots: TabSpots = {};
const listeners = new Set<() => void>();

export function setTabSpot(name: string, spot: TabSpot) {
  const old = spots[name];
  if (old && old.x === spot.x && old.y === spot.y && old.width === spot.width && old.height === spot.height) return;
  spots = { ...spots, [name]: spot };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => spots;

export function useTabSpots(): TabSpots {
  return useSyncExternalStore(subscribe, read, read);
}

/** The tab the map tour is showing: the bar keeps it lit and dims the others; null when none. */
let spotlight: string | null = null;
const spotlightListeners = new Set<() => void>();

export function setTabSpotlight(name: string | null) {
  if (spotlight === name) return;
  spotlight = name;
  spotlightListeners.forEach((listener) => listener());
}

function subscribeSpotlight(listener: () => void) {
  spotlightListeners.add(listener);
  return () => {
    spotlightListeners.delete(listener);
  };
}

const readSpotlight = () => spotlight;

export function useTabSpotlight(): string | null {
  return useSyncExternalStore(subscribeSpotlight, readSpotlight, readSpotlight);
}

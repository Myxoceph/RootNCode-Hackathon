import { useSyncExternalStore } from "react";

/**
 * Food stops the visitor added to their route ("Rotaya ekle"). Shared by the
 * planner and the food list; kept for this session only.
 */
let added: readonly string[] = ["pideli-kofte"];
const listeners = new Set<() => void>();

/** A saved route's food stops, when it is opened again. */
export function setDishes(ids: readonly string[]) {
  added = ids;
  listeners.forEach((listener) => listener());
}

export function toggleDish(id: string) {
  added = added.includes(id) ? added.filter((d) => d !== id) : [...added, id];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAddedDishes(): readonly string[] {
  return useSyncExternalStore(subscribe, () => added, () => added);
}

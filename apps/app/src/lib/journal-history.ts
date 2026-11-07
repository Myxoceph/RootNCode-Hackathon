/** Steps kept to go back through while a page is being arranged: photos are only named here, so this stays light. */
const KEPT = 50;

export interface History<T> {
  past: readonly T[];
  future: readonly T[];
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** A new step, leaving `before` behind: what had been taken back cannot come back after it. */
export function record<T>(history: History<T>, before: T): History<T> {
  return { past: [...history.past, before].slice(-KEPT), future: [] };
}

/** One step back from `current`; null when there is none. */
export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = history.past[history.past.length - 1];
  if (value === undefined) return null;
  return { value, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

/** One step forward again from `current`; null when there is none. */
export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const [value, ...future] = history.future;
  if (value === undefined) return null;
  return { value, history: { past: [...history.past, current], future } };
}

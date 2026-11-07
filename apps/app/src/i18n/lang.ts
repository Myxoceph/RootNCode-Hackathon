import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@vagabonds/contracts";
import { useEffect, useState, useSyncExternalStore } from "react";

/** The language chosen in the settings, kept on the device; without one, the phone's own. */
const LANG_KEY = "vagabonds-lang";

/** The phone's (or browser's) language, if it is one the app speaks; Turkish otherwise. */
export function deviceLang(locale: string | undefined = systemLocale()): Lang {
  const base = (locale ?? "").toLowerCase().split(/[-_]/)[0];
  return base === "en" ? "en" : "tr";
}

function systemLocale(): string | undefined {
  try {
    // The browser's list first: it is the visitor's own order of languages.
    if (typeof navigator !== "undefined" && navigator.languages?.length) {
      const known = navigator.languages.find((tag) => /^(tr|en)\b/i.test(tag));
      if (known) return known;
    }
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/**
 * Web pages are rendered ahead of time, on a machine whose language is not the visitor's: they are
 * rendered in Turkish, the browser's first render matches them, and the visitor's language follows.
 * A phone renders nothing ahead of time and starts in its own language.
 */
const PRERENDERED = typeof document !== "undefined";
let current: Lang = PRERENDERED || typeof window === "undefined" ? "tr" : deviceLang();
let loaded: Promise<void> | null = null;
let settled = false;
const listeners = new Set<() => void>();

function publish(next: Lang) {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function loadLang(): Promise<void> {
  loaded ??= AsyncStorage.getItem(LANG_KEY)
    .then((stored) => publish(stored === "tr" || stored === "en" ? stored : deviceLang()))
    .catch(() => publish(deviceLang()))
    .finally(() => {
      settled = true;
    });
  return loaded;
}

/** The language now, outside React (requests, the data layer). */
export function getLang(): Lang {
  return current;
}

/** Chooses the app's language and keeps it on the device. */
export function setLang(next: Lang) {
  publish(next);
  void AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The app's language; every screen using it follows a change at once. */
export function useLang(): Lang {
  useEffect(() => {
    void loadLang();
  }, []);
  return useSyncExternalStore(subscribe, getLang, serverLang);
}

function serverLang(): Lang {
  return "tr";
}

/** False until the chosen language has been read from the device: the splash screen waits for it. */
export function useLangSettled(): boolean {
  const [done, setDone] = useState(settled);
  useEffect(() => {
    let live = true;
    void loadLang().then(() => {
      if (live) setDone(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return done;
}

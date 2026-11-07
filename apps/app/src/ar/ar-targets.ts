import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArTargetsResponseSchema, CONTRACT_VERSION, type ArTargetEntry } from "@vagabonds/contracts";
import * as Network from "expo-network";
import { useEffect } from "react";
import { Platform } from "react-native";

import { dataSource } from "@/data";
import { readLastCity } from "@/lib/last-city";

import { INSCRIPTION_ASSET } from "./inscription-targets";
import { prefetchMinds } from "./mind-store";
import { MINDAR_VERSION } from "./mindar";

/**
 * The inscriptions the camera can find, with where they are (`GET /ar-targets`, a row each). Kept
 * on the device and shown at once on the next start, refreshed behind it, so Taşın Dili picks the
 * ones near the visitor without waiting for the network or fetching every asset.
 */
const KEY = `vagabonds-ar-targets:${CONTRACT_VERSION}`;
/** A list this fresh is not asked for again. */
const FRESH_MS = 10 * 60_000;

let known: { items: ArTargetEntry[]; at: number } | null = null;
let refreshing: Promise<ArTargetEntry[] | null> | null = null;

/** Only targets this app's MindAR can load. */
const usable = (items: ArTargetEntry[]) => items.filter((item) => item.mindarVersion === MINDAR_VERSION);

function refresh(): Promise<ArTargetEntry[] | null> {
  refreshing ??= dataSource
    .listArTargets()
    .then((response) => {
      known = { items: usable(response.items), at: Date.now() };
      void AsyncStorage.setItem(KEY, JSON.stringify(response)).catch(() => {});
      return known.items;
    })
    .catch(() => known?.items ?? null)
    .finally(() => (refreshing = null));
  return refreshing;
}

async function stored(): Promise<ArTargetEntry[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = ArTargetsResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? usable(parsed.data.items) : null;
  } catch {
    return null;
  }
}

/**
 * Every target, as soon as one list is at hand: the one in memory, else the one stored on the
 * device (both refreshed behind it), else the network's. `null` when none can be had.
 */
export async function arTargets(): Promise<ArTargetEntry[] | null> {
  if (known) {
    if (Date.now() - known.at > FRESH_MS) void refresh();
    return known.items;
  }
  const saved = await stored();
  if (saved) {
    // Stored: shown now, and asked for again at once.
    known = { items: saved, at: 0 };
    void refresh();
    return saved;
  }
  return refresh();
}

/** Waits this long after start, so the first screen's own requests go first. */
const PREFETCH_AFTER_MS = 4000;

/**
 * At start, behind the first screen: the list of targets is refreshed (a few KB), and on Wi-Fi the
 * `.mind` files Taşın Dili is likely to want are downloaded and kept: the sample asset's (the
 * Kamera tab's demo) and those of the city last opened on the map. Not on mobile data: a visitor
 * who never opens the camera should not pay for it. Those on the phone already are skipped.
 */
export function usePrefetchTargets(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    const timer = setTimeout(async () => {
      const items = await arTargets();
      if (!items || !active) return;
      const network = await Network.getNetworkStateAsync().catch(() => null);
      if (network?.type !== Network.NetworkStateType.WIFI || !active) return;
      const city = await readLastCity();
      const wanted = items.filter((item) => item.assetId === INSCRIPTION_ASSET || (city !== null && item.city === city));
      await prefetchMinds(wanted.map((item) => item.mindUrl));
    }, PREFETCH_AFTER_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
}

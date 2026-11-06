import * as Location from "expo-location";
import { useEffect, useState } from "react";

import type { Position } from "./current-position";

/** Where the visitor is, and the place's name as the phone knows it ("Kadıköy", "İstanbul"); name `null` when it has none. */
export interface Here {
  position: Position;
  place: string | null;
}

/** How long a fix is waited for before the weather falls back to the city last opened on the map. */
const FIX_WAIT_MS = 8000;
/** A position the phone already knows is good enough for the weather while it is this fresh. */
const KNOWN_MAX_AGE_MS = 30 * 60_000;

/**
 * Where the visitor is, as near as the weather needs (a town, not a street): the position the phone
 * already knows when it is fresh, else a quick, rough fix. `null` when refused or none comes in time.
 */
async function findPosition(): Promise<Position | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const known = await Location.getLastKnownPositionAsync({ maxAge: KNOWN_MAX_AGE_MS }).catch(() => null);
    if (known) return { lat: known.coords.latitude, lng: known.coords.longitude };
    // A rough fix from the network first; where there is none (no Wi-Fi or cell positioning), GPS.
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_WAIT_MS / 2)),
    ]).then(
      (rough) =>
        rough ??
        Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_WAIT_MS / 2)),
        ]),
    );
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** The place's name from the phone's own geocoder: the district, else the city, else the province. */
async function placeOf(position: Position): Promise<string | null> {
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude: position.lat, longitude: position.lng });
    return address?.city || address?.subregion || address?.region || null;
  } catch {
    // The web has no geocoder of its own: the weather is named "Konumun" instead.
    return null;
  }
}

/**
 * Where the visitor is now, asking for the location permission the first time. `undefined` while
 * it is being found, `null` when it is refused or no fix comes in time.
 */
export function useHere(): Here | null | undefined {
  const [here, setHere] = useState<Here | null>();
  useEffect(() => {
    let active = true;
    void (async () => {
      const position = await findPosition();
      if (!position) {
        if (active) setHere(null);
        return;
      }
      // The weather need not wait for the name.
      if (active) setHere({ position, place: null });
      const place = await placeOf(position);
      if (active && place) setHere({ position, place });
    })();
    return () => {
      active = false;
    };
  }, []);
  return here;
}

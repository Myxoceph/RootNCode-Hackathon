import * as Location from "expo-location";

export interface Position {
  lat: number;
  lng: number;
}

/**
 * Where the visitor is now, asking for the location permission the first time. `null` when it
 * is refused or no fix comes: the app goes on without it, only the visit check needs it.
 */
export async function currentPosition(): Promise<Position | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return null;
  }
}

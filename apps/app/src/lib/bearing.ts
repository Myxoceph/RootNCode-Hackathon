import { getMessages, localeTag } from "@/i18n";

interface Point {
  lat: number;
  lng: number;
}

/** Kilometres between two points (great circle). */
export function kmBetween(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Which of the eight compass points `b` lies towards from `a`: 0 north, then clockwise. */
export function compassPoint(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  const degrees = (Math.atan2(y, x) / rad + 360) % 360;
  return Math.round(degrees / 45) % 8;
}

/** "650 m" under a kilometre (to the nearest 50), "1,2 km" over it. */
export function distanceText(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${new Intl.NumberFormat(localeTag(), { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}

/**
 * Where a place lies from another, in words, for those who cannot see the map:
 * "Ulucami ile arası 150 m, kuzeydoğu yönünde".
 */
export function whereFrom(from: { name: string } & Point, to: Point): string {
  const w = getMessages().mapWords;
  return w.whereFrom(from.name, distanceText(kmBetween(from, to)), w.directions[compassPoint(from, to)] ?? "");
}

import type { Lang, TransitEntryPointCode } from "@vagabonds/contracts";

/**
 * Where visitors arrive in Konya. Points from OpenStreetMap, except the bus terminal: its building has
 * no mapped footpath to the tram platform, so a route from its centre walked a kilometre to the next
 * stop; the Otogar tram stop (GTFS t13a) is where arrivals board.
 */
export const ENTRY_POINTS: Record<TransitEntryPointCode, { tr: string; en: string; lat: number; lng: number }> = {
  // OSM node 5014804022
  "konya-gari": { tr: "Konya Garı", en: "Konya Railway Station", lat: 37.865336, lng: 32.475896 },
  // OSM node 11034131794
  "selcuklu-yht-gari": { tr: "Selçuklu YHT Garı", en: "Selçuklu High-Speed Train Station", lat: 37.898243, lng: 32.498152 },
  // GTFS stop t13a
  "konya-otogari": { tr: "Konya Otogarı (tramvay durağı)", en: "Konya Bus Terminal (tram stop)", lat: 37.94899, lng: 32.51264 },
};

export const entryPointName = (code: TransitEntryPointCode, lang: Lang) => ENTRY_POINTS[code][lang];

/** The area the graph covers (deploy/otp/prepare.sh): every GTFS stop, with a margin to walk to it. */
export const PILOT_BOUNDS = { minLat: 37.6, maxLat: 38.27, minLng: 32.28, maxLng: 32.95 };

export const inPilotArea = ({ lat, lng }: { lat: number; lng: number }) =>
  lat >= PILOT_BOUNDS.minLat && lat <= PILOT_BOUNDS.maxLat && lng >= PILOT_BOUNDS.minLng && lng <= PILOT_BOUNDS.maxLng;

export const TRANSIT_SOURCE = {
  tr: { name: "Konya Büyükşehir Belediyesi Açık Veri", timetable: "Kasım 2025 tarifesi" },
  en: { name: "Konya Metropolitan Municipality Open Data", timetable: "November 2025 timetable" },
  license: "CC BY 4.0",
  url: "https://acikveri.konya.bel.tr/dataset/toplu-tasima-gtfs-verileri",
};

import type { MapPadding, MapPin } from "./types";

/**
 * MapLibre GL JS from jsDelivr: the same renderer on the web and, in a WebView, on phones.
 * 5.x on purpose: 6.x ships only ES modules with a separate worker file, which a page
 * cannot start from another origin (the CDN).
 */
export const MAPLIBRE_VERSION = "5.24.0";

/** Free vector tiles from OpenStreetMap data, no key (openfreemap.org). */
const STYLE_URL = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };

export interface MapPageColors {
  /** Land, from the theme's `mapBackground`. */
  land: string;
  pin: string;
  pinSelected: string;
  /** Ring around pins, so they stand out from the land. */
  outline: string;
  onCluster: string;
}

/** Messages the map page posts to the app. */
export type MapPageEvent = { type: "ready" } | { type: "select"; id: string | null } | { type: "error"; message: string };

/** Messages the app sends to the map page. */
export type MapPageCommand = { type: "pins"; pins: MapPin[]; padding: MapPadding } | { type: "select"; id: string | null };

export function parseMapPageEvent(data: unknown): MapPageEvent | null {
  if (typeof data !== "string") return null;
  try {
    const event = JSON.parse(data) as MapPageEvent;
    return typeof event?.type === "string" ? event : null;
  } catch {
    return null;
  }
}

/**
 * The map page: OpenFreeMap tiles recolored to the theme, assets as a clustered
 * GeoJSON layer. Tapping a cluster zooms into it; tapping a pin selects it.
 * Pins and the selection come in as `MapPageCommand`s through `window.vagabondsMap.receive`.
 */
export function mapPageHtml({ scheme, colors }: { scheme: "light" | "dark"; colors: MapPageColors }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.land}; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<script>
const post = (event) => {
  const data = JSON.stringify(event);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else window.parent.postMessage(data, "*");
};
const colors = ${JSON.stringify(colors)};
let pending = [];
let loaded = false;
let fitted = false;
/** Set by start() once the map exists. */
const actions = {};

window.vagabondsMap = {
  receive(command) {
    if (!loaded) {
      pending.push(command);
      return;
    }
    if (command.type === "pins") actions.showPins(command.pins, command.padding);
    if (command.type === "select") actions.select(command.id);
  },
};

if (!window.maplibregl) {
  post({ type: "error", message: "MapLibre could not be downloaded" });
} else {
  start();
}

function start() {
  const map = new maplibregl.Map({
    container: "map",
    style: ${JSON.stringify(STYLE_URL[scheme])},
    center: [29.06, 40.19],
    zoom: 11,
    attributionControl: { compact: true },
  });
  window.vagabondsMap.map = map;
  map.on("error", (event) => post({ type: "error", message: String(event.error && event.error.message || event.error) }));
  // The base style asks for a few pattern images it does not ship; an empty one keeps the console quiet.
  map.on("styleimagemissing", (event) => map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) }));

  map.on("load", () => {
    map.setPaintProperty("background", "background-color", colors.land);
    map.addSource("assets", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 14 });
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "assets",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": colors.pin,
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
        "circle-stroke-width": 2,
        "circle-stroke-color": colors.outline,
      },
    });
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "assets",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 13 },
      paint: { "text-color": colors.onCluster },
    });
    map.addLayer({
      id: "pins",
      type: "circle",
      source: "assets",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "id"], ["literal", ""]], 12, 8],
        // Unverified coordinates are hollow: the place is approximate.
        "circle-color": ["case", ["get", "verified"], colors.pin, colors.outline],
        "circle-stroke-width": ["case", ["get", "verified"], 2, 3],
        "circle-stroke-color": ["case", ["get", "verified"], colors.outline, colors.pin],
      },
    });

    map.on("click", "clusters", async (event) => {
      const feature = event.features[0];
      const zoom = await map.getSource("assets").getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
    map.on("click", (event) => {
      const hit = map.queryRenderedFeatures(event.point, { layers: ["pins", "clusters"] })[0];
      if (hit && hit.layer.id === "pins") {
        select(hit.properties.id);
        post({ type: "select", id: hit.properties.id });
      } else if (!hit) {
        select(null);
        post({ type: "select", id: null });
      }
    });
    for (const layer of ["clusters", "pins"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    loaded = true;
    pending.forEach((command) => window.vagabondsMap.receive(command));
    pending = [];
  });

  function showPins(pins, padding) {
    map.getSource("assets").setData({
      type: "FeatureCollection",
      features: pins.map((pin) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
        properties: { id: pin.id, verified: pin.verified },
      })),
    });
    if (pins.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      pins.forEach((pin) => bounds.extend([pin.lng, pin.lat]));
      map.fitBounds(bounds, { padding, maxZoom: 15, duration: fitted ? 600 : 0 });
      fitted = true;
    }
    map.once("idle", () => post({ type: "ready" }));
  }

  function select(id) {
    map.setPaintProperty("pins", "circle-radius", ["case", ["==", ["get", "id"], id || ""], 12, 8]);
    map.setPaintProperty("pins", "circle-stroke-color", ["case", ["==", ["get", "id"], id || ""], colors.pinSelected, ["case", ["get", "verified"], colors.outline, colors.pin]]);
  }

  actions.showPins = showPins;
  actions.select = select;
}
</script>
</body>
</html>`;
}

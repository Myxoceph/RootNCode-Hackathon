import turkeyOutline from "./turkey-outline.json";
import turkeyProvinces from "./turkey-provinces.json";
import type { MapNetwork, MapPadding, MapPin, MapProvinces } from "./types";

/**
 * MapLibre GL JS, bundled into the app by scripts/vendor-web-libs.mts: the same renderer
 * on the web and, in a WebView, on phones. 5.x on purpose: 6.x ships only ES modules with
 * a separate worker file, which an inlined page has no URL to start from.
 */
export const MAPLIBRE_VERSION = "5.24.0";

/**
 * Free vector tiles from OpenStreetMap data, no key (openfreemap.org), through our own
 * domain: deploy/tiles-worker caches them, so the map draws when OpenFreeMap cannot (Y19).
 */
const TILES = "https://tiles.allbytech.com";
const STYLE_URL = { light: `${TILES}/styles/positron`, dark: `${TILES}/styles/dark` };

/** Turkey from its westernmost to its easternmost province ([west, south], [east, north]). */
const TURKEY_BOUNDS = [
  [25.66, 35.82],
  [44.8, 42.1],
];

export interface MapPageColors {
  /** Land, from the theme's `mapBackground`. */
  land: string;
  pin: string;
  pinSelected: string;
  /** Ring around pins, so they stand out from the land. */
  outline: string;
  onCluster: string;
  /** The fog over undiscovered assets, and the marks drawn above it. */
  fog: string;
  mark: string;
  markText: string;
  label: string;
  labelText: string;
  /** Outline of a province with assets. */
  province: string;
  /** Every other province border, quiet. */
  border: string;
  /** The city map's seals: the disc (a gradient), its ring, its icon, its lock and the lock's outline, and the chosen one's halo. */
  seal: { from: string; to: string; ring: string; icon: string; lock: string; lockEdge: string; halo: string };
  /** The fog bank each locked asset hides in: where it faces the sky, its body, and where it turns away. */
  cloud: { top: string; middle: string; bottom: string };
}

/** Messages the map page posts to the app. */
export type MapPageEvent =
  | { type: "ready" }
  | { type: "select"; id: string | null }
  | { type: "province"; plate: number }
  | { type: "leaveCity" }
  /** The camera has landed on the chosen city, its flight over. */
  | { type: "cityLanded"; plate: number }
  | { type: "error"; message: string };

/** Messages the app sends to the map page. */
export type MapPageCommand =
  | { type: "pins"; pins: MapPin[]; padding: MapPadding }
  | { type: "select"; id: string | null }
  | { type: "network"; network: MapNetwork | null }
  | { type: "provinces"; provinces: MapProvinces | null };

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
 * Pins, the selection and the network come in as `MapPageCommand`s through
 * `window.vagabondsMap.receive`.
 *
 * The network (fog, links, marked pins) is drawn on a canvas above the map, so
 * overlapping clearings simply merge and their edges stay soft.
 *
 * Provinces (./turkey-provinces.json: Natural Earth admin-1, public domain, simplified)
 * are line layers: every border drawn quietly, the highlighted ones in color; the base style's own
 * province borders are hidden so the others carry no mark. The first time they are shown
 * with `reveal`, Turkey rises out of drifting fog on the same canvas (see `startIntro`);
 * ./turkey-outline.json is the country's border for the gold trace. The provinces with
 * assets are named by a symbol layer, which hides names that would overlap.
 */
export function mapPageHtml({
  scheme,
  colors,
  maplibre,
  opening = null,
}: {
  scheme: "light" | "dark";
  colors: MapPageColors;
  /** MapLibre inlined, so the page needs no network for it (`loadMaplibre` in @/vendor). */
  maplibre: { script: string; css: string };
  /**
   * Set when the map shows Turkey's provinces: it opens on the whole country instead of a
   * city, and with `reveal` under closed fog, so no tile shows before the fog starts to lift.
   */
  opening?: { reveal: boolean } | null;
}): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>${maplibre.css}</style>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.land}; }
  #network { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
</head>
<body>
<div id="map"></div>
<script>${maplibre.script}</script>
<script>
const post = (event) => {
  const data = JSON.stringify(event);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else window.parent.postMessage(data, "*");
};
const colors = ${JSON.stringify(colors)};
const PROVINCES = ${JSON.stringify(turkeyProvinces)};
const TURKEY_BOUNDS = ${JSON.stringify(TURKEY_BOUNDS)};
const OPENING = ${JSON.stringify(opening)};
const OUTLINE = ${JSON.stringify(turkeyOutline)};
const DARK = ${scheme === "dark"};
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
    // A failure here would vanish inside the WebView; report it so the screen can show it.
    try {
      if (command.type === "pins") actions.showPins(command.pins, command.padding);
      if (command.type === "select") actions.select(command.id);
      if (command.type === "network") actions.showNetwork(command.network);
      if (command.type === "provinces") actions.showProvinces(command.provinces);
    } catch (error) {
      reportError(command.type, error);
    }
  },
};

function reportError(where, error) {
  post({ type: "error", message: where + ": " + String((error && error.message) || error) });
}
window.addEventListener("error", (event) => reportError("page", event.error || event.message));

if (!window.maplibregl) {
  post({ type: "error", message: "MapLibre did not load" });
} else {
  start();
}

function start() {
  const map = new maplibregl.Map({
    container: "map",
    style: ${JSON.stringify(STYLE_URL[scheme])},
    ...(OPENING ? { bounds: TURKEY_BOUNDS, fitBoundsOptions: { padding: 24 } } : { center: [29.06, 40.19], zoom: 11 }),
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

    map.addSource("provinces", { type: "geojson", data: PROVINCES });
    // All 81 borders, thin and quiet, so the country reads as provinces; the ones with assets are drawn over them.
    map.addLayer(
      {
        id: "province-borders",
        type: "line",
        source: "provinces",
        layout: { "line-join": "round" },
        paint: {
          "line-color": colors.border,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 1.2],
          "line-opacity": 0,
          "line-opacity-transition": { duration: 1200 },
        },
      },
      "clusters",
    );
    // Below the pins, so a pin on a border stays tappable.
    map.addLayer(
      {
        id: "province-lines",
        type: "line",
        source: "provinces",
        filter: ["in", ["get", "plate"], ["literal", []]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": colors.province, "line-width": 2, "line-opacity": 0, "line-opacity-transition": { duration: 900 } },
      },
      "clusters",
    );
    // A wide, soft copy under the outlines: it flashes once when they appear.
    map.addLayer(
      {
        id: "province-glow",
        type: "line",
        source: "provinces",
        filter: ["in", ["get", "plate"], ["literal", []]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": colors.province, "line-width": 10, "line-blur": 7, "line-opacity": 0, "line-opacity-transition": { duration: 700 } },
      },
      "province-lines",
    );

    // Capitals (upper-cased the Turkish way in setLabels: i → İ) with a halo, no boxes: calm enough for all 81. Names that would overlap are
    // left out until the map is zoomed in; the province with more assets wins.
    map.addSource("province-names", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer(
      {
        id: "province-names",
        type: "symbol",
        source: "province-names",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 13],
          "text-letter-spacing": 0.12,
          "text-padding": 6,
          "symbol-sort-key": ["-", 0, ["get", "rank"]],
        },
        paint: {
          "text-color": colors.labelText,
          "text-halo-color": colors.land,
          "text-halo-width": 1.6,
          "text-halo-blur": 0.5,
          "text-opacity": 0,
          "text-opacity-transition": { duration: 800 },
        },
      },
      "clusters",
    );

    // Invisible, only to find the tapped province.
    map.addLayer(
      { id: "province-hit", type: "fill", source: "provinces", filter: ["in", ["get", "plate"], ["literal", []]], paint: { "fill-color": colors.province, "fill-opacity": 0 } },
      "province-borders",
    );
    // The chosen city's assets are still locked: each hides in the fog, sealed with
    // the icon of its kind and a small lock; the names stand beside them once the streets are
    // close, where they fit. The landmark's seal is gold and larger; the chosen one pulses.
    map.addSource("city-assets", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    for (const category of GLYPHS) {
      map.addImage("seal-" + category, sealImage(category, false), { pixelRatio: SEAL_RATIO });
      map.addImage("seal-" + category + "-landmark", sealImage(category, true), { pixelRatio: SEAL_RATIO });
    }
    // The city's fog, in two parts drawn by the map itself, so it stays fixed to the ground as the
    // map moves. Its own copy of the assets, cut into tiles no smaller than zoom 12's (about 10 km)
    // with a wide margin: the map draws a point only from the tiles on screen, and up close a fog
    // bank reaches far past its asset, so with street-sized tiles it would vanish the moment its
    // asset's tile left the screen.
    map.addSource("city-fog", { type: "geojson", data: { type: "FeatureCollection", features: [] }, maxzoom: 12, buffer: 512 });
    // A light haze joins the assets into one fog over the quarters where they crowd...
    map.addLayer({
      id: "city-haze",
      type: "heatmap",
      source: "city-fog",
      paint: {
        // Wide from afar, so it covers whole districts; closer in it grows a little faster each level,
        // never by a jump, up to where it gets costly to draw.
        "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], ...HAZE_RADIUS.flat()],
        // As the map zooms out its assets close up on screen faster than the haze shrinks, so more of
        // them pile onto each spot; each weighs that much less, and the haze stays as thick at every
        // zoom instead of swelling into a glare.
        "heatmap-intensity": ["interpolate", ["exponential", 2], ["zoom"], ...hazeWeights().flat()],
        "heatmap-color": hazeRamp(),
        "heatmap-opacity": 0,
        "heatmap-opacity-transition": { duration: 1200 },
      },
    });
    // ...and each locked asset hides in a thick bank of its own, standing out in the haze.
    for (let shape = 0; shape < CLOUD_SHAPES.length; shape++) map.addImage("cloud-" + shape, cloudImage(CLOUD_SHAPES[shape]), { pixelRatio: CLOUD_RATIO });
    map.addLayer({
      id: "city-clouds",
      type: "symbol",
      source: "city-fog",
      layout: {
        "icon-image": ["concat", "cloud-", ["to-string", ["get", "cloud"]]],
        "icon-rotate": ["get", "turn"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        // The bank keeps its ground: it grows and shrinks exactly as the map does, so zooming either
        // way never thins it, piles it into a glare or changes it by a jump.
        "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 10, BANK_SIZE / 32, 20, BANK_SIZE * 32],
      },
      paint: { "icon-opacity": 0, "icon-opacity-transition": { duration: 900 } },
    });
    // Further out the seals turn into gold dots, and the dots thin out (see dotOpacity).
    map.addLayer({
      id: "city-asset-dots",
      type: "circle",
      source: "city-assets",
      maxzoom: SEALS_ZOOM,
      paint: {
        // A seal too small for its icon: a gold heart in a broad navy rim.
        "circle-color": colors.seal.lock,
        "circle-stroke-color": colors.seal.to,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 7, 1.2, DOTS_ZOOM, DOT_RIM],
        "circle-opacity": 0,
        "circle-stroke-opacity": 0,
        "circle-opacity-transition": { duration: 700 },
        "circle-stroke-opacity-transition": { duration: 700 },
      },
    });
    map.addLayer({
      id: "city-asset-halo",
      type: "circle",
      source: "city-assets",
      minzoom: DOTS_ZOOM,
      filter: ["==", ["get", "id"], ""],
      // The chosen seal's outer ring, beating (see pulse).
      paint: { "circle-radius": haloRadius(1), "circle-color": "rgba(0, 0, 0, 0)", "circle-stroke-color": colors.seal.halo, "circle-stroke-width": 1.6, "circle-stroke-opacity": 0 },
    });
    // Below the badges, so a badge stays whole where a name runs under it.
    map.addLayer({
      id: "city-asset-names",
      type: "symbol",
      source: "city-assets",
      minzoom: NAMES_ZOOM,
      layout: {
        "text-field": ["get", "title"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-max-width": 8,
        "text-line-height": 1.15,
        // Beside the badge where there is room, else under or over it.
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 1.35,
        "text-justify": "auto",
        "text-padding": 5,
        "symbol-sort-key": ["case", ["get", "landmark"], -1, 0],
      },
      paint: {
        "text-color": colors.labelText,
        "text-halo-color": colors.land,
        "text-halo-width": 1.6,
        "text-halo-blur": 0.4,
        "text-opacity": 0,
        "text-opacity-transition": { duration: 700 },
      },
    });
    // Invisible, the size of a plain badge whatever the zoom: what the names keep clear of. The
    // badges themselves cannot be: a size that also depends on the asset gives them collision boxes
    // far larger than they look.
    map.addLayer({
      id: "city-asset-room",
      type: "symbol",
      source: "city-assets",
      layout: {
        // The seal itself, without its glow.
        "icon-image": "seal-other",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.32, 14, 0.52, 16, 0.68],
        "icon-allow-overlap": true,
        "icon-padding": 0,
      },
      paint: { "icon-opacity": 0 },
    });
    map.addLayer({
      id: "city-asset-badges",
      type: "symbol",
      source: "city-assets",
      layout: {
        "icon-image": ["case", ["get", "landmark"], ["concat", "seal-", ["get", "category"], "-landmark"], ["concat", "seal-", ["get", "category"]]],
        "icon-allow-overlap": true,
        // The names keep clear of city-asset-room instead.
        "icon-ignore-placement": true,
        ...badgeLayout(null),
      },
      paint: { "icon-opacity": 0, "icon-opacity-transition": { duration: 700 } },
    });

    map.on("click", "clusters", async (event) => {
      const feature = event.features[0];
      const zoom = await map.getSource("assets").getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
    map.on("click", (event) => {
      try {
        onTap(event);
      } catch (error) {
        reportError("tap", error);
      }
    });
    /** Of the features near a tap, the one closest to it: dots far out sit almost on each other. */
    function nearest(point, features) {
      const away = (feature) => map.project(feature.geometry.coordinates).dist(point);
      return features.reduce((best, feature) => (!best || away(feature) < away(best) ? feature : best), undefined);
    }
    function onTap(event) {
      // A finger is wider than a pixel.
      const around = [[event.point.x - 12, event.point.y - 12], [event.point.x + 12, event.point.y + 12]];
      if (cityPlate !== null) {
        const zoom = map.getZoom();
        const asset = zoom >= (SEALS_ZOOM + DOTS_ZOOM) / 2
          ? map.queryRenderedFeatures(around, { layers: ["city-asset-badges"] })[0]
          : nearest(event.point, map.queryRenderedFeatures(around, { layers: ["city-asset-dots"] }).filter((dot) => dot.properties.id === citySelected || dot.properties.tier >= tierShownAt(zoom)));
        if (asset) post({ type: "select", id: asset.properties.id });
        return;
      }
      if (provincesShown) {
        const province = map.queryRenderedFeatures(around, { layers: ["province-names", "province-hit"] })[0];
        if (province) {
          const plate = province.properties.plate;
          if (plate) post({ type: "province", plate });
          return;
        }
      }
      const mark = markAt(event.point);
      if (mark) {
        select(mark.id);
        post({ type: "select", id: mark.id });
        return;
      }
      const hit = map.queryRenderedFeatures(event.point, { layers: ["pins", "clusters"] })[0];
      if (hit && hit.layer.id === "pins") {
        select(hit.properties.id);
        post({ type: "select", id: hit.properties.id });
      } else if (!hit) {
        select(null);
        post({ type: "select", id: null });
      }
    }
    for (const layer of ["clusters", "pins", "province-hit", "province-names", "city-asset-badges", "city-asset-dots"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    // Let go of near the Turkey view, the city lets go too: the screen goes back to Turkey.
    let movedByHand = false;
    map.on("movestart", (event) => (movedByHand = Boolean(event.originalEvent)));
    map.on("moveend", (event) => {
      if (!(movedByHand || event.originalEvent) || cityPlate === null || !cityLanded || leaving) return;
      if (map.getZoom() >= outerZoom() + LEAVE_ROOM) return;
      leaving = true;
      post({ type: "leaveCity" });
    });

    loaded = true;
    pending.forEach((command) => window.vagabondsMap.receive(command));
    pending = [];
  });

  function showPins(pins, padding) {
    lastPadding = padding;
    hasPins = pins.length > 0;
    marks = pins.filter((pin) => pin.mark);
    draw();
    map.getSource("assets").setData({
      type: "FeatureCollection",
      features: pins.filter((pin) => !pin.mark).map((pin) => ({
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
    if (cityPlate !== null) {
      selectCityAsset(id);
      return;
    }
    citySelected = id;
    selected = id;
    draw();
    map.setPaintProperty("pins", "circle-radius", ["case", ["==", ["get", "id"], id || ""], 12, 8]);
    map.setPaintProperty("pins", "circle-stroke-color", ["case", ["==", ["get", "id"], id || ""], colors.pinSelected, ["case", ["get", "verified"], colors.outline, colors.pin]]);
  }

  // Provinces and the opening fog.
  /** The fog lifts over this long once the tiles are drawn. */
  const INTRO_MS = 4200;
  /** Tiles get this long to arrive before the fog lifts anyway; the fog keeps drifting meanwhile. */
  const INTRO_WAIT_MS = 2000;
  /** Fog cells across the screen; the browser smooths them up into soft clouds. */
  const FOG_CELLS = 72;
  /** Side of the repeating noise the clouds are cut from. */
  const NOISE_SIZE = 64;
  /** Middle of Turkey: the fog parts from here outwards. */
  const TURKEY_MIDDLE = [35.2, 39.1];
  let lastPadding = { top: 48, right: 48, bottom: 48, left: 48 };
  let hasPins = false;
  let provincesShown = false;
  /** While Turkey rises out of the fog. start is Infinity while waiting for tiles. */
  let intro = null;
  /** The framed Turkey view; zooming out and panning are kept close to it. */
  let turkeyView = null;
  /** How far past the framed view the map may zoom out (zoom levels) and pan (share of the view). */
  const ZOOM_OUT_ROOM = 0.25;
  const PAN_ROOM = 0.3;

  /** Keeps Turkey on screen: no zooming out far past it, no dragging it away. */
  function lockToTurkey() {
    if (!turkeyView) return;
    const { zoom, west, south, east, north } = turkeyView;
    const width = east - west;
    const height = north - south;
    map.setMinZoom(zoom - ZOOM_OUT_ROOM);
    map.setMaxBounds([
      [west - width * PAN_ROOM, south - height * PAN_ROOM],
      [east + width * PAN_ROOM, north + height * PAN_ROOM],
    ]);
  }

  function showProvinces(provinces) {
    if (!provinces) {
      setLabels([]);
      showCity(null);
      map.setPaintProperty("province-lines", "line-opacity", 0);
      map.setPaintProperty("province-borders", "line-opacity", 0);
      setBaseBorders(true);
      setBaseLabelsTurkeyOnly(false);
      turkeyView = null;
      map.setMinZoom(null);
      map.setMaxBounds(null);
      return;
    }
    const plates = provinces.highlighted.map((province) => province.plate);
    map.setFilter("province-lines", ["in", ["get", "plate"], ["literal", plates]]);
    map.setFilter("province-glow", ["in", ["get", "plate"], ["literal", plates]]);
    map.setFilter("province-hit", ["in", ["get", "plate"], ["literal", plates]]);
    setLabels(provinces.highlighted);
    motion = provinces.reveal;
    if (provincesShown) showCity(provinces.city || null);
    if (provincesShown) return;
    provincesShown = true;
    setBaseBorders(false);
    setBaseLabelsTurkeyOnly(true);
    if (!hasPins) {
      map.fitBounds(TURKEY_BOUNDS, { padding: lastPadding, duration: 0 });
      fitted = true;
      const view = map.getBounds();
      turkeyView = { zoom: map.getZoom(), center: map.getCenter(), west: view.getWest(), south: view.getSouth(), east: view.getEast(), north: view.getNorth() };
    }
    if (provinces.reveal) startIntro();
    else {
      map.setPaintProperty("province-names", "text-opacity-transition", { duration: 0 });
      map.setPaintProperty("province-borders", "line-opacity", 1);
      map.setPaintProperty("province-lines", "line-opacity", 1);
      revealLabels();
      lockToTurkey();
    }
  }

  /** Where each province's name goes: a point inside it, from the data. */
  const labelPoints = new Map(PROVINCES.features.map((feature) => [feature.properties.plate, feature.properties.label]));

  function setLabels(highlighted) {
    map.getSource("province-names").setData({
      type: "FeatureCollection",
      features: highlighted.flatMap((province) => {
        const point = labelPoints.get(province.plate);
        return point
          ? [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: { name: province.name.toLocaleUpperCase("tr-TR"), rank: province.rank || 0, plate: province.plate } }]
          : [];
      }),
    });
  }

  /** Once every line is drawn, the names fade in. */
  let labelsRevealed = false;
  function revealLabels() {
    labelsRevealed = true;
    if (cityPlate === null) map.setPaintProperty("province-names", "text-opacity", 1);
  }

  // A chosen city.
  /** Plate of the chosen city; null in the Turkey view. */
  let cityPlate = null;
  /** False when "Hareketi azalt" is on: the camera jumps instead of flying. */
  let motion = true;
  const FLY_MS = 2600;

  /**
   * Into a city: the fog closes over the whole map, the camera flies to where its assets
   * crowd (or to the whole province), and the assets come up above the fog with their names.
   * Back out: the fog lifts and the camera returns to Turkey.
   */
  function showCity(city) {
    const plate = city ? city.plate : null;
    const assets = {
      type: "FeatureCollection",
      features: city
        ? city.assets.map((asset) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [asset.lng, asset.lat] },
            properties: { id: asset.id, title: asset.title, category: asset.category, landmark: Boolean(asset.landmark), tier: asset.tier, cloud: cloudOf(asset.id), turn: cloudTurn(asset.id) },
          }))
        : [],
    };
    map.getSource("city-assets").setData(assets);
    map.getSource("city-fog").setData(assets);
    cityAssets = city ? city.assets : [];
    if (plate === cityPlate) return;
    cityPlate = plate;
    cityLanded = false;
    leaving = false;
    const shown = plate !== null;
    showCitySelection();
    // Lighter over the open streets, so the clouds over the assets stand out; it thins as the map
    // zooms out and is gone, the province names back, by the Turkey view.
    if (shown) wholeZoom = map.cameraForBounds(provinceBounds(plate), { padding: cityPadding() }).zoom;
    const names = labelsRevealed ? 1 : 0;
    map.setPaintProperty("province-names", "text-opacity", shown ? ["interpolate", ["linear"], ["zoom"], outerZoom() + LEAVE_ROOM, names, outerZoom() + LEAVE_ROOM + 0.75, 0] : names);
    setCityAssetsShown(false);
    const options = { padding: cityPadding(), duration: motion ? FLY_MS : 0, linear: false, essential: true };
    if (shown) {
      map.fitBounds(city.focus || provinceBounds(plate), { ...options, maxZoom: 16 });
      // The assets come up as the camera lands; from then on a new choice moves the camera.
      setTimeout(() => {
        if (cityPlate !== plate) return;
        setCityAssetsShown(true);
        cityLanded = true;
      }, motion ? FLY_MS * 0.75 : 0);
      // The flight over, the screen brings in what goes with the city (its cards).
      setTimeout(() => {
        if (cityPlate === plate) post({ type: "cityLanded", plate });
      }, motion ? FLY_MS : 0);
    } else if (turkeyView) {
      // Exactly the view the map opened on, whatever padding choosing an asset left on the camera.
      map.flyTo({ center: turkeyView.center, zoom: turkeyView.zoom, padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: options.duration, essential: true });
    }
  }

  function setCityAssetsShown(shown) {
    citySealsShown = shown;
    map.setPaintProperty("city-asset-names", "text-opacity", shown ? 1 : 0);
    map.setPaintProperty("city-asset-badges", "icon-opacity", shown ? shownFrom(DOTS_ZOOM, SEALS_ZOOM, 1) : 0);
    // The haze thins with the dots and is gone by the Turkey view.
    map.setPaintProperty("city-haze", "heatmap-opacity", shown ? shownFrom(outerZoom() + LEAVE_ROOM, wholeZoom, 1) : 0);
    // The banks thin out slowly around the seals' turn into dots, so the fog does not jump.
    map.setPaintProperty("city-clouds", "icon-opacity", shown ? shownFrom(DOTS_ZOOM - 1, SEALS_ZOOM + 0.6, DARK ? 0.7 : 0.88) : 0);
    showDots();
    haloShown = shown;
    pulse();
  }

  // Zooming out of a city: from SEALS_ZOOM out the seals turn into dots, every one of them until
  // the whole province is in view, so it shows where all its assets are. Further out the dots thin
  // out, the least known first (MapCityAsset.tier), and the fog lifts; by the Turkey view the last
  // dots are gone, and let go of there, the city closes.
  /**
   * Seals from here in, dots from DOTS_ZOOM out. The seals shrink to the dots' size by DOTS_ZOOM,
   * so in the short step between them one turns into the other in place.
   */
  const SEALS_ZOOM = 12.4;
  const DOTS_ZOOM = 12;
  /** The dots' navy rim at DOTS_ZOOM, in points. */
  const DOT_RIM = 2;
  /** Above the Turkey view, in zoom levels: the last dots and the fog are gone, and letting go leaves. */
  const LEAVE_ROOM = 2.25;
  /** However close the whole province comes to the Turkey view, the dots get this many zoom levels to thin out. */
  const MIN_THINNING = 0.8;
  /** The zoom that frames the open city's whole province. */
  let wholeZoom = DOTS_ZOOM;
  let citySealsShown = false;
  /** Set once the map has asked the screen to leave the city, until it has. */
  let leaving = false;

  /** The Turkey view's zoom; a phone's when the map never framed Turkey. */
  function outerZoom() {
    return turkeyView ? turkeyView.zoom : 5;
  }

  /** 0 at from and further out, value at to and in. */
  function shownFrom(from, to, value) {
    return ["interpolate", ["linear"], ["zoom"], from, 0, Math.max(to, from + 0.01), value];
  }

  /**
   * Between the whole province and the Turkey view the dots thin out in four even steps: the
   * zoom from which all of a tier's dots show (tier 0 at the whole province), and how far below
   * it they are gone.
   */
  function thinning() {
    const last = outerZoom() + LEAVE_ROOM;
    const whole = Math.min(Math.max(wholeZoom, last + MIN_THINNING), DOTS_ZOOM);
    const step = (whole - last) / 4;
    return { last, step, zooms: [0, 1, 2, 3].map((tier) => whole - tier * step) };
  }

  /** The lowest tier whose dots show at a zoom: they are the ones a tap may choose. */
  function tierShownAt(zoom) {
    const { step, zooms } = thinning();
    for (let tier = 0; tier < zooms.length; tier++) if (zoom >= zooms[tier] - step / 2) return tier;
    return Infinity;
  }

  /**
   * The dots' opacity by zoom: all of them down to the whole province, then each tier fades out
   * over one step, tier 3 down to the Turkey view. The chosen place stays as long as the best
   * known. Under the seals the dots stay whole: a seal fading over its dot turns into it, with
   * no moment where both show through.
   */
  function dotOpacity() {
    const tier = ["case", ["==", ["get", "id"], citySelected || ""], 3, ["get", "tier"]];
    const from = (lowest) => ["case", [">=", tier, lowest], 1, 0];
    const { last, zooms } = thinning();
    // From the Turkey view in, each step brings one more tier: 3, then 2, 1 and 0.
    const stops = [[last, 0], ...[3, 2, 1, 0].map((lowest) => [zooms[lowest], from(lowest)]), [DOTS_ZOOM, 1], [SEALS_ZOOM, 1]];
    // Stops must climb; a province as large as the screen folds its last ones together.
    const climbing = stops.filter(([zoom], i) => stops.slice(0, i).every(([before]) => before < zoom));
    return ["interpolate", ["linear"], ["zoom"], ...climbing.flat()];
  }

  function showDots() {
    const opacity = citySealsShown ? dotOpacity() : 0;
    map.setPaintProperty("city-asset-dots", "circle-opacity", opacity);
    map.setPaintProperty("city-asset-dots", "circle-stroke-opacity", opacity);
    // At DOTS_ZOOM each dot is as wide as its seal there (badgeLayout), rim and all; the landmark and the chosen one larger.
    const chosen = ["==", ["get", "id"], citySelected || ""];
    const heart = (sizes) => ["case", chosen, sizes.chosen, ["get", "landmark"], sizes.landmark, sizes.normal];
    const atDots = Object.fromEntries(Object.entries(SEALS_AT_DOTS).map(([kind, size]) => [kind, (SEAL_SIZE * size) / 2 - DOT_RIM]));
    map.setPaintProperty("city-asset-dots", "circle-radius", ["interpolate", ["linear"], ["zoom"], 7, heart({ chosen: 2.6, landmark: 2.2, normal: 1.6 }), DOTS_ZOOM, heart(atDots)]);
    map.setLayoutProperty("city-asset-dots", "circle-sort-key", ["case", chosen, 2, ["get", "landmark"], 1, [">=", ["get", "tier"], 3], 0.5, 0]);
  }

  /**
   * The chosen seal's outer ring, in points from its middle, by zoom: where the landmark's second
   * ring is drawn in its image (sealImage), at the chosen seal's size (badgeLayout), so on the
   * landmark it lies over the ring already there. A circle's stroke is drawn outside its radius.
   */
  function haloRadius(scale) {
    const inner = (SEAL_SIZE / 2 + LANDMARK_RING - 0.8) * scale;
    return ["interpolate", ["linear"], ["zoom"], DOTS_ZOOM, inner * CHOSEN_SIZES[0], 14, inner * CHOSEN_SIZES[1], 16, inner * CHOSEN_SIZES[2]];
  }

  /** The chosen seal's outer navy ring beats gently, thicker and back; still when "Hareketi azalt" is on. */
  let haloShown = false;
  let pulsing = false;
  const SEAL_PULSE_MS = 1800;
  function pulse() {
    if (!haloShown || !motion) {
      map.setPaintProperty("city-asset-halo", "circle-radius", haloRadius(1));
      map.setPaintProperty("city-asset-halo", "circle-stroke-width", 2);
      map.setPaintProperty("city-asset-halo", "circle-stroke-opacity", haloShown ? shownFrom(DOTS_ZOOM, SEALS_ZOOM, 1) : 0);
      return;
    }
    if (pulsing) return;
    pulsing = true;
    const step = (now) => {
      if (!haloShown || !motion) {
        pulsing = false;
        pulse();
        return;
      }
      const beat = 0.5 - 0.5 * Math.cos(((now % SEAL_PULSE_MS) / SEAL_PULSE_MS) * Math.PI * 2);
      map.setPaintProperty("city-asset-halo", "circle-radius", haloRadius(1 + 0.04 * beat));
      map.setPaintProperty("city-asset-halo", "circle-stroke-width", 1.4 + 1.6 * beat);
      // It goes with the seal as the seal turns into a dot.
      map.setPaintProperty("city-asset-halo", "circle-stroke-opacity", shownFrom(DOTS_ZOOM, SEALS_ZOOM, 0.55 + 0.45 * beat));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** The chosen city's assets, to find where a chosen one is. */
  let cityAssets = [];
  /** The asset chosen in the city, on the map or in the screen's cards. */
  let citySelected = null;
  /** False while the camera is still flying in. */
  let cityLanded = false;

  /** A chosen asset grows and gets a ring; once the camera has landed, it moves to it. */
  function selectCityAsset(id) {
    if (id === citySelected) return;
    citySelected = id;
    showCitySelection();
    const asset = cityAssets.find((candidate) => candidate.id === id);
    if (!asset || !cityLanded) return;
    map.easeTo({ center: [asset.lng, asset.lat], zoom: Math.max(map.getZoom(), SELECT_ZOOM), padding: cityPadding(), duration: motion ? 650 : 0, essential: true });
  }

  function showCitySelection() {
    for (const [property, value] of Object.entries(badgeLayout(citySelected))) {
      map.setLayoutProperty("city-asset-badges", property, value);
    }
    map.setFilter("city-asset-halo", ["==", ["get", "id"], citySelected || ""]);
    showDots();
    // The chosen asset's name is placed first and set in bold, further out for its larger badge.
    const chosen = ["==", ["get", "id"], citySelected || ""];
    map.setLayoutProperty("city-asset-names", "symbol-sort-key", ["case", chosen, -2, ["get", "landmark"], -1, 0]);
    map.setLayoutProperty("city-asset-names", "text-field", ["case", ["any", chosen, ["get", "landmark"]], ["format", ["get", "title"], { "text-font": ["literal", ["Noto Sans Bold"]], "font-scale": 1.1 }], ["get", "title"]]);
    map.setLayoutProperty("city-asset-names", "text-radial-offset", ["case", ["any", chosen, ["get", "landmark"]], 1.75, 1.35]);
  }

  /** The seals' sizes at DOTS_ZOOM, where they meet the dots: small enough to be one. */
  const SEALS_AT_DOTS = { normal: 0.36, landmark: 0.44, chosen: 0.5 };
  /** The chosen seal's size at DOTS_ZOOM, 14 and 16. */
  const CHOSEN_SIZES = [SEALS_AT_DOTS.chosen, 1.15, 1.4];

  /** Badge size by zoom: small while many share the screen; the landmark and the chosen one larger. */
  function badgeLayout(selectedId) {
    const chosen = ["==", ["get", "id"], selectedId || ""];
    const size = (normal, landmark, selected) => ["case", chosen, selected, ["get", "landmark"], landmark, normal];
    return {
      "icon-size": ["interpolate", ["linear"], ["zoom"], DOTS_ZOOM, size(SEALS_AT_DOTS.normal, SEALS_AT_DOTS.landmark, CHOSEN_SIZES[0]), 14, size(0.68, 1, CHOSEN_SIZES[1]), 16, size(0.9, 1.25, CHOSEN_SIZES[2])],
      // The chosen one above all, then the landmark, above the badges that share its place.
      "symbol-sort-key": ["case", chosen, 2, ["get", "landmark"], 1, 0],
    };
  }

  // The city's seals, drawn once per kind of place.
  const GLYPHS = ["worship", "tomb", "school", "trade", "water", "charity", "other"];
  /** Image pixels per screen point, so the seals stay sharp on 3x phone screens. */
  const SEAL_RATIO = 3;
  /** The seal's diameter at full size, in points, and the room around it for its glow. */
  const SEAL_SIZE = 26;
  const SEAL_ROOM = 6;
  /** A fog bank's size at zoom 15, where it is as wide as at a city's opening it should be. */
  const BANK_SIZE = 0.78;
  /** How far outside the disc the landmark's second ring is drawn, and the chosen one's beats. */
  const LANDMARK_RING = 3;
  /** The icon's size inside the disc: room between it and the ring. */
  const GLYPH_SCALE = 0.84;
  /** Names come up from this zoom; further out only the seals show. */
  const NAMES_ZOOM = 15;
  /** Choosing an asset brings the camera at least this close. */
  const SELECT_ZOOM = 15.5;

  /**
   * A locked asset: a night-blue disc in a navy ring, the kind of place drawn in gold inside and a
   * gold padlock over its lower right edge, outlined in navy so it stands out on the fog
   * (colors.seal). The landmark's ring is doubled.
   */
  function sealImage(category, landmark) {
    const side = SEAL_SIZE + SEAL_ROOM * 2;
    const canvas = document.createElement("canvas");
    canvas.width = side * SEAL_RATIO;
    canvas.height = side * SEAL_RATIO;
    const context = canvas.getContext("2d");
    context.scale(SEAL_RATIO, SEAL_RATIO);
    const middle = side / 2;
    const r = SEAL_SIZE / 2;
    const look = colors.seal;
    // The landmark's seal is ringed once more.
    if (landmark) {
      context.beginPath();
      context.arc(middle, middle, r + LANDMARK_RING, 0, Math.PI * 2);
      context.lineWidth = 1.6;
      context.strokeStyle = look.ring;
      context.stroke();
    }
    // The disc, lit from the top left, on a soft shadow.
    context.shadowColor = "rgba(0, 0, 0, " + (DARK ? 0.5 : 0.22) + ")";
    context.shadowBlur = 4;
    context.shadowOffsetY = 1.2;
    context.beginPath();
    context.arc(middle, middle, r, 0, Math.PI * 2);
    const face = context.createLinearGradient(middle - r, middle - r, middle + r, middle + r);
    face.addColorStop(0, look.from);
    face.addColorStop(1, look.to);
    context.fillStyle = face;
    context.fill();
    context.shadowColor = "transparent";
    context.lineWidth = landmark ? 2 : 1.6;
    context.strokeStyle = look.ring;
    context.beginPath();
    context.arc(middle, middle, r - 0.8, 0, Math.PI * 2);
    context.stroke();
    // The icons are drawn in a 32-point box centred on 16,16, a little smaller than that so they
    // keep clear of the ring; their cut-outs take the disc's color.
    context.save();
    context.translate(middle, middle);
    context.scale(GLYPH_SCALE, GLYPH_SCALE);
    context.translate(-16, -16);
    context.fillStyle = look.icon;
    drawGlyph(context, category, look.to);
    context.restore();
    // The padlock, over the lower right edge: a shackle and a body with a keyhole, each drawn
    // first wide in navy and then in gold, so a navy outline keeps it clear of the disc and the fog.
    const x = middle + r * 0.66;
    const y = middle + r * 0.6;
    const shackle = new Path2D();
    shackle.arc(x, y - 1.6, 2.7, Math.PI, 0);
    const body = new Path2D();
    body.roundRect(x - 4.4, y - 1.8, 8.8, 7, 1.6);
    context.lineCap = "round";
    context.strokeStyle = look.lockEdge;
    context.lineWidth = 4;
    context.stroke(shackle);
    context.lineWidth = 2.4;
    context.stroke(body);
    context.strokeStyle = look.lock;
    context.lineWidth = 1.7;
    context.stroke(shackle);
    context.fillStyle = look.lock;
    context.fill(body);
    context.fillStyle = look.lockEdge;
    context.beginPath();
    context.arc(x, y + 1.2, 1.05, 0, Math.PI * 2);
    context.fill();
    context.fillRect(x - 0.45, y + 1.2, 0.9, 2);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  /** The haze's radius in screen points by zoom. */
  const HAZE_RADIUS = [[10, 14], [11, 24], [12, 41], [13, 70], [14, 115], [15, 180], [16, 290], [17, 500], [18, 880]];
  /** How much one asset weighs in the haze at zoom 16. */
  const HAZE_WEIGHT = 0.35;

  /**
   * The haze's weight by zoom: how many assets fall within its radius on screen grows with the
   * square of the radius over the map's scale; the weight follows the other way, so the pile-up
   * is the same at every zoom as at 16.
   */
  function hazeWeights() {
    const crowd = ([zoom, radius]) => (radius * radius) / Math.pow(4, zoom);
    const at16 = crowd(HAZE_RADIUS.find(([zoom]) => zoom === 16));
    return HAZE_RADIUS.map((stop) => [stop[0], (HAZE_WEIGHT * at16) / crowd(stop)]);
  }

  /** The haze's color by how many assets crowd a spot: clear, then a light fog, never thick. */
  function hazeRamp() {
    const middle = rgb(colors.cloud.middle);
    const top = rgb(colors.cloud.top);
    const rgba = (c, a) => "rgba(" + c.map(Math.round).join(",") + "," + a + ")";
    const strong = DARK ? 0.37 : 0.53;
    return ["interpolate", ["linear"], ["heatmap-density"], 0, rgba(middle, 0), 0.15, rgba(middle, strong * 0.35), 0.5, rgba(mix(middle, top, 0.5), strong * 0.75), 1, rgba(top, strong)];
  }

  // The fog over each locked asset, drawn once per shape: spreading from the seal at the middle of
  // a box CLOUD_W by CLOUD_H points, frayed by the opening's noise; each shape from its own seed.
  const CLOUD_W = 220;
  const CLOUD_H = 150;
  const CLOUD_SHAPES = [11, 23, 37, 41, 53];
  /** Each asset's bank is also turned, by up to this many degrees either way, so no two look alike. */
  const CLOUD_TURN = 40;
  /** Fog is soft: fewer image pixels than the seals', and it is drawn faster when the map opens. */
  const CLOUD_RATIO = 2;

  /** Which bank an asset hides in, and how it is turned: the same every time, from its id. */
  function cloudOf(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(hash) % CLOUD_SHAPES.length;
  }
  function cloudTurn(id) {
    let hash = 7;
    for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
    return ((Math.abs(hash) % 1000) / 1000 - 0.5) * 2 * CLOUD_TURN;
  }

  /**
   * The fog over a locked asset: thickest at the asset itself and spreading out from it, thinning
   * as it goes. It reaches further one way than another, so it is never a circle, and away from
   * the middle the noise frays it into wisps, while the heart stays whole (colors.cloud).
   */
  let cloudNoise = null;
  function cloudImage(seed) {
    cloudNoise = cloudNoise || tileableNoise(59);
    const width = CLOUD_W * CLOUD_RATIO;
    const height = CLOUD_H * CLOUD_RATIO;
    const look = { top: rgb(colors.cloud.top), middle: rgb(colors.cloud.middle), bottom: rgb(colors.cloud.bottom) };
    const nx = seed * 3.7;
    const ny = seed * 1.3;
    /** How far the fog reaches from the asset, in points, before the noise stretches it. */
    const reach = 60;
    // How thick the fog is at a point, in points from the middle: 1 at the asset, 0 clear.
    const thickness = (x, y) => {
      const angle = Math.atan2(y, x);
      // Around the asset the reach rises and falls with the noise, read along a circle so it closes.
      const far = reach * (0.6 + 0.8 * sampleNoise(cloudNoise, nx + Math.cos(angle) * 5, ny + Math.sin(angle) * 5));
      const out = Math.hypot(x / 1.3, y) / far;
      const spread = Math.exp(-1.5 * out * out);
      // The further out, the more it frays; the heart stays whole.
      const torn = 0.7 * sampleNoise(cloudNoise, nx + 13 + x * 0.18, ny + 41 + y * 0.24) + 0.3 * sampleNoise(cloudNoise, nx + 17 + x * 0.6, ny + 29 + y * 0.8);
      const fray = smoothstep(0.15, 1, out);
      // Gone before the edge of the image, so no wisp is cut off straight.
      const edge = smoothstep(0, 20, CLOUD_W / 2 - Math.abs(x)) * smoothstep(0, 16, CLOUD_H / 2 - Math.abs(y));
      return spread * Math.max(0, 1 - fray * (0.95 - 1.2 * torn)) * edge;
    };
    const grid = new Float32Array(width * height);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) grid[py * width + px] = thickness(px / CLOUD_RATIO - CLOUD_W / 2, py / CLOUD_RATIO - CLOUD_H / 2);
    }
    const above = 4 * CLOUD_RATIO;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const here = grid[py * width + px];
        // A long, soft fade from clear to thick: fog has no edge.
        const alpha = smoothstep(0.04, 0.85, here);
        if (alpha <= 0) continue;
        // Lit from above: brighter where the fog thickens downwards, darker where it thins.
        const facing = here - (py >= above ? grid[(py - above) * width + px] : 0);
        const light = Math.min(1, Math.max(0, 0.6 + facing * 1.4));
        const color = light > 0.5 ? mix(look.middle, look.top, (light - 0.5) * 2) : mix(look.bottom, look.middle, light * 2);
        const k = (py * width + px) * 4;
        data[k] = color[0];
        data[k + 1] = color[1];
        data[k + 2] = color[2];
        data[k + 3] = 255 * alpha * 0.92;
      }
    }
    return { width, height, data };
  }

  function drawGlyph(context, category, color) {
    const shape = (points) => {
      context.beginPath();
      points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.closePath();
      context.fill();
    };
    const disc = (x, y, r, from = 0, to = Math.PI * 2) => {
      context.beginPath();
      context.arc(x, y, r, from, to);
      context.closePath();
      context.fill();
    };
    if (category === "worship") {
      // A dome on its drum and a minaret.
      disc(14.6, 17.6, 5, Math.PI, 0);
      context.fillRect(9.6, 17.6, 10, 3.6);
      context.fillRect(14.1, 11, 1, 2);
      context.fillRect(20.8, 11.2, 1.8, 10);
      shape([[20.6, 11.4], [21.7, 8.4], [22.8, 11.4]]);
    } else if (category === "tomb") {
      // A kümbet: a pointed roof over an eight-sided body, with its door.
      shape([[11.4, 14.6], [16, 7.6], [20.6, 14.6]]);
      context.fillRect(12.2, 14.6, 7.6, 7.8);
      context.fillStyle = color;
      context.fillRect(11.4, 14.2, 9.2, 1);
      disc(16, 19.2, 1.5, Math.PI, 0);
      context.fillRect(14.5, 19.2, 3, 3.2);
    } else if (category === "school") {
      // An open book.
      shape([[9, 11.2], [15.3, 12.6], [15.3, 21.8], [9, 20.4]]);
      shape([[16.7, 12.6], [23, 11.2], [23, 20.4], [16.7, 21.8]]);
    } else if (category === "trade") {
      // A han's front: a wall with a great arched gate.
      context.fillRect(9.2, 11.5, 13.6, 10.7);
      for (const x of [9.2, 12.8, 16.4, 20]) context.fillRect(x, 9.8, 2.8, 1.8);
      context.fillStyle = color;
      disc(16, 17, 2.6, Math.PI, 0);
      context.fillRect(13.4, 17, 5.2, 5.2);
    } else if (category === "water") {
      // A drop.
      context.beginPath();
      context.moveTo(16, 8.6);
      context.bezierCurveTo(16, 8.6, 21.6, 14.4, 21.6, 17.6);
      context.arc(16, 17.6, 5.6, 0, Math.PI);
      context.bezierCurveTo(10.4, 14.4, 16, 8.6, 16, 8.6);
      context.closePath();
      context.fill();
    } else if (category === "charity") {
      // A külliye: a large dome and a small one on a shared base.
      disc(18.2, 17.4, 4.6, Math.PI, 0);
      disc(11.8, 18.4, 3.2, Math.PI, 0);
      context.fillRect(8.4, 17.4, 15.2, 4.4);
      context.fillRect(17.7, 11, 1, 2.2);
    } else {
      // The eight-pointed star of the Hayrat design.
      context.save();
      context.translate(16, 16);
      for (const turn of [0, Math.PI / 4]) {
        context.rotate(turn);
        context.fillRect(-4.6, -4.6, 9.2, 9.2);
      }
      context.restore();
    }
  }

  /** Room around the framed assets, inside the screen's own panels. */
  function cityPadding() {
    return { top: lastPadding.top + 24, right: lastPadding.right + 24, bottom: lastPadding.bottom + 24, left: lastPadding.left + 24 };
  }

  function provinceBounds(plate) {
    const feature = PROVINCES.features.find((candidate) => candidate.properties.plate === plate);
    const bounds = new maplibregl.LngLatBounds();
    const visit = (coordinates) => (typeof coordinates[0] === "number" ? bounds.extend(coordinates) : coordinates.forEach(visit));
    if (feature) visit(feature.geometry.coordinates);
    return bounds;
  }

  const OWN_SOURCES = new Set(["assets", "provinces", "province-names", "city-assets", "city-fog"]);
  /** Each base label layer's own filter and text, to put back when the provinces go away. */
  const baseLabels = new Map();

  /**
   * In the Turkey view no place outside Turkey is named: every base label layer only keeps the
   * labels that lie within the country, and those use the local (Turkish) name instead of the
   * English one ("Türkiye", "İstanbul").
   */
  function setBaseLabelsTurkeyOnly(turkeyOnly) {
    const turkey = { type: "MultiPolygon", coordinates: OUTLINE.map((ring) => [ring]) };
    for (const layer of map.getStyle().layers) {
      if (layer.type !== "symbol" || OWN_SOURCES.has(layer.source)) continue;
      if (!baseLabels.has(layer.id)) baseLabels.set(layer.id, { filter: layer.filter, text: layer.layout && layer.layout["text-field"] });
      const original = baseLabels.get(layer.id);
      if (turkeyOnly) {
        map.setFilter(layer.id, original.filter ? ["all", original.filter, ["within", turkey]] : ["within", turkey]);
        if (original.text) map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:tr"], ["get", "name"], original.text]);
      } else {
        map.setFilter(layer.id, original.filter || null);
        if (original.text) map.setLayoutProperty(layer.id, "text-field", original.text);
      }
    }
  }

  /** The base style draws every province border; with ours on, only country borders stay. */
  function setBaseBorders(visible) {
    for (const layer of map.getStyle().layers) {
      if (layer["source-layer"] === "boundary" && !/country|boundary_2|disputed/.test(layer.id)) {
        map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
      }
    }
  }

  /**
   * The opening: drifting fog, Turkey's border traced in glowing gold through it, then the
   * fog breaks up from the middle of the country outwards while the camera comes down from
   * a tilted, turned view. The provinces with assets light up last, with one pulse.
   */
  function startIntro() {
    const zoom = map.getZoom();
    map.jumpTo({ zoom: zoom - 0.9, pitch: 48, bearing: -16 });
    intro = intro || newIntro();
    const begin = () => {
      if (!intro || intro.start !== Infinity) return;
      intro.start = performance.now();
      map.easeTo({ zoom, pitch: 0, bearing: 0, duration: INTRO_MS, easing: (t) => 1 - Math.pow(1 - t, 3) });
      // The provinces show as the fog parts; the ones with assets light up a moment later.
      setTimeout(() => map.setPaintProperty("province-borders", "line-opacity", 1), INTRO_MS * 0.42);
      setTimeout(() => {
        map.setPaintProperty("province-lines", "line-opacity", 1);
        map.setPaintProperty("province-glow", "line-opacity", 0.8);
        setTimeout(() => map.setPaintProperty("province-glow", "line-opacity", 0), 1000);
      }, INTRO_MS * 0.6);
      animate();
    };
    map.once("idle", begin);
    setTimeout(begin, INTRO_WAIT_MS);
    animate();
  }

  function newIntro() {
    const fog = rgb(colors.fog);
    const land = rgb(colors.land);
    const light = mix(fog, [255, 255, 255], DARK ? 0.14 : 0.55);
    return {
      start: Infinity,
      born: performance.now(),
      // A far layer, large and slow, and a near one, finer and faster: the depth of real fog.
      layers: [
        fogLayer(11, { scale: 0.55, speed: 1.6, angle: 0.4, opacity: 0.9, dark: mix(fog, land, 0.35), light }),
        fogLayer(23, { scale: 1.05, speed: 4.2, angle: 2.6, opacity: 0.8, dark: fog, light }),
      ],
    };
  }

  function fogLayer(seed, options) {
    const canvas = document.createElement("canvas");
    return { ...options, noise: tileableNoise(seed), canvas, context: canvas.getContext("2d"), image: null };
  }

  /** Repeating value noise in four octaves, 0..1, so the clouds can drift forever without a seam. */
  function tileableNoise(seed) {
    let state = seed;
    const random = () => ((state = (state * 16807) % 2147483647) / 2147483647);
    const out = new Float32Array(NOISE_SIZE * NOISE_SIZE);
    let amplitude = 1;
    for (let period = 4; period <= 32; period *= 2) {
      const lattice = Array.from({ length: period * period }, random);
      const at = (x, y) => lattice[(y % period) * period + (x % period)];
      for (let y = 0; y < NOISE_SIZE; y++) {
        const fy = (y / NOISE_SIZE) * period;
        const y0 = Math.floor(fy);
        const ty = ease(fy - y0);
        for (let x = 0; x < NOISE_SIZE; x++) {
          const fx = (x / NOISE_SIZE) * period;
          const x0 = Math.floor(fx);
          const tx = ease(fx - x0);
          const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
          const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
          out[y * NOISE_SIZE + x] += (top + (bottom - top) * ty) * amplitude;
        }
      }
      amplitude *= 0.5;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const value of out) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / (max - min);
    return out;
  }

  function ease(t) {
    return t * t * (3 - 2 * t);
  }

  function smoothstep(from, to, value) {
    return ease(Math.min(1, Math.max(0, (value - from) / (to - from))));
  }

  /** The noise between its points, wrapping around. */
  function sampleNoise(noise, u, v) {
    const x = ((u % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
    const y = ((v % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % NOISE_SIZE;
    const y1 = (y0 + 1) % NOISE_SIZE;
    const tx = x - x0;
    const ty = y - y0;
    const top = noise[y0 * NOISE_SIZE + x0] * (1 - tx) + noise[y0 * NOISE_SIZE + x1] * tx;
    const bottom = noise[y1 * NOISE_SIZE + x0] * (1 - tx) + noise[y1 * NOISE_SIZE + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  }

  function rgb(hex) {
    const value = hex.replace("#", "");
    const n = parseInt(value.length === 3 ? value.replace(/./g, "$&$&") : value.slice(0, 6), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    return a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  }

  function drawIntro(now, width, height) {
    const elapsed = intro.start === Infinity ? 0 : Math.min(1, (now - intro.start) / INTRO_MS);
    // The border is traced first, in the closed fog; the fog parts after.
    const opening = smoothstep(0.3, 1, elapsed);
    const middle = map.project(TURKEY_MIDDLE);
    // An even veil under the clouds at first, so nothing shows through before the fog parts.
    const veil = 1 - smoothstep(0.28, 0.5, elapsed);
    if (veil > 0) {
      const [r, g, b] = rgb(colors.fog);
      context.fillStyle = "rgba(" + r + "," + g + "," + b + "," + veil + ")";
      context.fillRect(0, 0, width, height);
    }
    for (const layer of intro.layers) drawFogLayer(layer, opening, now, width, height, middle);
    drawOutline(elapsed);
    if (elapsed >= 1) {
      intro = null;
      // Tied to the last frame, not a timer: the names never come before the lines.
      revealLabels();
      // The opening starts further out than the limit; the limits apply once it is over.
      lockToTurkey();
    }
  }

  /**
   * One fog layer, cut from the noise: a cell is fog where the noise is above the line that
   * rises with the progress. The line rises first in the middle of Turkey, so the fog tears
   * open there and the opening spreads outwards in wisps.
   */
  function drawFogLayer(layer, progress, now, width, height, middle) {
    const cols = FOG_CELLS;
    const rows = Math.max(1, Math.ceil((cols * height) / width));
    if (layer.canvas.width !== cols || layer.canvas.height !== rows) {
      layer.canvas.width = cols;
      layer.canvas.height = rows;
      layer.image = layer.context.createImageData(cols, rows);
    }
    const data = layer.image.data;
    const seconds = (now - intro.born) / 1000;
    const du = Math.cos(layer.angle) * layer.speed * seconds;
    const dv = Math.sin(layer.angle) * layer.speed * seconds;
    const diagonal = Math.hypot(width, height);
    const fade = 1 - smoothstep(0.82, 1, progress);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = sampleNoise(layer.noise, i * layer.scale + du, j * layer.scale + dv);
        const distance = Math.hypot(((i + 0.5) / cols) * width - middle.x, ((j + 0.5) / rows) * height - middle.y) / diagonal;
        const line = progress * 1.8 - 0.3 - distance * 0.9;
        const alpha = smoothstep(line, line + 0.25, n) * layer.opacity * fade;
        const k = (j * cols + i) * 4;
        // Thicker fog is lighter on top, like clouds catching the light.
        data[k] = layer.dark[0] + (layer.light[0] - layer.dark[0]) * n;
        data[k + 1] = layer.dark[1] + (layer.light[1] - layer.dark[1]) * n;
        data[k + 2] = layer.dark[2] + (layer.light[2] - layer.dark[2]) * n;
        data[k + 3] = 255 * alpha;
      }
    }
    layer.context.putImageData(layer.image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(layer.canvas, 0, 0, width, height);
  }

  /** Turkey's border, drawn in glowing gold through the fog, then handed over to the map. */
  function drawOutline(elapsed) {
    const traced = smoothstep(0, 0.36, elapsed);
    const alpha = 1 - smoothstep(0.66, 0.92, elapsed);
    if (traced <= 0 || alpha <= 0) return;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = colors.province;
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.shadowColor = colors.province;
    context.shadowBlur = 16;
    for (const ring of OUTLINE) {
      if (ring.length < 10) continue;
      const points = ring.map((point) => map.project(point));
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      context.setLineDash([length * traced, length + 1]);
      context.beginPath();
      points.forEach((point, i) => (i === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
      context.stroke();
    }
    context.restore();
  }

  // The network layer.
  const canvas = document.createElement("canvas");
  canvas.id = "network";
  map.getCanvasContainer().appendChild(canvas);
  const context = canvas.getContext("2d");
  const GROW_MS = 900;
  const PULSE_MS = 1800;
  const MIN_CLEARING_PX = 44;
  let network = null;
  let marks = [];
  let selected = null;
  /** When each clearing started to grow; the ones present at the start are already open. */
  const clearedAt = new Map();
  let looping = false;

  // The fog is closed from the first frame; it lifts once the provinces arrive and the tiles are drawn.
  if (OPENING && OPENING.reveal) {
    intro = newIntro();
    animate();
    // Never left closed if the provinces do not come.
    setTimeout(() => {
      if (!provincesShown) startIntro();
    }, INTRO_WAIT_MS * 2);
  }

  function showNetwork(next) {
    const now = performance.now();
    for (const clearing of next ? next.clearings : []) {
      if (!clearedAt.has(clearing.id)) clearedAt.set(clearing.id, network && next.motion ? now : -Infinity);
    }
    if (!next) clearedAt.clear();
    else for (const id of [...clearedAt.keys()]) if (!next.clearings.some((clearing) => clearing.id === id)) clearedAt.delete(id);
    network = next;
    animate();
  }

  // Redraws every frame while a clearing grows or a hint pulses.
  function animate() {
    if (looping) return;
    looping = true;
    const frame = () => {
      const now = performance.now();
      draw(now);
      const growing = network && network.clearings.some((clearing) => now - clearedAt.get(clearing.id) < GROW_MS);
      const pulsing = network && network.motion && marks.some((pin) => pin.mark === "hint");
      if (growing || pulsing || intro) requestAnimationFrame(frame);
      else looping = false;
    };
    requestAnimationFrame(frame);
  }

  /** Map meters to CSS pixels at a latitude, at the current zoom (512 px tiles). */
  function pixels(meters, lat) {
    return meters / (40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom())));
  }

  function draw(now = performance.now()) {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (network) {
      context.globalAlpha = 0.86;
      context.fillStyle = colors.fog;
      context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "destination-out";
      for (const clearing of network.clearings) {
        const k = Math.min(1, (now - clearedAt.get(clearing.id)) / GROW_MS);
        // Never smaller than a finger, so a clearing still shows when the whole city is in view.
        const radius = Math.max(MIN_CLEARING_PX, pixels(network.clearRadius, clearing.lat)) * (1 - Math.pow(1 - k, 3));
        if (radius <= 0) continue;
        const { x, y } = map.project([clearing.lng, clearing.lat]);
        const gradient = context.createRadialGradient(x, y, radius * 0.55, x, y, radius);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
      }
      context.globalCompositeOperation = "source-over";
      for (const link of network.links) drawLink(link);
    }
    for (const pin of marks) drawMark(pin, now);
    if (intro) drawIntro(now, width, height);
  }

  function drawLink(link) {
    const a = map.project([link.from.lng, link.from.lat]);
    const b = map.project([link.to.lng, link.to.lat]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    context.strokeStyle = link.color;
    context.lineWidth = link.dashed ? 2 : 3;
    context.lineCap = "round";
    context.setLineDash(link.dashed ? [6, 6] : []);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.quadraticCurveTo((a.x + b.x) / 2 - dy * 0.22, (a.y + b.y) / 2 + dx * 0.22, b.x, b.y);
    context.stroke();
    context.setLineDash([]);
  }

  function drawMark(pin, now) {
    const { x, y } = map.project([pin.lng, pin.lat]);
    const big = pin.id === selected;
    if (pin.mark === "found") {
      // The eight-pointed star: two squares, one turned 45°.
      const half = big ? 9 : 7.5;
      context.fillStyle = colors.mark;
      context.strokeStyle = colors.label;
      context.lineWidth = 1.5;
      for (const turn of [0, Math.PI / 4]) {
        context.save();
        context.translate(x, y);
        context.rotate(turn);
        context.fillRect(-half, -half, half * 2, half * 2);
        context.restore();
      }
      drawLabel(pin.title, x, y + half + 6);
      return;
    }
    if (network && network.motion) {
      const k = (now % PULSE_MS) / PULSE_MS;
      context.strokeStyle = colors.mark;
      context.globalAlpha = 0.6 * (1 - k);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 13 * (1 + k), 0, 2 * Math.PI);
      context.stroke();
      context.globalAlpha = 1;
    }
    context.fillStyle = colors.fog;
    context.strokeStyle = colors.mark;
    context.lineWidth = big ? 3 : 2;
    context.beginPath();
    context.arc(x, y, big ? 15 : 13, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
    context.fillStyle = colors.markText;
    context.font = "700 14px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("?", x, y + 1);
  }

  function drawLabel(text, x, top) {
    context.font = "600 12px sans-serif";
    const width = Math.min(160, context.measureText(text).width) + 12;
    context.fillStyle = colors.label;
    context.beginPath();
    context.roundRect(x - width / 2, top, width, 20, 6);
    context.fill();
    context.fillStyle = colors.labelText;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, top + 10, 148);
  }

  /** The marked pin under a tap, if any: a 22 px radius, near a 44 px target. */
  function markAt(point) {
    let best = null;
    let bestDistance = 22;
    for (const pin of marks) {
      const { x, y } = map.project([pin.lng, pin.lat]);
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance < bestDistance) {
        best = pin;
        bestDistance = distance;
      }
    }
    return best;
  }

  map.on("render", () => draw());

  actions.showPins = showPins;
  actions.select = select;
  actions.showNetwork = showNetwork;
  actions.showProvinces = showProvinces;
}
</script>
</body>
</html>`;
}

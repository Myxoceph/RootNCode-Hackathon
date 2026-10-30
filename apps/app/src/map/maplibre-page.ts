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
}

/** Messages the map page posts to the app. */
export type MapPageEvent = { type: "ready" } | { type: "select"; id: string | null } | { type: "error"; message: string };

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
    if (command.type === "pins") actions.showPins(command.pins, command.padding);
    if (command.type === "select") actions.select(command.id);
    if (command.type === "network") actions.showNetwork(command.network);
    if (command.type === "provinces") actions.showProvinces(command.provinces);
  },
};

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

    map.on("click", "clusters", async (event) => {
      const feature = event.features[0];
      const zoom = await map.getSource("assets").getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
    map.on("click", (event) => {
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
    setLabels(provinces.highlighted);
    if (provincesShown) return;
    provincesShown = true;
    setBaseBorders(false);
    setBaseLabelsTurkeyOnly(true);
    if (!hasPins) {
      map.fitBounds(TURKEY_BOUNDS, { padding: lastPadding, duration: 0 });
      fitted = true;
      const view = map.getBounds();
      turkeyView = { zoom: map.getZoom(), west: view.getWest(), south: view.getSouth(), east: view.getEast(), north: view.getNorth() };
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
          ? [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: { name: province.name.toLocaleUpperCase("tr-TR"), rank: province.rank || 0 } }]
          : [];
      }),
    });
  }

  /** Once every line is drawn, the names fade in. */
  function revealLabels() {
    map.setPaintProperty("province-names", "text-opacity", 1);
  }

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
      if (layer.type !== "symbol" || layer.source === "provinces" || layer.id === "province-names" || layer.id === "cluster-count") continue;
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

import turkeyOutline from "./turkey-outline.json";
import turkeyProvinces from "./turkey-provinces.json";
import type { MapNetwork, MapPadding, MapPin, MapProvinces, MapSpots } from "./types";

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
  /** "Kilidini aç" over the chosen locked asset was tapped. */
  | { type: "unlock"; id: string }
  | { type: "sceneEnd" }
  /** "Not bırak" over an unlocked asset was tapped. */
  | { type: "note"; id: string }
  /** "İncele" over an unlocked asset was tapped. */
  | { type: "inspect"; id: string }
  /** "İlişkili eser listesini incele" beside "Kapat" was tapped. */
  | { type: "relatedList"; id: string }
  /** While asked (watchSpots): where the chosen asset and "Kilidini aç" are on screen, in pixels from the map's top left. */
  | { type: "spots"; spots: MapSpots }
  | { type: "error"; message: string };

/** Messages the app sends to the map page. */
export type MapPageCommand =
  | { type: "pins"; pins: MapPin[]; padding: MapPadding }
  | { type: "select"; id: string | null }
  | { type: "network"; network: MapNetwork | null }
  | { type: "provinces"; provinces: MapProvinces | null }
  | { type: "watchSpots"; on: boolean }
  /** The map tour's "Düğmeye dokun": "Kilidini aç" stands over the chosen asset however it was chosen (a card too). */
  | { type: "offerUnlock"; on: boolean }
  /** The app's language changed: the page's own words follow, the map stays as it is. */
  | { type: "words"; words: MapPageWords }
  /** "Büyük metin": the page's buttons and the names on the map grow by this much. */
  | { type: "textScale"; scale: number };

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
/** The page's own words, in the app's language (`map.page` in @/i18n/messages). */
export interface MapPageWords {
  sources: string;
  unlocked: string;
  unlock: string;
  /** Read after the asset's name on "Kilidini aç". */
  unlockLabel: string;
  related: string;
  note: string;
  inspect: string;
  close: string;
  relatedList: string;
}

export function mapPageHtml({
  scheme,
  colors,
  words,
  maplibre,
  opening = null,
}: {
  scheme: "light" | "dark";
  colors: MapPageColors;
  words: MapPageWords;
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
  .maplibregl-ctrl-top-right { transition: top 0.3s ease; }
  /* The credits: a faint (i) over the night map until it is tapped. */
  body:not(.credits-open) .maplibregl-ctrl-attrib-inner { display: none; }
  body:not(.credits-open) .maplibregl-ctrl-attrib.maplibregl-compact { padding: 0; background: rgba(255, 255, 255, 0.08); }
  body:not(.credits-open) .maplibregl-ctrl-attrib-button { background-color: transparent; filter: invert(1); opacity: 0.45; }
  #network { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  /* "Kilidini aç" over the chosen locked seal: white with night-blue words, pointing down at it. */
  .unlock {
    position: relative; display: flex; align-items: center; gap: 6px; height: calc(36px * var(--text, 1)); padding: 0 14px 0 11px;
    border: 1px solid rgba(10, 20, 40, 0.12); border-radius: 18px; background: #fff; color: ${colors.seal.lockEdge};
    font: 600 calc(14px * var(--text, 1))/1 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; white-space: nowrap;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); cursor: pointer; transform-origin: 50% 100%; -webkit-tap-highlight-color: transparent;
  }
  .unlock::after {
    content: ""; position: absolute; left: 50%; bottom: -6px; width: 10px; height: 10px; margin-left: -6px;
    background: #fff; border: solid rgba(10, 20, 40, 0.12); border-width: 0 1px 1px 0; transform: rotate(45deg);
  }
  .unlock:active { filter: brightness(0.92); }
  .unlock.pop { animation: unlock-pop 0.38s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
  /* Three branches out of the asset; the marker has no size of its own, its parts stand around its middle (layoutOpenActions). */
  .open-actions { position: relative; width: 0; height: 0; pointer-events: none; }
  .open-actions > svg { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
  .open-actions line { stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 1; }
  .open-actions line[hidden] { display: none; }
  .open-actions button { position: absolute; pointer-events: auto; transform: translate(var(--ex), var(--ey)); }
  .open-actions.pop line { animation: branch-grow 0.28s var(--wait) ease-out both; }
  .open-actions.pop button { animation: branch-out 0.36s var(--wait) cubic-bezier(0.2, 1.3, 0.4, 1) both; }
  @keyframes branch-grow { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes branch-out { from { opacity: 0; transform: translate(calc(var(--ex) + var(--dx)), calc(var(--ey) + var(--dy))) scale(0.4); } to { opacity: 1; transform: translate(var(--ex), var(--ey)); } }
  .open-actions button, .related-bar button {
    display: flex; align-items: center; gap: 6px; height: calc(34px * var(--text, 1)); padding: 0 11px 0 5px;
    border: 1px solid rgba(10, 20, 40, 0.12); border-radius: 17px; background: #fff; color: ${colors.seal.lockEdge};
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    font: 600 calc(12.5px * var(--text, 1))/1 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; white-space: nowrap; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .open-actions button[hidden] { display: none; }
  .related-bar { position: fixed; left: 12px; right: 12px; z-index: 5; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .open-actions button:hover, .related-bar button:hover { background: #eef1f5; }
  .open-actions button:active, .related-bar button:active { background: #e3e7ed; }
  .related-bar button:active { transform: scale(0.97); }
  .option-icon { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 12px; background: ${colors.seal.lock}; }
  @keyframes unlock-pop { from { opacity: 0; transform: translateY(8px) scale(0.7); } to { opacity: 1; transform: none; } }
  /*
   * An asset just unlocked (playOpened): the seal rises as a medallion, a gold ring fills, and at 1.25 s
   * the padlock snaps: fog blown off, shockwaves on the ground, light, sparks, the medallion spinning to
   * its open face, the name, then it lands. Only transform and opacity, so it holds up on a phone.
   */
  .scene, .scene * { pointer-events: none; }
  .maplibregl-ctrl { transition: opacity 0.2s ease; }
  body.scene-on .maplibregl-ctrl { opacity: 0; pointer-events: none; }
  .scene { width: 0; height: 0; }
  .scene i { position: absolute; display: block; }
  .scene-veil {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at var(--cx, 50%) var(--cy, 45%), rgba(4, 7, 14, 0.62), rgba(4, 7, 14, 0.94) 330px);
    animation: scene-veil 3.9s linear both;
  }
  @keyframes scene-veil { 0% { opacity: 0; } 12% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
  #map.scene-shake { animation: scene-shake 0.46s 1.25s linear both; }
  @keyframes scene-shake {
    0%, 100% { transform: none; }
    15% { transform: scale(1.018) translate(-5px, 3px); }
    35% { transform: scale(1.014) translate(4px, -4px); }
    55% { transform: scale(1.01) translate(-3px, -2px); }
    78% { transform: scale(1.005) translate(2px, 1px); }
  }
  .scene-shadow {
    left: -58px; top: -20px; width: 116px; height: 40px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0) 70%);
    animation: scene-shadow 3.6s linear both;
  }
  @keyframes scene-shadow { 0% { opacity: 0; transform: scale(0.3); } 18%, 84% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.3); } }
  .scene-pillar {
    /* Reaches past the asset and fades there: a gradient alone would end in a straight line at its foot. */
    left: -80px; bottom: -90px; width: 160px; height: 650px; transform-origin: 50% calc(100% - 90px);
    background: radial-gradient(ellipse 50% 100% at 50% 100%, rgba(255, 238, 190, 0.9), rgba(231, 194, 106, 0.32) 42%, rgba(231, 194, 106, 0) 74%);
    -webkit-mask-image: linear-gradient(to top, transparent, #000 130px);
    mask-image: linear-gradient(to top, transparent, #000 130px);
    animation: scene-pillar 1.5s 1.25s cubic-bezier(0.15, 0.8, 0.3, 1) both;
  }
  @keyframes scene-pillar { 0% { opacity: 0; transform: scaleX(0.25) scaleY(0.1); } 12% { opacity: 1; } 45% { opacity: 0.8; transform: scaleX(1) scaleY(1); } 100% { opacity: 0; transform: scaleX(0.55) scaleY(1.12); } }
  .scene-coin {
    left: -62px; top: -62px; width: 124px; height: 124px; perspective: 620px;
    animation: scene-coin 3.6s linear both;
  }
  @keyframes scene-coin {
    0% { transform: translateY(0) scale(var(--end)); animation-timing-function: cubic-bezier(0.2, 1.3, 0.4, 1); }
    20% { transform: translateY(-96px) scale(1); }
    34.7% { transform: translateY(-96px) scale(0.9); animation-timing-function: cubic-bezier(0.1, 1.9, 0.4, 1); }
    42% { transform: translateY(-110px) scale(1.2); }
    84% { transform: translateY(-104px) scale(1); animation-timing-function: cubic-bezier(0.6, 0, 0.9, 0.4); }
    96% { transform: translateY(0) scale(var(--end)); animation-timing-function: ease-out; }
    98% { transform: translateY(-7px) scale(var(--end)); animation-timing-function: ease-in; }
    100% { transform: translateY(0) scale(var(--end)); }
  }
  .scene-backlight {
    left: -46px; top: -46px; width: 216px; height: 216px; border-radius: 50%;
    background: radial-gradient(circle, rgba(246, 223, 164, 0.6), rgba(231, 194, 106, 0.2) 45%, rgba(231, 194, 106, 0) 70%);
    animation: scene-backlight 3.1s linear both;
  }
  @keyframes scene-backlight { 0% { opacity: 0; } 18% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; } }
  .scene-flip { inset: 0; transform-style: preserve-3d; animation: scene-flip 1.25s 1.25s cubic-bezier(0.12, 0.75, 0.25, 1) both; }
  @keyframes scene-flip { from { transform: rotateY(0); } to { transform: rotateY(1260deg); } }
  .scene-face { position: absolute; inset: 0; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .scene-face.open { transform: rotateY(180deg); }
  .scene-aura {
    left: -60%; top: -60%; width: 220%; height: 220%; border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 233, 176, 0.75), rgba(231, 194, 106, 0.22) 42%, rgba(231, 194, 106, 0) 68%);
    animation: scene-aura 2s 1.25s ease-out both;
  }
  @keyframes scene-aura { 0% { opacity: 0; transform: scale(0.5); } 12% { opacity: 1; transform: scale(1.15); } 80% { opacity: 0.7; transform: scale(1); } 100% { opacity: 0; transform: scale(0.8); } }
  .scene-arc { position: absolute; left: -14px; top: -14px; width: 152px; height: 152px; transform: rotate(-90deg); animation: scene-arc-out 0.25s 1.25s ease-out both; }
  .scene-arc circle { fill: none; stroke: ${colors.seal.lock}; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 440; animation: scene-arc 0.72s 0.53s cubic-bezier(0.5, 0, 0.2, 1) both; }
  @keyframes scene-arc { from { stroke-dashoffset: 440; } to { stroke-dashoffset: 0; } }
  @keyframes scene-arc-out { to { opacity: 0; transform: rotate(-90deg) scale(1.7); } }
  .scene-lock { position: absolute; left: 26px; top: 22px; width: 72px; height: 72px; overflow: visible; animation: scene-lock 1.9s linear both; }
  @keyframes scene-lock {
    0% { opacity: 0; transform: translate(26px, 26px) scale(0.3); animation-timing-function: cubic-bezier(0.2, 1.6, 0.4, 1); }
    24% { opacity: 1; transform: none; }
    66% { opacity: 1; transform: none; animation-timing-function: cubic-bezier(0.1, 1.6, 0.4, 1); }
    74% { opacity: 1; transform: translateY(-14px) scale(1.34) rotate(-6deg); animation-timing-function: cubic-bezier(0.55, 0, 0.9, 0.5); }
    100% { opacity: 0; transform: translate(34px, 170px) rotate(62deg) scale(0.9); }
  }
  .scene-shackle { transform-origin: 8px 11px; animation: scene-shackle 0.3s 1.25s cubic-bezier(0.2, 2.2, 0.4, 1) both; }
  @keyframes scene-shackle { to { transform: translateY(-2.6px) rotate(-32deg); } }
  .scene-ember {
    left: 59px; top: 59px; width: 6px; height: 6px; border-radius: 3px; background: ${colors.seal.lock}; opacity: 0;
    animation: scene-ember 0.56s var(--wait) cubic-bezier(0.6, 0, 0.9, 0.5) both;
  }
  @keyframes scene-ember { 0% { opacity: 0; transform: rotate(var(--turn)) translateY(-128px) scale(0.5); } 30% { opacity: 1; } 100% { opacity: 0.9; transform: rotate(var(--turn)) translateY(-30px) scale(1.2); } }
  .scene-flash {
    left: -148px; top: -148px; width: 420px; height: 420px; border-radius: 50%; opacity: 0;
    background: radial-gradient(circle, rgba(255, 255, 255, 1), rgba(255, 236, 186, 0.6) 30%, rgba(255, 236, 186, 0) 68%);
    animation: scene-flash 0.5s 1.25s ease-out both;
  }
  @keyframes scene-flash { 0% { opacity: 0; transform: scale(0.2); } 18% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.5); } }
  .scene-spark {
    left: 62px; top: 62px; width: var(--w); height: var(--h); margin: calc(var(--h) / -2) 0 0 calc(var(--w) / -2); border-radius: 2px; background: var(--tint); opacity: 0;
    animation: scene-spark var(--life) 1.25s linear forwards;
  }
  @keyframes scene-spark {
    0% { opacity: 1; transform: translate(0, 0) rotate(0); animation-timing-function: cubic-bezier(0.08, 0.8, 0.3, 1); }
    42% { opacity: 1; transform: translate(var(--dx), var(--dy)) rotate(var(--spin)); animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.6); }
    100% { opacity: 0; transform: translate(calc(var(--dx) * 1.2), calc(var(--dy) + 210px)) rotate(calc(var(--spin) * 3)); }
  }
  .scene-wave {
    left: -60px; top: -60px; width: 120px; height: 120px; box-sizing: border-box; border-radius: 50%;
    border: 5px solid ${colors.seal.lock}; opacity: 0;
    animation: scene-wave 1.3s var(--wait) cubic-bezier(0.12, 0.7, 0.3, 1) forwards;
  }
  @keyframes scene-wave { 0% { opacity: 0.95; transform: scale(0.3); } 100% { opacity: 0; transform: scale(var(--far)); } }
  .scene-puff {
    left: -95px; top: -95px; width: 190px; height: 190px; border-radius: 50%; opacity: 0;
    background: radial-gradient(circle, var(--fog), rgba(0, 0, 0, 0) 68%);
    animation: scene-puff 1.5s 1.25s cubic-bezier(0.1, 0.75, 0.3, 1) forwards;
  }
  @keyframes scene-puff {
    0% { opacity: 0.95; transform: rotate(var(--turn)) translateY(-30px) scale(0.75); }
    100% { opacity: 0; transform: rotate(var(--turn)) translateY(var(--reach)) scale(1.9); }
  }
  .scene-glint-ring {
    left: -26px; top: -26px; width: 52px; height: 52px; box-sizing: border-box; border-radius: 50%; border: 2.5px solid ${colors.seal.lock}; opacity: 0;
    animation: scene-glint-ring 0.8s var(--wait) ease-out forwards;
  }
  @keyframes scene-glint-ring { 0% { opacity: 1; transform: scale(0.45); } 100% { opacity: 0; transform: scale(1.5); } }
  .scene-glint-star {
    left: -11px; top: -11px; width: 22px; height: 22px; opacity: 0;
    background: conic-gradient(from 0deg, #fff 0 2%, rgba(255, 255, 255, 0) 8% 23%, #fff 25% 27%, rgba(255, 255, 255, 0) 33% 48%, #fff 50% 52%, rgba(255, 255, 255, 0) 58% 73%, #fff 75% 77%, rgba(255, 255, 255, 0) 83% 98%, #fff 100%);
    border-radius: 50%; animation: scene-glint-star 0.6s var(--wait) ease-out both;
  }
  @keyframes scene-glint-star { 0% { opacity: 0; transform: scale(0.2) rotate(0); } 35% { opacity: 1; transform: scale(1.25) rotate(40deg); } 100% { opacity: 0; transform: scale(0.3) rotate(90deg); } }
  .scene-title {
    position: fixed; left: 20px; right: 20px; z-index: 6; pointer-events: none; text-align: center; text-wrap: balance;
    animation: scene-title-out 0.45s 3.25s ease-in both;
  }
  @keyframes scene-title-out { to { opacity: 0; transform: translateY(-10px); } }
  .scene-found {
    display: block; margin-bottom: 7px; color: ${colors.seal.lock}; letter-spacing: 3.5px;
    font: 700 calc(12px * var(--text, 1))/1.2 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
    animation: scene-found 0.5s 1.55s cubic-bezier(0.2, 1, 0.4, 1) both;
  }
  @keyframes scene-found { from { opacity: 0; letter-spacing: 12px; } to { opacity: 1; letter-spacing: 3.5px; } }
  .scene-name { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; font-weight: 700; color: #fff; }
  .scene-word { display: inline-block; animation: scene-word 0.5s var(--wait) cubic-bezier(0.2, 1.5, 0.4, 1) both; }
  @keyframes scene-word { from { opacity: 0; transform: translateY(16px) scale(0.85); } to { opacity: 1; transform: none; } }
</style>
</head>
<body>
<div id="map"></div>
<script>${maplibre.script}</script>
<script>
  /** Replaced by a "words" command when the app's language changes, without reloading the page. */
  let WORDS = ${JSON.stringify(words).replace(/</g, "\\u003c")};
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

/** "Büyük metin", sent by the app: the size of every word the page draws is multiplied by it. */
let TEXT_SCALE = 1;
/** A text size for a names layer, at the current scale; a zoom curve has each of its sizes scaled. */
function named(id, size) {
  TEXT_LAYERS[id] = size;
  return textSize(size);
}
function textSize(size) {
  if (typeof size === "number") return size * TEXT_SCALE;
  return size.map((part, index) => (index > 3 && index % 2 === 0 && typeof part === "number" ? part * TEXT_SCALE : part));
}
/** The names layers and their sizes at scale 1, so a new scale can be set on them. */
const TEXT_LAYERS = {};
function applyTextScale() {
  document.documentElement.style.setProperty("--text", String(TEXT_SCALE));
  if (!actions.map) return;
  for (const id of Object.keys(TEXT_LAYERS)) {
    try {
      if (actions.map.getLayer(id)) actions.map.setLayoutProperty(id, "text-size", textSize(TEXT_LAYERS[id]));
    } catch {
      // The style is still loading; the layer takes the scale when it is added.
    }
  }
}

window.vagabondsMap = {
  receive(command) {
    if (command.type === "textScale") {
      TEXT_SCALE = command.scale;
      applyTextScale();
      return;
    }
    if (command.type === "words") {
      WORDS = command.words;
      document.querySelector(".maplibregl-ctrl-attrib-button")?.setAttribute("aria-label", WORDS.sources);
      return;
    }
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
      if (command.type === "watchSpots") actions.watchSpots(command.on);
      if (command.type === "offerUnlock") actions.offerUnlock(command.on);
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
    // The credits go top right, under the screen's search bar (placeCredits).
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
  window.vagabondsMap.map = map;
  map.on("error", (event) => post({ type: "error", message: String(event.error && event.error.message || event.error) }));
  // The base style asks for a few pattern images it does not ship; an empty one keeps the console quiet.
  map.on("styleimagemissing", (event) => map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) }));
  // The credits the tiles and OpenStreetMap ask for stay one tap away behind a faint (i): the page's
  // style keeps them folded until the button is tapped (credits-open), so they never flash open first.
  const foldCredits = () => {
    document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    document.querySelector(".maplibregl-ctrl-attrib-button")?.setAttribute("aria-label", WORDS.sources);
  };
  map.once("load", foldCredits);
  map.once("idle", foldCredits);
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".maplibregl-ctrl-attrib-button")) return;
    // After MapLibre's own toggle, follow it.
    setTimeout(() => {
      const shown = document.querySelector(".maplibregl-ctrl-attrib")?.classList.contains("maplibregl-compact-show");
      document.body.classList.toggle("credits-open", Boolean(shown));
    });
  });

  /**
   * The (i) sits just under the screen's search bar, at the right: the top of the padding the screen
   * asks for is where its bar ends, plus a little room. Opened, the credits unfold leftwards from there.
   */
  function placeCredits() {
    const corner = document.querySelector(".maplibregl-ctrl-top-right");
    if (!corner) return;
    corner.style.top = Math.max(0, lastPadding.top - 14) + "px";
    // In line with the bar's right edge (16 from the screen's), the control's own 10 margin taken off.
    corner.style.right = "6px";
  }

  /**
   * The seals' and the fog banks' pictures: together long enough to stop the opening's fog for a
   * moment, and needed only once a city is open. So they are drawn after the opening, a few
   * milliseconds a frame (a fog bank is worked out pixel by pixel, in steps); one asked for before
   * its turn is finished at once (styleimagemissing). Each job gives steps that end in the picture.
   */
  const pictureJobs = new Map();
  /** The picture being drawn a step at a time. */
  let drawing = null;
  /** A few milliseconds a frame: the frame stays well under the 16 of a smooth 60 a second. */
  const PICTURE_BUDGET_MS = 6;
  function finishPicture(id, steps, ratio) {
    let step = steps.next();
    while (!step.done) step = steps.next();
    if (!map.hasImage(id)) map.addImage(id, step.value, { pixelRatio: ratio });
  }
  function addPicture(id) {
    const job = pictureJobs.get(id);
    if (!job) return;
    pictureJobs.delete(id);
    const steps = drawing && drawing.id === id ? drawing.steps : job.steps();
    if (drawing && drawing.id === id) drawing = null;
    finishPicture(id, steps, job.ratio);
  }
  let picturesStarted = false;
  function drawPicturesLater() {
    if (picturesStarted) return;
    picturesStarted = true;
    const frame = () => {
      const until = performance.now() + PICTURE_BUDGET_MS;
      while (performance.now() < until) {
        if (!drawing) {
          const id = pictureJobs.keys().next().value;
          if (id === undefined) return;
          drawing = { id, steps: pictureJobs.get(id).steps(), ratio: pictureJobs.get(id).ratio };
        }
        const step = drawing.steps.next();
        if (step.done) {
          pictureJobs.delete(drawing.id);
          if (!map.hasImage(drawing.id)) map.addImage(drawing.id, step.value, { pixelRatio: drawing.ratio });
          drawing = null;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  /** Steps for a picture drawn in one go. */
  function* atOnce(draw) {
    return draw();
  }
  map.on("styleimagemissing", (event) => addPicture(event.id));

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
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": named("cluster-count", 13) },
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
          "text-size": named("province-names", ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 13]),
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
      pictureJobs.set("seal-" + category, { steps: () => atOnce(() => sealImage(category, false)), ratio: SEAL_RATIO });
      pictureJobs.set("seal-" + category + "-landmark", { steps: () => atOnce(() => sealImage(category, true)), ratio: SEAL_RATIO });
      // An unlocked asset's seal: the same, without the padlock.
      pictureJobs.set("seal-" + category + "-open", { steps: () => atOnce(() => sealImage(category, false, false)), ratio: SEAL_RATIO });
      pictureJobs.set("seal-" + category + "-landmark-open", { steps: () => atOnce(() => sealImage(category, true, false)), ratio: SEAL_RATIO });
    }
    // The city's fog, in two parts drawn by the map itself, so it stays fixed to the ground as the
    // map moves. Its own copy of the assets, cut into tiles no smaller than zoom 12's (about 10 km)
    // with a wide margin: the map draws a point only from the tiles on screen, and up close a fog
    // bank reaches far past its asset, so with street-sized tiles it would vanish the moment its
    // asset's tile left the screen.
    map.addSource("city-fog", { type: "geojson", data: { type: "FeatureCollection", features: [] }, maxzoom: 12, buffer: 512 });
    // The fog of assets just unlocked, while it lifts (clearBanks).
    map.addSource("city-fog-clearing", { type: "geojson", data: { type: "FeatureCollection", features: [] }, maxzoom: 12, buffer: 512 });
    const hazeShape = {
      // Wide from afar, so it covers whole districts; closer in it grows a little faster each level,
      // never by a jump, up to where it gets costly to draw.
      "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], ...HAZE_RADIUS.flat()],
      // As the map zooms out its assets close up on screen faster than the haze shrinks, so more of
      // them pile onto each spot; each weighs that much less, and the haze stays as thick at every
      // zoom instead of swelling into a glare.
      "heatmap-intensity": ["interpolate", ["exponential", 2], ["zoom"], ...hazeWeights().flat()],
      "heatmap-color": hazeRamp(),
    };
    // A light haze joins the assets into one fog over the quarters where they crowd...
    map.addLayer(CLEARING_UNDER_FOG);
    map.addLayer(CITY_SHEET);
    map.addLayer({
      id: "city-haze",
      type: "heatmap",
      source: "city-fog",
      filter: ["!=", ["get", "unlocked"], true],
      paint: { ...hazeShape, "heatmap-opacity": 0, "heatmap-opacity-transition": { duration: 1200 } },
    });
    map.addLayer({
      id: "city-haze-clearing",
      type: "heatmap",
      source: "city-fog-clearing",
      paint: { ...hazeShape, "heatmap-opacity": 0, "heatmap-opacity-transition": { duration: 0 } },
    });
    // ...and each locked asset hides in a thick bank of its own, standing out in the haze.
    for (let shape = 0; shape < CLOUD_SHAPES.length; shape++) pictureJobs.set("cloud-" + shape, { steps: () => cloudSteps(CLOUD_SHAPES[shape]), ratio: CLOUD_RATIO });
    const bankLayout = {
      "icon-image": ["concat", "cloud-", ["to-string", ["get", "cloud"]]],
      "icon-rotate": ["get", "turn"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      // The bank keeps its ground: it grows and shrinks exactly as the map does, so zooming either
      // way never thins it, piles it into a glare or changes it by a jump.
      "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 10, BANK_SIZE / 32, 20, BANK_SIZE * 32],
    };
    map.addLayer({
      id: "city-clouds",
      type: "symbol",
      source: "city-fog",
      filter: ["!=", ["get", "unlocked"], true],
      layout: bankLayout,
      paint: { "icon-opacity": 0, "icon-opacity-transition": { duration: 900 } },
    });
    map.addLayer({
      id: "city-clouds-clearing",
      type: "symbol",
      source: "city-fog-clearing",
      layout: bankLayout,
      paint: { "icon-opacity": 0, "icon-opacity-transition": { duration: 0 } },
    });
    map.addLayer(CLEARING_OVER_FOG);
    // The haze and the banks stay as layers (the unlocking still moves them), but the sheet is the fog that shows.
    for (const id of ["city-haze", "city-haze-clearing", "city-clouds", "city-clouds-clearing"]) map.setLayoutProperty(id, "visibility", "none");
    // "İlişkili eserleri gör" (showRelated): a thin bright line to each related asset and a soft glow
    // around it, over the fog and under the seals.
    const noFeatures = { type: "FeatureCollection", features: [] };
    map.addSource("city-links", { type: "geojson", data: noFeatures, lineMetrics: true });
    map.addSource("city-related", { type: "geojson", data: noFeatures });
    const linkLayout = { "line-cap": "round", "line-join": "round" };
    map.addLayer({ id: "city-links-glow", type: "line", source: "city-links", layout: linkLayout, paint: { "line-width": 7, "line-blur": 6, "line-opacity": 0.55, "line-gradient": linkGradient(0) } });
    map.addLayer({ id: "city-links-core", type: "line", source: "city-links", layout: linkLayout, paint: { "line-width": 1.5, "line-gradient": linkGradient(0) } });
    map.addLayer({
      id: "city-related-glow",
      type: "circle",
      source: "city-related",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], DOTS_ZOOM, 14, 16, 34], "circle-blur": 1, "circle-color": colors.seal.lock, "circle-opacity": 0, "circle-opacity-transition": { duration: 500 } },
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
        "text-size": named("city-asset-names", 12),
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
        "icon-image": ["concat", "seal-", ["get", "category"], ["case", ["get", "landmark"], "-landmark", ""], ["case", ["get", "unlocked"], "-open", ""]],
        "icon-allow-overlap": true,
        // The names keep clear of city-asset-room instead.
        "icon-ignore-placement": true,
        ...badgeLayout(null),
      },
      paint: { "icon-opacity": 0, "icon-opacity-transition": { duration: 700 } },
    });
    map.addLayer({
      id: "city-related-names",
      type: "symbol",
      source: "city-related",
      layout: { "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"], "text-size": named("city-related-names", 12), "text-max-width": 9, "text-line-height": 1.15, "text-variable-anchor": ["top", "bottom", "left", "right"], "text-radial-offset": 1.1, "text-padding": 2 },
      paint: { "text-color": "#fff", "text-halo-color": "rgba(13, 20, 34, 0.9)", "text-halo-width": 1.4 },
    });

    map.on("click", "clusters", async (event) => {
      if (flying) return;
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
    /**
     * The seal a tap meant. Seals can stand on top of each other (two assets at the same point): the chosen
     * one wins first, so a tap on the seal the map tour points at is never taken by the one under it; once
     * it is tapped, the next tap there goes to the other. Otherwise the closest to the tap.
     */
    function sealAt(point, features) {
      const ids = new Set(features.map((feature) => feature.properties.id));
      const chosen = features.find((feature) => feature.properties.id === citySelected);
      if (chosen && tappedAsset !== citySelected) return chosen;
      const others = ids.size > 1 && chosen ? features.filter((feature) => feature.properties.id !== citySelected) : features;
      return nearest(point, others);
    }

    /** Of the features near a tap, the one closest to it: dots far out sit almost on each other. */
    function nearest(point, features) {
      const away = (feature) => map.project(feature.geometry.coordinates).dist(point);
      return features.reduce((best, feature) => (!best || away(feature) < away(best) ? feature : best), undefined);
    }
    function onTap(event) {
      if (flying) return;
      // A finger is wider than a pixel.
      const around = [[event.point.x - 12, event.point.y - 12], [event.point.x + 12, event.point.y + 12]];
      if (cityPlate !== null) {
        if (onUnlockButton(event.point)) {
          fireUnlock();
          return;
        }
        const option = openActionAt(event.point);
        if (option) {
          fireOpenAction(option);
          return;
        }
        const zoom = map.getZoom();
        const asset = zoom >= (SEALS_ZOOM + DOTS_ZOOM) / 2
          ? sealAt(event.point, map.queryRenderedFeatures(around, { layers: ["city-asset-badges"] }))
          : nearest(event.point, map.queryRenderedFeatures(around, { layers: ["city-asset-dots"] }).filter((dot) => dot.properties.id === citySelected || dot.properties.tier >= tierShownAt(zoom)));
        if (asset) {
          // Only an asset tapped on the map gets "Kilidini aç"; one chosen for the visitor does not.
          tappedAsset = asset.properties.id;
          post({ type: "select", id: asset.properties.id });
          closeRelated(asset.properties.id === (relatedShown && relatedShown.id));
          placeUnlock();
        } else if (relatedShown) {
          closeRelated(true);
        } else {
          // A tap anywhere else puts away what stands over the asset; tapping it brings that back.
          tappedAsset = null;
          placeUnlock();
        }
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
    // Without an opening the pictures start at once; with one, once it is over.
    if (!intro) drawPicturesLater();
    pending.forEach((command) => window.vagabondsMap.receive(command));
    pending = [];
  });

  function showPins(pins, padding) {
    lastPadding = padding;
    placeCredits();
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
  /** The fog lifts over this long once the tiles are drawn: short, the visitor came for the map. */
  const INTRO_MS = 3200;
  /** Turkey's border is traced through the fog over this long, finishing as the fog parts. */
  const TRACE_MS = 1500;
  /** Tiles get this long to arrive before the fog lifts anyway: the fog hides them meanwhile, so hardly a wait. */
  const INTRO_WAIT_MS = 250;
  /** How long the closed fog waits for the provinces before it opens without them. */
  const PROVINCES_WAIT_MS = 3000;
  /** Fog cells across the screen; the browser smooths them up into soft clouds. Fewer is lighter on phones. */
  const FOG_CELLS = 48;
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
    motion = provinces.motion ?? provinces.reveal;
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
    if (provinces.city) showCity(provinces.city);
  }

  /** Where each province's name goes: a point inside it, from the data. */
  const labelPoints = new Map(PROVINCES.features.map((feature) => [feature.properties.plate, feature.properties.label]));

  /** The province with the most assets and where its name sits: the map tour points at it. */
  let topProvince = null;

  function setLabels(highlighted) {
    const top = highlighted.reduce((best, province) => (labelPoints.has(province.plate) && (!best || (province.rank || 0) > (best.rank || 0)) ? province : best), null);
    topProvince = top ? { name: top.name, point: labelPoints.get(top.plate) } : null;
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
  /** The gestures turned off while the camera flies into or out of a city, so a touch neither stops it nor counts as a tap; false otherwise. */
  let flying = false;
  let flightEnds = 0;
  const HANDLERS = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate", "touchPitch"];
  /**
   * Keeps the map still under the finger for ms milliseconds: MapLibre stops a flight on the first touch,
   * so the gestures are off until it lands, then back to what they were.
   */
  function holdForFlight(ms) {
    if (ms <= 0) return;
    const ends = ++flightEnds;
    if (!flying) {
      const off = HANDLERS.filter((name) => map[name] && map[name].isEnabled());
      off.forEach((name) => map[name].disable());
      flying = off;
    }
    setTimeout(() => {
      if (ends !== flightEnds || !flying) return;
      flying.forEach((name) => map[name].enable());
      flying = false;
    }, ms);
  }

  /**
   * The city's fog: one sheet over the whole city, under the seals, drawn by the GPU at the screen's
   * own sharpness at every zoom (CITY_SHEET). It comes in two scales:
   * - the city (buildSheet, once per city, into a small texture): the whole city under it, its
   *   edge frayed past the last assets into tongues and loose patches, with wide thicker and
   *   thinner stretches from domain-warped noise;
   * - the streets (in the shader): as the map comes closer, the fog between the assets opens into
   *   thin spots and clear pockets, while around every asset it stays whole, a little thicker
   *   around the locked ones.
   * The noise is laid out in kilometres on the ground, so the fog never swims as the map zooms.
   * Unlocked assets are opened by the clearing layers on either side of it (CLEARING_UNDER_FOG,
   * CLEARING_OVER_FOG), as before.
   */
  const SHEET_PX = 512;
  const SHEET_MARGIN_KM = 3.2;
  /** How far each asset's share of the city reaches. */
  const SHEET_REACH_KM = 0.6;
  /** Around any asset the streets stay fogged this far; around a locked one the fog thickens this far. */
  const SHEET_KEEP_KM = 0.06;
  const SHEET_NEAR_KM = 0.45;
  const SHEET_FADE_MS = 1200;
  /** Sheet pixels sent to the graphics card a frame: about a megabyte, so a city's sheets go up in a few frames, none of them long. */
  const SHEET_UPLOAD_BYTES = 1 << 20;
  let sheetBuild = 0;
  let sheetShown = false;
  /** The open city's sheets as they are worked out: each one's texture's pixels and where it lies. */
  let sheets = [];
  /** Textures and buffers of sheets no longer shown, to free on the next frame. */
  let sheetsGone = [];
  let sheetLevel = 0;
  /** How far the places' pieces have faded in over the cover, 0 to 1; they come in together. */
  let placesLevel = 0;
  const PLACES_FADE_MS = 900;
  let sheetLevelAt = 0;

  function sheetNoise(seed) {
    const p = new Uint8Array(512);
    let state = seed;
    const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
    const order = [];
    for (let i = 0; i < 256; i++) order.push(i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
    for (let i = 0; i < 512; i++) p[i] = order[i & 255];
    const grad = (h, x, y) => {
      const g = h & 7;
      const u = g < 4 ? x : y;
      const v = g < 4 ? y : x;
      return (g & 1 ? -u : u) + (g & 2 ? -2 * v : 2 * v);
    };
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    return (x, y) => {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = fade(x);
      const v = fade(y);
      const A = p[X] + Y;
      const B = p[X + 1] + Y;
      return lerp(lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u), lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v) / 2.2 + 0.5;
    };
  }

  function sheetFbm(noise, x, y, octaves) {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      total += amplitude * noise(x * frequency, y * frequency);
      sum += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return total / sum;
  }

  function sheetStep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /** Stamps a soft round spot of the given reach (in pixels) into one channel, keeping the larger value. */
  function sheetStamp(pixels, width, height, channel, cx, cy, reach) {
    const span = Math.ceil(reach * 3);
    for (let y = Math.max(0, Math.floor(cy - span)); y < Math.min(height, Math.ceil(cy + span)); y++) {
      for (let x = Math.max(0, Math.floor(cx - span)); x < Math.min(width, Math.ceil(cx + span)); x++) {
        const value = Math.round(255 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * reach * reach)));
        const k = (y * width + x) * 4 + channel;
        if (value > pixels[k]) pixels[k] = value;
      }
    }
  }

  /**
   * Splits a city's assets into the places where they stand together (a town, a city's old quarter),
   * any two within this far of each other in the same place: each gets a sheet of its own, sharp
   * enough for its streets, instead of one blurred sheet across the whole province.
   */
  const SHEET_LINK_KM = 7;

  function sheetPlaces(assets) {
    const parent = assets.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    const across = Math.cos((assets[0].lat * Math.PI) / 180);
    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const km = 111.32 * Math.hypot(assets[i].lat - assets[j].lat, (assets[i].lng - assets[j].lng) * across);
        if (km < SHEET_LINK_KM) parent[root(i)] = root(j);
      }
    }
    const places = new Map();
    assets.forEach((asset, i) => {
      const key = root(i);
      if (!places.has(key)) places.set(key, []);
      places.get(key).push(asset);
    });
    return [...places.values()];
  }

  /**
   * Works out the city's sheets over a few frames, one place after another: red how thick the fog
   * is, green how light, blue how near any asset (the streets there stay fogged), alpha how near a
   * locked one.
   */
  function buildSheet(assets, plate) {
    const build = ++sheetBuild;
    sheetsGone = [...sheetsGone, ...sheets];
    sheets = [];
    sheetLevel = 0;
    placesLevel = 0;
    if (assets.length === 0) return;
    const places = sheetPlaces(assets);
    // The province's cover shows as soon as it is made: it lies over the city while the camera is
    // still high. The places' pieces join it all together, never one by one (placesLevel).
    let cover = null;
    let placePieces = places.length === 0 ? [] : null;
    const show = () => {
      if (build !== sheetBuild) return;
      sheets = [...(cover ? [cover] : []), ...(placePieces || [])];
      map.triggerRepaint();
    };
    const workers = sheetWorkers();
    if (workers) {
      const job = provinceJob(plate);
      const simple = (list) => list.map((asset) => ({ lng: asset.lng, lat: asset.lat }));
      const jobs = [{ province: true, plate, assets: simple(assets), feature: job.feature, bounds: job.bounds }, ...places.map((place) => ({ assets: simple(place) }))];
      const pieces = new Array(places.length);
      let left = places.length;
      const finish = () => {
        for (const worker of workers) {
          worker.removeEventListener("message", arrived);
          worker.removeEventListener("error", failed);
        }
      };
      const arrived = (event) => {
        if (event.data.build !== build) return;
        const piece = placedPiece(event.data.piece);
        if (event.data.index === 0) cover = piece;
        else {
          pieces[event.data.index - 1] = piece;
          if (--left === 0) placePieces = pieces;
        }
        if (cover && placePieces) finish();
        show();
      };
      // A worker that fails is not used again: this city's sheets are worked out here instead.
      const failed = () => {
        finish();
        sheetWorkersMade = null;
        if (build === sheetBuild) buildSheet(assets, plate);
      };
      for (const worker of workers) {
        worker.addEventListener("message", arrived);
        worker.addEventListener("error", failed);
      }
      // The cover to the first; the places to the rest in turn (to the first too when it is alone).
      const placeWorkers = workers.length > 1 ? workers.slice(1) : workers;
      jobs.forEach((one, index) => (index === 0 ? workers[0] : placeWorkers[(index - 1) % placeWorkers.length]).postMessage({ ...one, build, index }));
      return;
    }
    const made = [];
    const next = (index) => {
      if (build !== sheetBuild) return;
      if (index >= places.length) {
        placePieces = made;
        show();
        return;
      }
      buildPiece(places[index], plate * 13 + index, build, (piece) => {
        made.push(piece);
        next(index + 1);
      });
    };
    buildProvincePiece(plate, assets, build, (piece) => {
      cover = piece;
      show();
      next(0);
    });
  }

  /** The wide cover is drawn this many pixels across. */
  const PROVINCE_SHEET_PX = 640;
  const PROVINCE_SHEET_MARGIN_KM = 30;
  /** How far each asset's share of the wide cover reaches. */
  const PROVINCE_SHEET_REACH_KM = 5;
  /** The province size the wide cover is drawn for; others scale it. */
  const PROVINCE_SHEET_SIZE_KM = 170;

  /**
   * One wide cover over the city's assets, seen from afar: wherever they are, near or far apart,
   * one soft, unbroken fog lies over them and a few kilometres past, its edge wandering freely
   * (it does not follow the province's border); the open land with no assets stays clear. It is
   * thicker over the towns, with wide thick and thin stretches. Closer in it gives way to the
   * places' own sheets (buildPiece).
   */
  function buildProvincePiece(plate, assets, build, done) {
    const job = provinceJob(plate);
    runSliced(provincePieceSteps(plate, assets, job.feature, job.bounds), build, (piece) => done(placedPiece(piece)));
  }

  /** The province's shape and bounds, for provincePieceSteps. */
  function provinceJob(plate) {
    const feature = PROVINCES.features.find((candidate) => candidate.properties.plate === plate) || null;
    const bounds = feature ? provinceBounds(plate) : null;
    return { feature, bounds: bounds ? { west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth() } : null };
  }

  /** A piece made on its ground corners, placed for the map: its box in the map's own coordinates. */
  function placedPiece(piece) {
    const [west, north, east, south] = piece.geo;
    const northWest = maplibregl.MercatorCoordinate.fromLngLat([west, north]);
    const southEast = maplibregl.MercatorCoordinate.fromLngLat([east, south]);
    return { ...piece, texture: null, places: null, box: [northWest.x, northWest.y, southEast.x, southEast.y] };
  }

  /**
   * The workers the sheets are worked out in, built from the very functions above, so the camera's
   * flight never waits on them: the province's cover in one, the places' pieces shared among the
   * others, all at once, done by the time the camera lands. null where workers are not to be had
   * (the sheets are then worked out a few milliseconds a frame, runSliced).
   */
  let sheetWorkersMade;
  function sheetWorkers() {
    if (sheetWorkersMade !== undefined) return sheetWorkersMade;
    try {
      const constants = { PROVINCE_SHEET_PX, PROVINCE_SHEET_MARGIN_KM, PROVINCE_SHEET_REACH_KM, PROVINCE_SHEET_SIZE_KM, SHEET_PX, SHEET_MARGIN_KM, SHEET_REACH_KM, SHEET_KEEP_KM, SHEET_NEAR_KM };
      const source = [
        ...Object.entries(constants).map(([name, value]) => "const " + name + " = " + JSON.stringify(value) + ";"),
        ...[sheetNoise, sheetFbm, sheetStep, sheetStamp, provincePieceSteps, pieceSteps].map((part) => part.toString()),
        "self.onmessage = (event) => { const job = event.data; const steps = job.province ? provincePieceSteps(job.plate, job.assets, job.feature, job.bounds) : pieceSteps(job.assets); let step = steps.next(); while (!step.done) step = steps.next(); self.postMessage({ build: job.build, index: job.index, piece: step.value }, [step.value.pixels.buffer]); };",
      ].join(String.fromCharCode(10));
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      // One for the cover and up to two for the places, leaving the phone a core for the map.
      const count = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      sheetWorkersMade = Array.from({ length: count }, () => new Worker(url));
    } catch {
      sheetWorkersMade = null;
    }
    return sheetWorkersMade;
  }

  /** Work on a sheet this many milliseconds a frame, so the camera's flight stays smooth meanwhile. */
  const SHEET_BUDGET_MS = 4;

  /** Runs steps a few milliseconds a frame until they end, then hands on what they made; dropped once a newer sheet is asked for. */
  function runSliced(steps, build, done) {
    const frame = () => {
      if (build !== sheetBuild) return;
      const until = performance.now() + SHEET_BUDGET_MS;
      while (performance.now() < until) {
        const step = steps.next();
        if (step.done) {
          done(step.value);
          return;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * The steps of buildProvincePiece: a pause after every row of each pass, ending in the piece with
   * its corners on the ground (geo: west, north, east, south). Self-contained, with the province's
   * shape and bounds passed in, so the sheet worker can run it from its source (sheetWorker).
   */
  function* provincePieceSteps(plate, assets, feature, bounds) {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const asset of assets) {
      west = Math.min(west, asset.lng);
      east = Math.max(east, asset.lng);
      south = Math.min(south, asset.lat);
      north = Math.max(north, asset.lat);
    }
    if (feature && bounds) {
      west = Math.min(west, bounds.west);
      east = Math.max(east, bounds.east);
      south = Math.min(south, bounds.south);
      north = Math.max(north, bounds.north);
    }
    const middleLat = (south + north) / 2;
    const kmPerLng = 111.32 * Math.cos((middleLat * Math.PI) / 180);
    const kmPerLat = 110.574;
    // Everything below is sized for a province like Bursa's and grows or shrinks with the
    // province, so a large one (Konya) or a small one (Hatay) looks the same from afar.
    const scale = Math.min(3, Math.max(0.6, Math.max((east - west) * kmPerLng, (north - south) * kmPerLat) / PROVINCE_SHEET_SIZE_KM));
    const reachKm = PROVINCE_SHEET_REACH_KM * scale;
    west -= (PROVINCE_SHEET_MARGIN_KM * scale) / kmPerLng;
    east += (PROVINCE_SHEET_MARGIN_KM * scale) / kmPerLng;
    south -= (PROVINCE_SHEET_MARGIN_KM * scale) / kmPerLat;
    north += (PROVINCE_SHEET_MARGIN_KM * scale) / kmPerLat;
    const widthKm = (east - west) * kmPerLng;
    const heightKm = (north - south) * kmPerLat;
    const width = widthKm >= heightKm ? PROVINCE_SHEET_PX : Math.max(64, Math.round((PROVINCE_SHEET_PX * widthKm) / heightKm));
    const height = heightKm > widthKm ? PROVINCE_SHEET_PX : Math.max(64, Math.round((PROVINCE_SHEET_PX * heightKm) / widthKm));
    const kmPerPx = widthKm / width;

    // How much each spot belongs to the assets, on a coarse grid: a wide bell around every one,
    // so a lone asset gets a little fog of its own and crowded ones merge into one.
    const points = assets.map((asset) => ({ x: (asset.lng - west) * kmPerLng, y: (north - asset.lat) * kmPerLat }));
    const step = 6;
    const gridWidth = Math.ceil(width / step) + 1;
    const gridHeight = Math.ceil(height / step) + 1;
    const cover = new Float32Array(gridWidth * gridHeight);
    const crowd = new Float32Array(gridWidth * gridHeight);
    // How far the banks over the open land may wander: well around the assets, and thinly over
    // the rest of the province.
    const reach = new Float32Array(gridWidth * gridHeight);
    const wideKm = reachKm * 3;
    let most = 0;
    for (let j = 0; j < gridHeight; j++) {
      for (let i = 0; i < gridWidth; i++) {
        const x = i * step * kmPerPx;
        const y = j * step * kmPerPx;
        let sum = 0;
        let wide = 0;
        for (const point of points) {
          const away = (x - point.x) ** 2 + (y - point.y) ** 2;
          sum += Math.exp(-away / (2 * reachKm * reachKm));
          wide += Math.exp(-away / (2 * wideKm * wideKm));
        }
        cover[j * gridWidth + i] = Math.min(1, sum / 3);
        crowd[j * gridWidth + i] = sum;
        reach[j * gridWidth + i] = sheetStep(0.05, 0.6, wide / 2);
        most = Math.max(most, sum);
      }
      yield;
    }
    if (feature) {
      // The province itself, softened over several kilometres: its open land gets a light share.
      const shape = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(gridWidth, gridHeight) : document.createElement("canvas");
      shape.width = gridWidth;
      shape.height = gridHeight;
      const pen = shape.getContext("2d");
      pen.fillStyle = "#fff";
      pen.beginPath();
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const polygon of polygons) {
        for (const ring of polygon) {
          ring.forEach(([lng, lat], index) => {
            const x = ((lng - west) * kmPerLng) / (kmPerPx * step);
            const y = ((north - lat) * kmPerLat) / (kmPerPx * step);
            if (index === 0) pen.moveTo(x, y);
            else pen.lineTo(x, y);
          });
          pen.closePath();
        }
      }
      pen.fill("evenodd");
      const filled = pen.getImageData(0, 0, gridWidth, gridHeight).data;
      let own = new Float32Array(gridWidth * gridHeight);
      for (let k = 0; k < own.length; k++) own[k] = filled[k * 4 + 3] / 255;
      const blur = Math.max(1, Math.round((5 * scale) / (kmPerPx * step)));
      for (let pass = 0; pass < 2; pass++) {
        for (const across of [true, false]) {
          const out = new Float32Array(own.length);
          for (let j = 0; j < gridHeight; j++) {
            for (let i = 0; i < gridWidth; i++) {
              let sum = 0;
              let count = 0;
              for (let d = -blur; d <= blur; d++) {
                const x = across ? i + d : i;
                const y = across ? j : j + d;
                if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) continue;
                sum += own[y * gridWidth + x];
                count++;
              }
              out[j * gridWidth + i] = sum / count;
            }
            yield;
          }
          own = out;
        }
      }
      for (let k = 0; k < reach.length; k++) reach[k] = Math.max(reach[k], own[k] * 0.45);
    }
    for (let k = 0; k < crowd.length; k++) crowd[k] = Math.min(1, crowd[k] / Math.max(3, Math.min(most, 12)));
    const gridAt = (grid, x, y) => {
      const fx = x / step;
      const fy = y / step;
      const i = Math.min(gridWidth - 2, Math.floor(fx));
      const j = Math.min(gridHeight - 2, Math.floor(fy));
      const u = fx - i;
      const v = fy - j;
      const upper = grid[j * gridWidth + i] * (1 - u) + grid[j * gridWidth + i + 1] * u;
      const lower = grid[(j + 1) * gridWidth + i] * (1 - u) + grid[(j + 1) * gridWidth + i + 1] * u;
      return upper * (1 - v) + lower * v;
    };

    const n1 = sheetNoise(301 + plate);
    const n2 = sheetNoise(401 + plate);
    const n3 = sheetNoise(501 + plate);
    const n4 = sheetNoise(601 + plate);
    const n5 = sheetNoise(701 + plate);
    const pixels = new Uint8Array(width * height * 4);
    // Where the places' own sheets lie (blue): closer in, the wide cover steps back from there and
    // only keeps the land around them.
    const places = new Float32Array(width * height);
    const placeReach = SHEET_REACH_KM / kmPerPx;
    const placeSpan = Math.ceil(placeReach * 3);
    for (const point of points) {
      const cx = point.x / kmPerPx;
      const cy = point.y / kmPerPx;
      for (let y = Math.max(0, Math.floor(cy - placeSpan)); y < Math.min(height, Math.ceil(cy + placeSpan)); y++) {
        for (let x = Math.max(0, Math.floor(cx - placeSpan)); x < Math.min(width, Math.ceil(cx + placeSpan)); x++) {
          places[y * width + x] += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * placeReach * placeReach));
        }
      }
      yield;
    }
    for (let row = 0; row < height; row++) {
        for (let x = 0; x < width; x++) {
          const gx = (x * kmPerPx) / scale;
          const gy = (row * kmPerPx) / scale;
          const wx = gx + 6 * (sheetFbm(n2, gx * 0.08, gy * 0.08, 3) - 0.5);
          const wy = gy + 6 * (sheetFbm(n3, gx * 0.08 + 5.2, gy * 0.08, 3) - 0.5);
          const big = sheetFbm(n1, wx * 0.12, wy * 0.12, 4);
          const ragged = sheetFbm(n4, wx * 0.3, wy * 0.3, 3);
          const near = gridAt(cover, x, row);
          const town = gridAt(crowd, x, row);
          // One soft edge that wanders in and out with the noise; no specks, no holes.
          const assetsFog = sheetStep(0.1, 0.42, near + (big - 0.5) * 0.45 + (ragged - 0.5) * 0.25);
          // Over the land between, wide banks of fog here and open land there, whether or not
          // there are assets under them, thinning out toward the sheet's far edges.
          const land = sheetFbm(n5, wx * 0.045, wy * 0.045, 3) + (ragged - 0.5) * 0.12;
          const border = Math.min(x, width - 1 - x, row, height - 1 - row) * kmPerPx;
          const bank = sheetStep(0.46, 0.6, land) * gridAt(reach, x, row);
          const edge = Math.max(assetsFog, bank);
          const body = 0.6 + 0.4 * sheetStep(0.3, 0.7, big);
          const k = (row * width + x) * 4;
          pixels[k] = Math.round(255 * Math.min(1, edge * (body + town * 0.2)) * sheetStep(0, 4 * scale, border));
          pixels[k + 1] = Math.round(255 * Math.min(1, big + town * 0.15));
          pixels[k + 2] = Math.round(255 * Math.min(1, places[row * width + x]));
        }
      yield;
    }
    return { pixels, width, height, geo: [west, north, east, south], km: [widthKm, heightKm], seed: (plate * 11.3) % 197, province: true };
  }

  /**
   * A place's own detail, sharp enough for its streets, under the wide cover's shape: blue how near
   * any asset (right around it the streets stay fogged), alpha the wider stretch around the assets
   * that stays under fog while the clouds scatter.
   */
  function buildPiece(assets, seed, build, done) {
    runSliced(pieceSteps(assets), build, (piece) => done(placedPiece(piece)));
  }

  /** The steps of buildPiece: a pause after each asset's stamps, ending in the piece (corners as provincePieceSteps). */
  function* pieceSteps(assets) {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const asset of assets) {
      west = Math.min(west, asset.lng);
      east = Math.max(east, asset.lng);
      south = Math.min(south, asset.lat);
      north = Math.max(north, asset.lat);
    }
    const middleLat = (south + north) / 2;
    const kmPerLng = 111.32 * Math.cos((middleLat * Math.PI) / 180);
    const kmPerLat = 110.574;
    west -= SHEET_MARGIN_KM / kmPerLng;
    east += SHEET_MARGIN_KM / kmPerLng;
    south -= SHEET_MARGIN_KM / kmPerLat;
    north += SHEET_MARGIN_KM / kmPerLat;
    const widthKm = (east - west) * kmPerLng;
    const heightKm = (north - south) * kmPerLat;
    const width = widthKm >= heightKm ? SHEET_PX : Math.max(64, Math.round((SHEET_PX * widthKm) / heightKm));
    const height = heightKm > widthKm ? SHEET_PX : Math.max(64, Math.round((SHEET_PX * heightKm) / widthKm));
    const kmPerPx = widthKm / width;
    const pixels = new Uint8Array(width * height * 4);
    for (const asset of assets) {
      const x = ((asset.lng - west) * kmPerLng) / kmPerPx;
      const y = ((north - asset.lat) * kmPerLat) / kmPerPx;
      sheetStamp(pixels, width, height, 2, x, y, SHEET_KEEP_KM / kmPerPx);
      sheetStamp(pixels, width, height, 3, x, y, SHEET_NEAR_KM / kmPerPx);
      // Red: this piece's own ground, a little wider than where the wide cover hands over to it.
      sheetStamp(pixels, width, height, 0, x, y, (SHEET_REACH_KM * 1.35) / kmPerPx);
      yield;
    }
    return { pixels, width, height, geo: [west, north, east, south] };
  }

  /** How thick the sheet should be now: gone by the Turkey view, whole by the city's province. */
  function sheetTarget() {
    if (!sheetShown) return 0;
    const from = outerZoom() + LEAVE_ROOM;
    const to = Math.max(wholeZoom, from + 0.01);
    return Math.min(1, Math.max(0, (map.getZoom() - from) / (to - from)));
  }

  let sheetShared = null;

  function sheetResources(gl) {
    if (sheetShared) return sheetShared;
    const program = gl.createProgram();
    gl.attachShader(
      program,
      clearingShader(
        gl,
        gl.VERTEX_SHADER,
        "uniform mat4 matrix; attribute vec2 place; attribute vec2 corner; attribute vec2 ground; varying vec2 uv; varying vec2 merc; varying vec2 km;" +
          "void main() { uv = corner; merc = place; km = ground; gl_Position = matrix * vec4(place, 0.0, 1.0); }",
      ),
    );
    gl.attachShader(
      program,
      clearingShader(
        gl,
        gl.FRAGMENT_SHADER,
        "precision highp float; uniform sampler2D field; uniform sampler2D wideField; uniform vec4 wideBox; uniform vec2 wideSize; uniform float isPlace; uniform float placesLevel;" +
          "uniform float zoom; uniform float level; uniform vec3 top; uniform vec3 middle; uniform vec3 bottom;" +
          "varying vec2 uv; varying vec2 merc; varying vec2 km;" +
          "float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }" +
          "float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);" +
          " return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }" +
          "float fbm(vec2 p) { float t = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { t += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0; a *= 0.5; } return t / 0.9375; }" +
          // The wide cover, blended by hand: the GPU's own blending steps visibly when one texel spans a whole screen.
          "vec4 wideAt(vec2 at) { vec2 t = at * wideSize - 0.5; vec2 i = floor(t); vec2 f = fract(t); f = f * f * (3.0 - 2.0 * f);" +
          " vec4 a = texture2D(wideField, (i + vec2(0.5, 0.5)) / wideSize); vec4 b = texture2D(wideField, (i + vec2(1.5, 0.5)) / wideSize);" +
          " vec4 c = texture2D(wideField, (i + vec2(0.5, 1.5)) / wideSize); vec4 d = texture2D(wideField, (i + vec2(1.5, 1.5)) / wideSize);" +
          " return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }" +
          // How thick the fog is at a spot, from the wide cover (W) and a place's detail (L, none outside the places).
          "float fog(vec4 W, vec4 L, float scatter, float close, float puff, float fine, float street, float wisp) {" +
          // Coming in from afar the cover scatters into soft clouds with open land between; around the
          // assets it stays whole.
          " float body = smoothstep(0.46, 0.64, puff * 0.9 + fine * 0.1);" +
          " float keep = smoothstep(0.3, 0.8, L.a + (puff - 0.5) * 0.8 + (fine - 0.5) * 0.4);" +
          " float aMid = W.r * mix(1.0, max(body, keep * 0.85) * (0.94 + 0.12 * (fine - 0.5)), scatter);" +
          // Up close the streets between the assets open: thin here, gone there.
          " float open = smoothstep(0.44, 0.58, street);" +
          " float away = 1.0 - smoothstep(0.35, 0.9, L.b * (0.55 + 0.9 * wisp));" +
          " float aClose = W.r * mix(1.0, open, away) * 0.82 * (1.0 + 0.3 * (wisp - 0.65));" +
          " return clamp(mix(aMid, aClose, close) * 0.92 + L.a * 0.12 * close, 0.0, 0.9);" +
          "}" +
          "void main() {" +
          // The wide cover draws the fog everywhere, the same at every zoom; a place's piece only adds
          // what its assets keep on top of it (its detail never thins the fog), so there is no seam.
          " vec4 W = wideAt((merc - wideBox.xy) / (wideBox.zw - wideBox.xy));" +
          " vec4 L = isPlace > 0.5 ? texture2D(field, uv) : vec4(0.0);" +
          // Noise in kilometres on the ground from the city's middle, the same for every piece (worked
          // out on the CPU: from the map's own coordinates it would step in metres up close).
          " vec2 p = km;" +
          " vec2 w = vec2(noise(p * 1.7), noise(p * 1.7 + 7.3));" +
          " float street = fbm(p * 5.5 + (w - 0.5) * 2.2) * 0.6 + fbm(p * 15.0 + 3.1) * 0.4;" +
          " float wisp = fbm(p * 19.0 + street * 2.0);" +
          " float puff = fbm(p * 0.55 + vec2(noise(p * 0.3), noise(p * 0.3 + 4.1)) * 0.6);" +
          " float fine = fbm(p * 3.5 + (w - 0.5) * 0.8);" +
          " float scatter = smoothstep(11.4, 13.0, zoom);" +
          " float close = smoothstep(14.3, 15.4, zoom);" +
          " float base = fog(W, vec4(0.0), scatter, close, puff, fine, street, wisp);" +
          " float a = base;" +
          " if (isPlace > 0.5) { float whole = fog(W, L, scatter, close, puff, fine, street, wisp); a = max(0.0, whole - base) / max(0.001, 1.0 - base) * placesLevel; }" +
          " a *= level;" +
          " if (a <= 0.002) discard;" +
          " float shade = clamp(0.28 + 0.58 * W.g + 0.3 * close * (wisp - 0.5) + 0.2 * close * (street - 0.5) + 0.22 * (puff - 0.5) * scatter * (1.0 - close), 0.0, 1.0);" +
          " vec3 c = shade > 0.5 ? mix(middle, top, (shade - 0.5) * 2.0) : mix(bottom, middle, shade * 2.0);" +
          " gl_FragColor = vec4(c * a, a);" +
          "}",
      ),
    );
    gl.linkProgram(program);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const color = (hex) => rgb(hex).map((channel) => channel / 255);
    sheetShared = { program, corners, top: color(colors.cloud.top), middle: color(colors.cloud.middle), bottom: color(colors.cloud.bottom) };
    return sheetShared;
  }

  const CITY_SHEET = {
    id: "city-sheet",
    type: "custom",
    renderingMode: "2d",
    render(gl, args) {
      for (const gone of sheetsGone) {
        if (gone.texture) gl.deleteTexture(gone.texture);
        if (gone.places) gl.deleteBuffer(gone.places);
        if (gone.ground) gl.deleteBuffer(gone.ground);
      }
      sheetsGone = [];
      if (sheets.length === 0) return;
      for (const piece of sheets) {
        if (piece.texture) continue;
        piece.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, piece.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Room only: the pixels go up a band at a time below, so no frame carries a whole sheet.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, piece.width, piece.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        piece.uploaded = 0;
        const [left, upper, right, lower] = piece.box;
        piece.places = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, piece.places);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([left, upper, right, upper, left, lower, right, lower]), gl.STATIC_DRAW);
      }
      // Each frame sends up to SHEET_UPLOAD_BYTES of the sheets still going up.
      let bytesLeft = SHEET_UPLOAD_BYTES;
      gl.activeTexture(gl.TEXTURE0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      for (const piece of sheets) {
        if (bytesLeft <= 0) break;
        if (piece.uploaded >= piece.height) continue;
        const rows = Math.max(1, Math.min(Math.floor(bytesLeft / (piece.width * 4)), piece.height - piece.uploaded));
        gl.bindTexture(gl.TEXTURE_2D, piece.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, piece.uploaded, piece.width, rows, gl.RGBA, gl.UNSIGNED_BYTE, piece.pixels.subarray(piece.uploaded * piece.width * 4, (piece.uploaded + rows) * piece.width * 4));
        piece.uploaded += rows;
        bytesLeft -= rows * piece.width * 4;
      }
      if (sheets.some((piece) => piece.uploaded < piece.height)) map.triggerRepaint();
      // The cover shows once it is all up; the places' pieces once every one of them is.
      const up = (piece) => piece.uploaded >= piece.height;
      const cover = sheets.find((piece) => piece.province && up(piece)) || null;
      const placePieces = sheets.filter((piece) => !piece.province);
      const placesUp = placePieces.length > 0 && placePieces.every(up);
      // Eases toward its target thickness, so the sheet fades in and out instead of jumping.
      const now = performance.now();
      const target = cover ? sheetTarget() : 0;
      // Without motion the fog is simply there, as everything else.
      const stepBy = motion ? Math.min(1, (now - sheetLevelAt) / SHEET_FADE_MS) : 1;
      const placesBy = motion ? Math.min(1, (now - sheetLevelAt) / PLACES_FADE_MS) : 1;
      placesLevel = placesUp ? Math.min(1, placesLevel + placesBy) : 0;
      if (placesUp && placesLevel < 1) map.triggerRepaint();
      sheetLevelAt = now;
      sheetLevel = sheetLevel < target ? Math.min(target, sheetLevel + stepBy) : Math.max(target, sheetLevel - stepBy);
      if (sheetLevel !== target) map.triggerRepaint();
      if (sheetLevel <= 0) return;
      const shared = sheetResources(gl);
      gl.useProgram(shared.program);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // Mercator (0 to 1) to the screen.
      gl.uniformMatrix4fv(gl.getUniformLocation(shared.program, "matrix"), false, args.defaultProjectionData.mainMatrix);
      gl.uniform1i(gl.getUniformLocation(shared.program, "field"), 0);
      gl.uniform1i(gl.getUniformLocation(shared.program, "wideField"), 1);
      gl.uniform1f(gl.getUniformLocation(shared.program, "zoom"), map.getZoom());
      gl.uniform1f(gl.getUniformLocation(shared.program, "level"), sheetLevel);
      gl.uniform1f(gl.getUniformLocation(shared.program, "placesLevel"), placesLevel);
      gl.uniform3fv(gl.getUniformLocation(shared.program, "top"), shared.top);
      gl.uniform3fv(gl.getUniformLocation(shared.program, "middle"), shared.middle);
      gl.uniform3fv(gl.getUniformLocation(shared.program, "bottom"), shared.bottom);
      const place = gl.getAttribLocation(shared.program, "place");
      const corner = gl.getAttribLocation(shared.program, "corner");
      gl.bindBuffer(gl.ARRAY_BUFFER, shared.corners);
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(place);
      const ready = cover ? [cover, ...(placesUp ? placePieces : [])] : [];
      // The wide cover comes first and every piece reads it.
      const wide = cover;
      if (wide) {
        const [left, upper, right, lower] = wide.box;
        const middleLat = (Math.atan(Math.sinh(Math.PI * (1 - (upper + lower)))) * 180) / Math.PI;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, wide.texture);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform4f(gl.getUniformLocation(shared.program, "wideBox"), left, upper, right, lower);
        gl.uniform2f(gl.getUniformLocation(shared.program, "wideSize"), wide.width, wide.height);
        const originX = (left + right) / 2;
        const originY = (upper + lower) / 2;
        const kmPerUnit = 40075.017 * Math.cos((middleLat * Math.PI) / 180);
        const ground = gl.getAttribLocation(shared.program, "ground");
        gl.enableVertexAttribArray(ground);
        for (const piece of ready) {
          if (!piece.ground) {
            const [x0, y0, x1, y1] = piece.box;
            const local = (x, y) => [(x - originX) * kmPerUnit, (y - originY) * kmPerUnit];
            piece.ground = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, piece.ground);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...local(x0, y0), ...local(x1, y0), ...local(x0, y1), ...local(x1, y1)]), gl.STATIC_DRAW);
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, piece.ground);
          gl.vertexAttribPointer(ground, 2, gl.FLOAT, false, 0, 0);
          gl.uniform1f(gl.getUniformLocation(shared.program, "isPlace"), piece.province ? 0 : 1);
          gl.bindTexture(gl.TEXTURE_2D, piece.texture);
          gl.bindBuffer(gl.ARRAY_BUFFER, piece.places);
          gl.vertexAttribPointer(place, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.disableVertexAttribArray(ground);
      }
      gl.disableVertexAttribArray(place);
      gl.disableVertexAttribArray(corner);
    },
  };

  /**
   * Into a city: the fog closes over the whole map, the camera flies to where its assets
   * crowd (or to the whole province), and the assets come up above the fog with their names.
   * Back out: the fog lifts and the camera returns to Turkey.
   */
  function showCity(city) {
    const plate = city ? city.plate : null;
    if (plate !== cityPlate) closeRelated(false);
    const assetFeature = (asset) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [asset.lng, asset.lat] },
      properties: { id: asset.id, title: asset.title, category: asset.category, landmark: Boolean(asset.landmark), unlocked: Boolean(asset.unlocked), tier: asset.tier, cloud: cloudOf(asset.id), turn: cloudTurn(asset.id) },
    });
    const assets = { type: "FeatureCollection", features: city ? city.assets.map(assetFeature) : [] };
    const justOpened =
      city && plate === cityPlate && cityLanded && motion
        ? city.assets.filter((asset) => asset.unlocked && cityAssets.some((before) => before.id === asset.id && !before.unlocked))
        : [];
    map.getSource("city-assets").setData(assets);
    map.getSource("city-fog").setData(assets);
    cityAssets = city ? city.assets : [];
    const liftsAt = performance.now() + FOG_LIFTS_AFTER_MS;
    clearings = new Map(
      cityAssets
        .filter((asset) => asset.unlocked)
        .map((asset) => [asset.id, { lng: asset.lng, lat: asset.lat, meters: clearingMeters(asset, cityAssets), kept: keptFogAround(asset, cityAssets), opensAt: justOpened.includes(asset) ? liftsAt : (clearings.get(asset.id)?.opensAt ?? -FOG_LIFT_MS) }]),
    );
    if (plate === cityPlate) {
      // The same city again, perhaps with an asset just unlocked: its button goes, and its scene starts first, so its options wait for the end.
      if (justOpened.length > 0) {
        clearBanks(justOpened.map(assetFeature));
        playOpened(justOpened[0]);
      }
      placeUnlock();
      return;
    }
    cityPlate = plate;
    if (city) buildSheet(city.assets, plate);
    tappedAsset = null;
    cityLanded = false;
    leaving = false;
    const shown = plate !== null;
    showCitySelection();
    // Lighter over the open streets, so the clouds over the assets stand out; it thins as the map
    // zooms out and is gone, the province names back, by the Turkey view.
    if (shown) endIntroNow();
    // No camera when the screen's panels leave the map no room: the zoom it has then stands in.
    if (shown) wholeZoom = map.cameraForBounds(provinceBounds(plate), { padding: cityPadding() })?.zoom ?? map.getZoom();
    const names = labelsRevealed ? 1 : 0;
    map.setPaintProperty("province-names", "text-opacity", shown ? ["interpolate", ["linear"], ["zoom"], outerZoom() + LEAVE_ROOM, names, outerZoom() + LEAVE_ROOM + 0.75, 0] : names);
    setCityAssetsShown(false);
    const options = { padding: cityPadding(), duration: motion ? FLY_MS : 0, linear: false, essential: true };
    holdForFlight(options.duration);
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

  const BANK_OPACITY = DARK ? 0.7 : 0.88;
  /** The moment the padlock snaps open, and how long the medallion's scene runs. */
  const SNAP_MS = 1250;
  const SCENE_MS = 3900;
  /** After the turn around the asset, the camera settles and comes down onto it... */
  const ZOOM_AT_MS = SNAP_MS + 1900;
  const FOG_ZOOM_IN = 1.3;
  const FOG_ZOOM_MAX = 18;
  const FOG_ZOOM_MS = 2000;
  /** ...and only once it is there does the fog around the asset lift, slowly, to nothing. */
  const FOG_LIFTS_AFTER_MS = ZOOM_AT_MS + FOG_ZOOM_MS;
  const FOG_LIFT_MS = 3200;
  /** The whole unlocking, fog included: the asset's options come up then, and the map is the visitor's again. */
  const OPENING_MS = FOG_LIFTS_AFTER_MS + FOG_LIFT_MS;
  const SCENE_PITCH = 54;
  const SCENE_MIN_ZOOM = 15.4;
  /** The medallion's width in points, and how far its gold wave reaches on screen in a second. */
  const COIN_SIZE = 124;
  const WAVE_SPEED = 520;
  /** The medallion hovers 104 points over the asset and is 124 wide; the title stands a little above it. */
  const TITLE_ABOVE_ASSET = 104 + COIN_SIZE / 2 + 14;

  /**
   * The clearings around unlocked assets. Fog from any asset may reach them, and a map layer can only
   * add to what is under it, so the clearing is a pair of layers: the first keeps what the map looks
   * like under the fog, the second paints that back on over the fog, soft-edged.
   */
  const CLEARING_METERS = 170;
  /**
   * A clearing never reaches further than this share of the way to the nearest locked asset (nor
   * less far than the least), so a close neighbour keeps a full fog of its own around it.
   */
  const CLEARING_SHARE = 0.65;
  const CLEARING_LEAST_METERS = 50;
  /** Each locked asset near a clearing keeps its fog this far around it, or less if it stands closer. */
  const KEPT_FOG_METERS = 150;
  const KEPT_FOG_SHARE = 0.9;
  const KEPT_FOG_MAX = 12;
  let clearings = new Map();
  let clearingShared = null;

  function clearingShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function clearingResources(gl) {
    if (clearingShared) return clearingShared;
    const program = gl.createProgram();
    gl.attachShader(program, clearingShader(gl, gl.VERTEX_SHADER, "attribute vec2 corner; uniform vec4 box; void main() { gl_Position = vec4(box.xy + corner * box.zw, 0.0, 1.0); }"));
    gl.attachShader(
      program,
      clearingShader(
        gl,
        gl.FRAGMENT_SHADER,
        "precision highp float; uniform sampler2D under; uniform vec2 size; uniform vec2 middle; uniform float radius; uniform float strength; uniform vec3 kept[" + KEPT_FOG_MAX + "];" +
          "void main() { float away = distance(gl_FragCoord.xy, middle) / radius; float a = strength * (1.0 - smoothstep(0.5, 1.0, away));" +
          "for (int i = 0; i < " + KEPT_FOG_MAX + "; i++) { if (kept[i].z > 0.0) a *= smoothstep(kept[i].z * 0.45, kept[i].z, distance(gl_FragCoord.xy, kept[i].xy)); }" +
          "gl_FragColor = texture2D(under, gl_FragCoord.xy / size) * a; }",
      ),
    );
    gl.linkProgram(program);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    clearingShared = { program, texture, corners, width: 0, height: 0 };
    return clearingShared;
  }

  /** Each clearing on screen now, in the drawing buffer's pixels (its y runs upwards). */
  function clearingsOnScreen(gl) {
    if (!citySealsShown || clearings.size === 0) return [];
    const ratio = gl.drawingBufferWidth / map.getContainer().clientWidth;
    const now = performance.now();
    const shown = [];
    for (const clearing of clearings.values()) {
      const t = Math.min(1, Math.max(0, (now - clearing.opensAt) / FOG_LIFT_MS));
      if (t === 0) continue;
      const opened = t * t * (3 - 2 * t);
      const point = map.project([clearing.lng, clearing.lat]);
      const metersPerPoint = (78271.5 * Math.cos((clearing.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
      const radius = (clearing.meters / metersPerPoint) * ratio * (0.6 + 0.4 * opened);
      const x = point.x * ratio;
      const y = gl.drawingBufferHeight - point.y * ratio;
      if (x + radius < 0 || y + radius < 0 || x - radius > gl.drawingBufferWidth || y - radius > gl.drawingBufferHeight) continue;
      const kept = new Float32Array(KEPT_FOG_MAX * 3);
      clearing.kept.forEach((other, index) => {
        const at = map.project([other.lng, other.lat]);
        kept.set([at.x * ratio, gl.drawingBufferHeight - at.y * ratio, (other.meters / metersPerPoint) * ratio], index * 3);
      });
      shown.push({ x, y, radius, opened, kept });
    }
    return shown;
  }

  const CLEARING_UNDER_FOG = {
    id: "city-clearing-keep",
    type: "custom",
    renderingMode: "2d",
    render(gl) {
      const shown = clearingsOnScreen(gl);
      if (shown.length === 0) return;
      const shared = clearingResources(gl);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shared.texture);
      if (shared.width !== gl.drawingBufferWidth || shared.height !== gl.drawingBufferHeight) {
        shared.width = gl.drawingBufferWidth;
        shared.height = gl.drawingBufferHeight;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shared.width, shared.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      // Only the clearings' own squares: copying the whole screen each frame is costly on a phone.
      for (const { x, y, radius } of shown) {
        const left = Math.max(0, Math.floor(x - radius));
        const bottom = Math.max(0, Math.floor(y - radius));
        const right = Math.min(shared.width, Math.ceil(x + radius));
        const top = Math.min(shared.height, Math.ceil(y + radius));
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, left, bottom, left, bottom, right - left, top - bottom);
      }
    },
  };

  const CLEARING_OVER_FOG = {
    id: "city-clearing-paint",
    type: "custom",
    renderingMode: "2d",
    render(gl) {
      const shown = clearingsOnScreen(gl);
      if (shown.length === 0) return;
      const shared = clearingResources(gl);
      gl.useProgram(shared.program);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shared.texture);
      gl.uniform1i(gl.getUniformLocation(shared.program, "under"), 0);
      gl.uniform2f(gl.getUniformLocation(shared.program, "size"), shared.width, shared.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, shared.corners);
      const corner = gl.getAttribLocation(shared.program, "corner");
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
      for (const { x, y, radius, opened, kept } of shown) {
        gl.uniform3fv(gl.getUniformLocation(shared.program, "kept"), kept);
        gl.uniform4f(
          gl.getUniformLocation(shared.program, "box"),
          (x / shared.width) * 2 - 1,
          (y / shared.height) * 2 - 1,
          (radius / shared.width) * 2,
          (radius / shared.height) * 2,
        );
        gl.uniform2f(gl.getUniformLocation(shared.program, "middle"), x, y);
        gl.uniform1f(gl.getUniformLocation(shared.program, "radius"), radius);
        gl.uniform1f(gl.getUniformLocation(shared.program, "strength"), opened);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disableVertexAttribArray(corner);
    },
  };

  /** How far an unlocked asset's clearing reaches: less when a locked asset stands close by. */
  function clearingMeters(asset, assets) {
    const across = Math.cos((asset.lat * Math.PI) / 180);
    let nearest = Infinity;
    for (const other of assets) {
      if (other.unlocked || other.id === asset.id) continue;
      nearest = Math.min(nearest, 111320 * Math.hypot(other.lat - asset.lat, (other.lng - asset.lng) * across));
    }
    return Math.max(CLEARING_LEAST_METERS, Math.min(CLEARING_METERS, nearest * CLEARING_SHARE));
  }

  /** The locked assets whose fog a clearing must leave alone, nearest first. */
  function keptFogAround(asset, assets) {
    const across = Math.cos((asset.lat * Math.PI) / 180);
    return assets
      .filter((other) => !other.unlocked)
      .map((other) => ({ other, away: 111320 * Math.hypot(other.lat - asset.lat, (other.lng - asset.lng) * across) }))
      .filter(({ away }) => away < CLEARING_METERS + KEPT_FOG_METERS)
      .sort((a, b) => a.away - b.away)
      .slice(0, KEPT_FOG_MAX)
      // Never over the unlocked asset itself, however close the other stands.
      .map(({ other, away }) => ({ lng: other.lng, lat: other.lat, meters: Math.min(KEPT_FOG_METERS, away * KEPT_FOG_SHARE) }));
  }

  /** The fog of assets just unlocked, which the main layers have dropped, lingers over its own layers and lifts. */
  function clearBanks(features) {
    const source = map.getSource("city-fog-clearing");
    source.setData({ type: "FeatureCollection", features });
    const started = performance.now() + FOG_LIFTS_AFTER_MS;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - started) / FOG_LIFT_MS));
      const left = 1 - t * t * (3 - 2 * t);
      map.setPaintProperty("city-clouds-clearing", "icon-opacity", citySealsShown ? shownFrom(DOTS_ZOOM - 1, SEALS_ZOOM + 0.6, BANK_OPACITY * left) : 0);
      map.setPaintProperty("city-haze-clearing", "heatmap-opacity", citySealsShown ? shownFrom(outerZoom() + LEAVE_ROOM, wholeZoom, left) : 0);
      if (left > 0) requestAnimationFrame(step);
      else source.setData({ type: "FeatureCollection", features: [] });
    };
    requestAnimationFrame(step);
  }

  function sceneElement(className, vars) {
    const element = document.createElement("i");
    element.className = className;
    for (const name in vars || {}) element.style.setProperty("--" + name, vars[name]);
    return element;
  }

  /** The closed face is bare, so the medallion's one padlock stands alone on it; the open face shows the kind of place. */
  function sceneFace(asset, open) {
    const ratio = Math.ceil((COIN_SIZE * 3) / (SEAL_SIZE + SEAL_ROOM * 2));
    const image = sealImage(asset.category, Boolean(asset.landmark), false, ratio, open ? OPEN_SEAL : { ...colors.seal, ring: colors.seal.lock, blank: true });
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").putImageData(image, 0, 0);
    canvas.className = "scene-face" + (open ? " open" : "");
    return canvas;
  }

  /** The name, word by word: a word is never cut, and letters keep the font's own spacing. */
  function sceneTitle(asset, bottom) {
    const title = document.createElement("div");
    title.className = "scene-title";
    title.setAttribute("aria-hidden", "true");
    title.style.bottom = bottom + "px";
    const found = document.createElement("span");
    found.className = "scene-found";
    found.textContent = WORDS.unlocked;
    const name = document.createElement("div");
    name.className = "scene-name";
    const size = asset.title.length <= 16 ? 30 : asset.title.length <= 28 ? 25 : 21;
    name.style.fontSize = size + "px";
    name.style.lineHeight = Math.round(size * 1.2) + "px";
    asset.title.split(" ").forEach((word, index) => {
      const wordElement = document.createElement("span");
      wordElement.className = "scene-word";
      wordElement.style.setProperty("--wait", 1.7 + index * 0.11 + "s");
      wordElement.textContent = word;
      name.append(wordElement, " ");
    });
    title.append(found, name);
    return title;
  }

  /** Sparks flung out from the medallion and falling back under their own weight. */
  function addSparks(parent) {
    const tints = [colors.seal.lock, "#ffffff", "#f6dfa4", colors.seal.lock];
    for (let index = 0; index < 44; index++) {
      const turn = index * 2.399963;
      const reach = 70 + ((index * 53) % 170);
      const bar = index % 4 === 1;
      parent.appendChild(
        sceneElement("scene-spark", {
          dx: Math.cos(turn) * reach + "px",
          dy: Math.sin(turn) * reach * 0.8 - 46 + "px",
          spin: (index % 2 ? 1 : -1) * (120 + index * 9) + "deg",
          w: (bar ? 3 : 4 + (index % 5)) + "px",
          h: (bar ? 13 : 4 + (index % 5)) + "px",
          tint: tints[index % tints.length],
          life: 1.05 + (index % 6) * 0.1 + "s",
        }),
      );
    }
  }

  /** The nearest other seals catch the light as the wave reaches them. */
  function glintNeighbours(asset, addMarker) {
    const middle = map.project([asset.lng, asset.lat]);
    const scale = Math.pow(2, Math.max(map.getZoom(), SCENE_MIN_ZOOM) - map.getZoom());
    cityAssets
      .filter((other) => other.id !== asset.id)
      .map((other) => ({ other, away: map.project([other.lng, other.lat]).dist(middle) * scale }))
      .filter(({ away }) => away < 520)
      .sort((a, b) => a.away - b.away)
      .slice(0, 16)
      .forEach(({ other, away }) => {
        const element = document.createElement("div");
        element.className = "scene";
        const wait = SNAP_MS / 1000 + away / WAVE_SPEED + "s";
        element.append(sceneElement("scene-glint-ring", { wait }), sceneElement("scene-glint-star", { wait }));
        addMarker(element, other, "viewport");
      });
  }

  let scenePlaying = false;

  /**
   * The asset's unlocking, as a scene over the map: see the page's .scene styles for its beats. The
   * map under it already has the open seal; the medallion comes down onto it at the end.
   */
  function playOpened(asset) {
    if (scenePlaying) return;
    scenePlaying = true;
    // Touches wait until it is over: a tap or a drag would cut the camera's moves short.
    holdForFlight(OPENING_MS);
    closeRelated(false);
    document.body.classList.add("scene-on");
    const before = { pitch: map.getPitch(), bearing: map.getBearing() };
    const zoom = Math.max(map.getZoom(), SCENE_MIN_ZOOM);
    const markers = [];
    const addMarker = (element, at, alignment) => {
      element.setAttribute("aria-hidden", "true");
      markers.push(new maplibregl.Marker({ element, anchor: "center", pitchAlignment: alignment, rotationAlignment: alignment }).setLngLat([at.lng, at.lat]).addTo(map));
    };

    glintNeighbours(asset, addMarker);

    // On the ground: lying flat under the tilted camera.
    const ground = document.createElement("div");
    ground.className = "scene";
    const fog = "rgba(" + rgb(colors.fog).join(", ") + ", 0.95)";
    for (let index = 0; index < 18; index++) {
      ground.appendChild(sceneElement("scene-puff", { turn: index * 20 + (index % 3) * 7 + "deg", reach: -(170 + ((index * 61) % 170)) + "px", fog }));
    }
    [[1.25, 7], [1.42, 5.2], [1.62, 3.4]].forEach(([wait, far]) => ground.appendChild(sceneElement("scene-wave", { wait: wait + "s", far })));
    ground.appendChild(sceneElement("scene-shadow"));
    addMarker(ground, asset, "map");

    // Facing the camera: the light, the medallion and its padlock.
    const actors = document.createElement("div");
    actors.className = "scene";
    actors.style.setProperty("--end", String(((SEAL_SIZE + SEAL_ROOM * 2) * chosenSize(zoom)) / COIN_SIZE));
    actors.appendChild(sceneElement("scene-pillar"));
    const coin = sceneElement("scene-coin");
    coin.append(sceneElement("scene-backlight"), sceneElement("scene-aura"));
    for (let index = 0; index < 14; index++) {
      coin.appendChild(sceneElement("scene-ember", { turn: index * 25.7 + "deg", wait: 0.68 + (index % 5) * 0.05 + "s" }));
    }
    const flip = sceneElement("scene-flip");
    flip.append(sceneFace(asset, false), sceneFace(asset, true));
    coin.appendChild(flip);
    coin.insertAdjacentHTML(
      "beforeend",
      '<svg class="scene-arc" viewBox="0 0 152 152"><circle cx="76" cy="76" r="70"/></svg>' +
        '<svg class="scene-lock" viewBox="0 0 24 24">' +
        '<path class="scene-shackle" d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="' + colors.seal.lock + '" stroke-width="2.6"/>' +
        '<rect x="4" y="10.5" width="16" height="11" rx="3" fill="' + colors.seal.lock + '" stroke="' + colors.seal.lockEdge + '" stroke-width="0.8"/>' +
        '<circle cx="12" cy="15" r="1.7" fill="' + colors.seal.lockEdge + '"/><rect x="11.2" y="15" width="1.6" height="3.4" rx="0.8" fill="' + colors.seal.lockEdge + '"/>' +
        "</svg>",
    );
    coin.appendChild(sceneElement("scene-flash"));
    addSparks(coin);
    actors.appendChild(coin);
    addMarker(actors, asset, "viewport");

    // The screen around the asset goes dark, a spotlight following it as the camera moves.
    const veil = document.createElement("div");
    veil.className = "scene-veil";
    const follow = () => {
      const { x, y } = map.project([asset.lng, asset.lat]);
      veil.style.setProperty("--cx", x + "px");
      veil.style.setProperty("--cy", y - 70 + "px");
    };
    follow();
    map.on("move", follow);
    const container = map.getContainer();
    container.classList.add("scene-shake");
    // Over the map but under the markers, so the scene stands clear of the map's own colors.
    map.getCanvas().after(veil);
    map.setPaintProperty("city-asset-names", "text-opacity", 0);

    // The visitor taking the map keeps it: the camera does not come back on them.
    let userMoved = false;
    const onMoveStart = (event) => {
      if (event.originalEvent) userMoved = true;
    };
    map.on("movestart", onMoveStart);

    const plate = cityPlate;
    map.easeTo({ center: [asset.lng, asset.lat], zoom, pitch: SCENE_PITCH, bearing: before.bearing - 16, duration: SNAP_MS, easing: (t) => 1 - Math.pow(1 - t, 3), essential: true });
    // A slow turn around the asset through the burst.
    const orbit = setTimeout(() => {
      if (!userMoved) map.easeTo({ bearing: before.bearing + 12, duration: 1900, easing: (t) => t, essential: true });
    }, SNAP_MS);

    // Just over the medallion at rest, wherever the camera lands the asset: a longer name grows upwards.
    const height = container.clientHeight;
    const { top: roomTop, bottom: roomBottom } = map.getPadding();
    const assetY = roomTop + (height - roomTop - roomBottom) / 2;
    const title = sceneTitle(asset, height - assetY + TITLE_ABOVE_ASSET);
    document.body.appendChild(title);

    // Settling from the tilt, the camera comes down onto the asset; the fog waits for it to arrive.
    const settle = setTimeout(() => {
      if (userMoved || cityPlate !== plate) return;
      map.easeTo({
        center: [asset.lng, asset.lat],
        zoom: Math.min(zoom + FOG_ZOOM_IN, FOG_ZOOM_MAX),
        pitch: before.pitch,
        bearing: before.bearing,
        duration: FOG_ZOOM_MS,
        easing: (t) => t * t * (3 - 2 * t),
        essential: true,
      });
    }, ZOOM_AT_MS);

    // The medallion's part over, the camera and the fog go on.
    setTimeout(() => {
      clearTimeout(orbit);
      markers.forEach((marker) => marker.remove());
      veil.remove();
      title.remove();
      container.classList.remove("scene-shake");
      map.off("move", follow);
    }, SCENE_MS);

    setTimeout(() => {
      clearTimeout(settle);
      map.setPaintProperty("city-asset-names", "text-opacity", citySealsShown ? 1 : 0);
      map.off("movestart", onMoveStart);
      scenePlaying = false;
      document.body.classList.remove("scene-on");
      post({ type: "sceneEnd" });
      // The scene over, what can be done with the asset now stands over it.
      if (cityPlate === plate) {
        tappedAsset = asset.id;
        placeUnlock();
      }
    }, OPENING_MS);
  }

  function setCityAssetsShown(shown) {
    citySealsShown = shown;
    map.setPaintProperty("city-asset-names", "text-opacity", shown ? 1 : 0);
    map.setPaintProperty("city-asset-badges", "icon-opacity", shown ? shownFrom(DOTS_ZOOM, SEALS_ZOOM, 1) : 0);
    // The haze thins with the dots and is gone by the Turkey view; the sheet with it.
    map.setPaintProperty("city-haze", "heatmap-opacity", shown ? shownFrom(outerZoom() + LEAVE_ROOM, wholeZoom, 1) : 0);
    sheetShown = shown;
    sheetLevelAt = performance.now();
    map.triggerRepaint();
    // The banks thin out slowly around the seals' turn into dots, so the fog does not jump.
    map.setPaintProperty("city-clouds", "icon-opacity", shown ? shownFrom(DOTS_ZOOM - 1, SEALS_ZOOM + 0.6, BANK_OPACITY) : 0);
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
    closeRelated(false);
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
    placeUnlock();
  }

  /**
   * "Kilidini aç": a button pinned above a locked asset the visitor tapped on the map, opening its
   * Ziyaret Mührü. Not for the asset the city opens on, nor one chosen from the cards or the search.
   */
  let unlock = null;
  /** The asset last tapped on the map in this city. */
  let tappedAsset = null;
  let unlockFor = null;
  const UNLOCK_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="' + colors.seal.lockEdge + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/><circle cx="12" cy="16" r="1" fill="' + colors.seal.lockEdge + '"/></svg>';

  /** The chosen seal's size now: it grows as the map zooms in (CHOSEN_SIZES). */
  function chosenSize(zoom = map.getZoom()) {
    const [atDots, at14, at16] = CHOSEN_SIZES;
    return zoom <= DOTS_ZOOM ? atDots : zoom <= 14 ? atDots + ((at14 - atDots) * (zoom - DOTS_ZOOM)) / (14 - DOTS_ZOOM) : Math.min(at16, at14 + ((at16 - at14) * (zoom - 14)) / 2);
  }

  /** Just above the chosen seal. */
  function unlockOffset() {
    return [0, -((SEAL_SIZE + SEAL_ROOM * 2) * chosenSize()) / 2 - 4];
  }

  /** Opens the shown asset's Ziyaret Mührü, once per tap whichever way it arrives. */
  let unlockFired = 0;
  function fireUnlock() {
    if (!unlockFor || Date.now() - unlockFired < 600) return;
    unlockFired = Date.now();
    post({ type: "unlock", id: unlockFor });
  }

  /** Whether a tap at this map point fell on "Kilidini aç". */
  function onUnlockButton(point) {
    if (!unlock || !unlockFor) return false;
    const button = unlock.getElement().firstChild.getBoundingClientRect();
    const frame = map.getContainer().getBoundingClientRect();
    const x = frame.left + point.x;
    const y = frame.top + point.y;
    // A little room below it: the point under the arrow still counts.
    return x >= button.left && x <= button.right && y >= button.top && y <= button.bottom + 8;
  }

  /** True while the map tour asks for "Kilidini aç" over the chosen asset, tapped on the map or not. */
  let unlockOffered = false;
  function offerUnlock(on) {
    unlockOffered = on;
    placeUnlock();
  }

  function placeUnlock() {
    const tapped = cityPlate !== null && citySelected !== null && (citySelected === tappedAsset || unlockOffered);
    const found = tapped ? cityAssets.find((candidate) => candidate.id === citySelected) : null;
    // An unlocked asset has nothing left to unlock.
    const asset = found && !found.unlocked ? found : null;
    placeOpenActions(found && found.unlocked && !scenePlaying ? found : null);
    if (!asset) {
      if (unlock) unlock.remove();
      unlockFor = null;
      return;
    }
    if (!unlock) {
      const wrap = document.createElement("div");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "unlock";
      button.innerHTML = UNLOCK_ICON + "<span>" + WORDS.unlock + "</span>";
      // In the phone's WebView the map's touch handling takes the tap before the button does, so the
      // map's own tap (onTap) checks for the button first; a click here covers the mouse.
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        fireUnlock();
      });
      wrap.appendChild(button);
      unlock = new maplibregl.Marker({ element: wrap, anchor: "bottom" });
      map.on("zoom", () => unlockFor && unlock.setOffset(unlockOffset()));
    }
    const button = unlock.getElement().firstChild;
    button.setAttribute("aria-label", asset.title + ": " + WORDS.unlockLabel);
    unlock.setLngLat([asset.lng, asset.lat]).setOffset(unlockOffset()).addTo(map);
    if (unlockFor !== asset.id && motion) {
      // Pops up again for each newly chosen asset.
      button.classList.remove("pop");
      void button.offsetWidth;
      button.classList.add("pop");
    }
    unlockFor = asset.id;
  }

  /**
   * "İlişkili eserleri gör" above, "Not bırak" and "İncele" below on either side: three branches out of an unlocked asset, once its scene
   * is over or when it is tapped on the map. The same rule as "Kilidini aç" for the rest. While the
   * related assets show they step aside for those lines, and placeRelatedBar stands above the cards.
   */
  let openActions = null;
  let openActionsFor = null;
  let openActionFired = 0;
  const optionIcon = (path) => '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + colors.seal.lockEdge + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
  const OPEN_OPTIONS = [
    { type: "related", end: (seal) => [0, -(seal + 30)], label: () => WORDS.related, icon: optionIcon('<path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1"/>') },
    { type: "note", end: (seal) => [-72, seal + 20], label: () => WORDS.note, icon: optionIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>') },
    { type: "inspect", end: (seal) => [72, seal + 20], label: () => WORDS.inspect, icon: optionIcon('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>') },
  ];

  /** Sends the option, once per tap whichever way it arrives. */
  function fireOpenAction(type) {
    if (!openActionsFor || Date.now() - openActionFired < 600) return;
    openActionFired = Date.now();
    if (type === "related") showRelated(openActionsFor);
    else post({ type, id: openActionsFor });
  }

  /** How long the camera takes to draw back, how long the lines take to reach the related assets, and how far a line bends. */
  const RELATED_FLY_MS = 1100;
  const RELATED_GROW_MS = 1200;
  /** The least the map draws back when the related assets show, in zoom levels. */
  const RELATED_STEP_BACK = 1.5;
  const LINK_POINTS = 48;
  const LINK_BEND = 0.1;
  const LINK_LIGHT = "#FFEDBE";
  /** What "İlişkili eserleri gör" shows now, and the camera to come back to. */
  let relatedShown = null;

  /** The line up to how far it has come, nothing beyond. */
  function linkGradient(progress) {
    const head = Math.min(Math.max(progress, 0.001), 0.998);
    const none = "rgba(" + rgb(LINK_LIGHT).join(", ") + ", 0)";
    return ["interpolate", ["linear"], ["line-progress"], 0, LINK_LIGHT, head, LINK_LIGHT, head + 0.001, none, 1, none];
  }

  /** A gentle curve from one asset to another, each bending its own way so lines to one side do not lie on each other. */
  function linkFeature(from, to, index) {
    const across = Math.cos((from.lat * Math.PI) / 180);
    const side = index % 2 ? 1 : -1;
    const bendLng = from.lng / 2 + to.lng / 2 - ((to.lat - from.lat) * LINK_BEND * side) / across;
    const bendLat = from.lat / 2 + to.lat / 2 + (to.lng - from.lng) * across * LINK_BEND * side;
    const points = [];
    for (let step = 0; step <= LINK_POINTS; step++) {
      const t = step / LINK_POINTS;
      const a = (1 - t) * (1 - t);
      const b = 2 * t * (1 - t);
      const c = t * t;
      points.push([a * from.lng + b * bendLng + c * to.lng, a * from.lat + b * bendLat + c * to.lat]);
    }
    return { type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} };
  }

  /** The map draws back until the asset's related assets are in view, lines reach out to them and they glow. */
  function showRelated(id) {
    const asset = cityAssets.find((candidate) => candidate.id === id);
    const targets = asset ? (asset.relatedTo || []).flatMap((other) => cityAssets.filter((candidate) => candidate.id === other)) : [];
    if (targets.length === 0) return;
    const shown = { id, camera: { center: map.getCenter(), zoom: map.getZoom() } };
    relatedShown = shown;
    placeUnlock();
    map.getSource("city-links").setData({ type: "FeatureCollection", features: targets.map((target, index) => linkFeature(asset, target, index)) });
    map.getSource("city-related").setData({ type: "FeatureCollection", features: targets.map((target) => ({ type: "Feature", geometry: { type: "Point", coordinates: [target.lng, target.lat] }, properties: { title: target.title } })) });
    // Only the asset and what it is related to stay on the map.
    filterCityAssets(["in", ["get", "id"], ["literal", [id, ...targets.map((target) => target.id)]]]);
    const bounds = new maplibregl.LngLatBounds([asset.lng, asset.lat], [asset.lng, asset.lat]);
    targets.forEach((target) => bounds.extend([target.lng, target.lat]));
    const room = cityPadding();
    // The map adds its own padding (some camera moves leave it, some do not), so only what is missing is asked for: counted twice, it can leave no room at all.
    const kept = map.getPadding();
    const padding = { top: Math.max(0, room.top + 72 - kept.top), right: Math.max(0, room.right + 24 - kept.right), bottom: Math.max(0, room.bottom + 24 - kept.bottom), left: Math.max(0, room.left + 24 - kept.left) };
    // Always a step back, however near the related assets are: already on screen, they would not move the camera at all.
    const fit = map.cameraForBounds(bounds, { padding });
    const stepBack = map.getZoom() - RELATED_STEP_BACK;
    map.fitBounds(bounds, { padding, maxZoom: fit ? Math.min(fit.zoom, stepBack) : stepBack, duration: motion ? RELATED_FLY_MS : 0, essential: true });
    const setReached = (reached) => {
      const gradient = linkGradient(reached);
      map.setPaintProperty("city-links-glow", "line-gradient", gradient);
      map.setPaintProperty("city-links-core", "line-gradient", gradient);
    };
    const glow = () => map.setPaintProperty("city-related-glow", "circle-opacity", 0.8);
    if (!motion) {
      setReached(1);
      glow();
      return;
    }
    setReached(0);
    const started = performance.now() + RELATED_FLY_MS * 0.3;
    const step = (now) => {
      if (relatedShown !== shown) return;
      const t = Math.min(1, Math.max(0, (now - started) / RELATED_GROW_MS));
      setReached(t * t * (3 - 2 * t));
      if (t < 1) requestAnimationFrame(step);
      else glow();
    };
    requestAnimationFrame(step);
  }

  function filterCityAssets(filter) {
    for (const layer of ["city-asset-dots", "city-asset-room", "city-asset-names", "city-asset-badges"]) map.setFilter(layer, filter);
  }

  /** The lines and the glow go; when asked, the camera returns to where it was. */
  function closeRelated(comeBack) {
    if (!relatedShown) return;
    const { camera } = relatedShown;
    relatedShown = null;
    const empty = { type: "FeatureCollection", features: [] };
    map.getSource("city-links").setData(empty);
    map.getSource("city-related").setData(empty);
    map.setPaintProperty("city-related-glow", "circle-opacity", 0);
    filterCityAssets(null);
    if (comeBack) map.easeTo({ center: camera.center, zoom: camera.zoom, padding: cityPadding(), duration: motion ? 800 : 0, essential: true });
    placeUnlock();
  }

  /** Which option a tap at this map point fell on. */
  function openActionAt(point) {
    if (!openActions || !openActionsFor) return null;
    const frame = map.getContainer().getBoundingClientRect();
    const x = frame.left + point.x;
    const y = frame.top + point.y;
    const buttons = [...openActions.getElement().querySelectorAll("button")];
    const hit = buttons.find((button) => {
      const box = button.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
    return hit ? hit.dataset.option : null;
  }

  let relatedBar = null;

  /** "Kapat" and the way to the list while the related assets show: fixed on the screen, so they cover none of the lines. */
  function placeRelatedBar(shown) {
    if (!relatedBar) {
      relatedBar = document.createElement("div");
      relatedBar.className = "related-bar";
      const button = (label, path, onPress) => {
        const element = document.createElement("button");
        element.type = "button";
        element.innerHTML = '<span class="option-icon">' + optionIcon(path) + "</span><span>" + label + "</span>";
        element.addEventListener("click", onPress);
        relatedBar.appendChild(element);
      };
      button(WORDS.close, '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', () => closeRelated(true));
      button(WORDS.relatedList, '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>', () => relatedShown && post({ type: "relatedList", id: relatedShown.id }));
      document.body.appendChild(relatedBar);
    }
    relatedBar.style.display = shown ? "flex" : "none";
    relatedBar.style.bottom = lastPadding.bottom + 12 + "px";
  }

  /** Each branch runs from the rim of the chosen seal, which grows with the zoom, to its option. */
  function layoutOpenActions() {
    const row = openActions.getElement().firstChild;
    const seal = ((SEAL_SIZE + SEAL_ROOM * 2) * chosenSize()) / 2 - 6;
    OPEN_OPTIONS.forEach((option, index) => {
      const [x, y] = option.end(seal);
      const length = Math.hypot(x, y);
      const line = row.querySelector('[data-branch="' + option.type + '"]');
      line.setAttribute("x1", String((x * seal) / length));
      line.setAttribute("y1", String((y * seal) / length));
      line.setAttribute("x2", String(x));
      line.setAttribute("y2", String(y));
      const button = row.querySelector('[data-option="' + option.type + '"]');
      button.style.left = x + "px";
      button.style.top = y + "px";
      button.style.setProperty("--ex", "-50%");
      button.style.setProperty("--ey", y < 0 ? "-100%" : "0%");
      button.style.setProperty("--dx", -x + "px");
      button.style.setProperty("--dy", -y + "px");
      button.style.setProperty("--wait", index * 0.06 + "s");
      line.style.setProperty("--wait", index * 0.06 + "s");
    });
  }

  function placeOpenActions(asset) {
    const showing = asset !== null && relatedShown !== null && relatedShown.id === asset.id;
    placeRelatedBar(showing);
    if (!asset) {
      if (openActions) openActions.remove();
      openActionsFor = null;
      return;
    }
    if (showing) {
      if (openActions) openActions.remove();
      return;
    }
    if (!openActions) {
      const wrap = document.createElement("div");
      const row = document.createElement("div");
      row.className = "open-actions";
      for (const option of OPEN_OPTIONS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.option = option.type;
        button.innerHTML = '<span class="option-icon">' + option.icon + "</span><span>" + option.label() + "</span>";
        // As with "Kilidini aç": the phone's WebView gives the tap to the map (onTap), a click covers the mouse.
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          fireOpenAction(option.type);
        });
        row.appendChild(button);
      }
      const lines = OPEN_OPTIONS.map((option) => '<line pathLength="1" data-branch="' + option.type + '"/>').join("");
      row.insertAdjacentHTML("afterbegin", '<svg aria-hidden="true">' + lines + "</svg>");
      wrap.appendChild(row);
      openActions = new maplibregl.Marker({ element: wrap, anchor: "center" });
      map.on("zoom", () => openActionsFor && layoutOpenActions());
    }
    const row = openActions.getElement().firstChild;
    // An asset with nothing related to it on the map offers only the note.
    const related = Boolean(asset.relatedTo && asset.relatedTo.length > 0);
    row.querySelector('[data-option="related"]').hidden = !related;
    row.querySelector('[data-branch="related"]').toggleAttribute("hidden", !related);
    layoutOpenActions();
    openActions.setLngLat([asset.lng, asset.lat]).addTo(map);
    if (openActionsFor !== asset.id && motion) {
      row.classList.remove("pop");
      void row.offsetWidth;
      row.classList.add("pop");
    }
    openActionsFor = asset.id;
  }

  /** An unlocked seal is gold with a night-blue icon, so it stands apart from the locked ones around it. */
  const OPEN_SEAL = { ...colors.seal, from: "#F6DFA4", to: colors.seal.lock, ring: "#FFF4D2", icon: colors.seal.lockEdge };

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
   * A locked asset (with locked false, an unlocked one: gold all over, no padlock): a night-blue disc in a navy ring, the kind of place drawn in gold inside and a
   * gold padlock over its lower right edge, outlined in navy so it stands out on the fog
   * (colors.seal). The landmark's ring is doubled.
   */
  function sealImage(category, landmark, locked = true, ratio = SEAL_RATIO, look = locked ? colors.seal : OPEN_SEAL) {
    const side = SEAL_SIZE + SEAL_ROOM * 2;
    const canvas = document.createElement("canvas");
    canvas.width = side * ratio;
    canvas.height = side * ratio;
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    const middle = side / 2;
    const r = SEAL_SIZE / 2;
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
    if (!look.blank) drawGlyph(context, category, look.to);
    context.restore();
    if (!locked) return context.getImageData(0, 0, canvas.width, canvas.height);
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
  /** Rows worked out between two pauses of cloudSteps. */
  const CLOUD_ROWS_A_STEP = 6;
  /** The bank's picture, worked out a few rows a step (see drawPicturesLater). */
  function* cloudSteps(seed) {
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
      if (py % CLOUD_ROWS_A_STEP === CLOUD_ROWS_A_STEP - 1) yield;
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
      if (py % CLOUD_ROWS_A_STEP === CLOUD_ROWS_A_STEP - 1) yield;
    }
    return { width, height, data };
  }

  /**
   * The kinds of place, in one geometric hand: solid shapes on a 32-point box with the same rounded
   * corners, parted by clean gaps and cut through in the color of the disc.
   */
  function drawGlyph(context, category, color) {
    const ink = context.fillStyle;
    const solid = (...paths) => {
      context.fillStyle = ink;
      paths.forEach((path) => context.fill(new Path2D(path)));
    };
    const cut = (...paths) => {
      context.fillStyle = color;
      paths.forEach((path) => context.fill(new Path2D(path)));
    };
    if (category === "worship") {
      // A pointed dome on its base, with a slim minaret.
      solid(
        "M14.2 8.2a1 1 0 1 1 0 2a1 1 0 1 1 0-2Z",
        "M14.2 10.9C16.9 13 19.8 15 19.8 19.1H8.6C8.6 15 11.5 13 14.2 10.9Z",
        "M9.3 20.1H19.1a.8.8 0 0 1 .8.8V25H8.5V20.9a.8.8 0 0 1 .8-.8Z",
        "M22.1 12.2L23.4 7L24.7 12.2V25H22.1Z",
      );
      cut("M12.8 25V23a1.4 1.4 0 0 1 2.8 0V25Z");
    } else if (category === "tomb") {
      // A kümbet: a cone over its body, with a pointed door.
      solid("M16 5.8L21.6 14.6H10.4Z", "M12.3 15.6H19.7a.7.7 0 0 1 .7.7V25H11.6V16.3a.7.7 0 0 1 .7-.7Z");
      cut("M14.4 25V21.2C14.4 20.2 15.4 19.5 16 18.6C16.6 19.5 17.6 20.2 17.6 21.2V25Z");
    } else if (category === "school") {
      // An open book.
      solid(
        "M15.2 11.1C13 9.5 10.1 9.2 7.8 9.6A.8.8 0 0 0 7 10.4V21.5A.8.8 0 0 0 7.9 22.3C10.2 21.9 13 22.1 15.2 23.6Z",
        "M16.8 11.1C19 9.5 21.9 9.2 24.2 9.6A.8.8 0 0 1 25 10.4V21.5A.8.8 0 0 1 24.1 22.3C21.8 21.9 19 22.1 16.8 23.6Z",
      );
    } else if (category === "trade") {
      // A han's front: three merlons and a great arched gate.
      solid(
        "M7.5 8.6h3.6v3H7.5Z",
        "M14.2 8.6h3.6v3h-3.6Z",
        "M20.9 8.6h3.6v3h-3.6Z",
        "M7.5 12.5H24.5V24.2a.8.8 0 0 1-.8.8H8.3a.8.8 0 0 1-.8-.8Z",
      );
      cut("M12.6 25V18.8a3.4 3.4 0 0 1 6.8 0V25Z");
    } else if (category === "water") {
      // A drop, with a glint on its lower left.
      solid("M16 6.6C16 6.6 23 13.9 23 18.2A7 7 0 0 1 9 18.2C9 13.9 16 6.6 16 6.6Z");
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.lineCap = "round";
      context.beginPath();
      context.arc(16, 18.2, 4.3, Math.PI * 0.56, Math.PI * 0.98);
      context.stroke();
    } else if (category === "charity") {
      // A külliye: a great dome between two small ones, on one base.
      solid(
        "M15.4 10.8h1.2v2.8h-1.2Z",
        "M10.9 19.2a5.1 5.1 0 0 1 10.2 0Z",
        "M6.5 19.2a1.95 1.95 0 0 1 3.9 0Z",
        "M21.6 19.2a1.95 1.95 0 0 1 3.9 0Z",
        "M7.3 20.2H24.7a.8.8 0 0 1 .8.8V25H6.5V21a.8.8 0 0 1 .8-.8Z",
      );
      cut("M14.6 25V23.2a1.4 1.4 0 0 1 2.8 0V25Z");
    } else {
      // The eight-pointed star of the Hayrat design, its points sharp.
      context.save();
      context.translate(16, 16);
      for (const turn of [0, Math.PI / 4]) {
        context.rotate(turn);
        context.fillRect(-6.6, -6.6, 13.2, 13.2);
      }
      context.restore();
    }
  }

  /**
   * Room around the framed assets, inside the screen's own panels. On a small screen the panels
   * (the search, the asset's buttons, a notice, the cards) can take more than the whole height; the
   * room is then shrunk, each side as much as the other, so the map keeps at least 30% of the
   * screen to frame in. Without it MapLibre finds no camera and the city cannot open.
   */
  function cityPadding() {
    const wanted = { top: lastPadding.top + 24, right: lastPadding.right + 24, bottom: lastPadding.bottom + 24, left: lastPadding.left + 24 };
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const fit = (a, b, size) => {
      const most = size * 0.7;
      const scale = a + b > most && a + b > 0 ? most / (a + b) : 1;
      return [Math.floor(a * scale), Math.floor(b * scale)];
    };
    const [top, bottom] = fit(wanted.top, wanted.bottom, height);
    const [left, right] = fit(wanted.left, wanted.right, width);
    return { top, right, bottom, left };
  }

  function provinceBounds(plate) {
    const feature = PROVINCES.features.find((candidate) => candidate.properties.plate === plate);
    const bounds = new maplibregl.LngLatBounds();
    const visit = (coordinates) => (typeof coordinates[0] === "number" ? bounds.extend(coordinates) : coordinates.forEach(visit));
    if (feature) visit(feature.geometry.coordinates);
    return bounds;
  }

  const OWN_SOURCES = new Set(["assets", "provinces", "province-names", "city-assets", "city-fog", "city-fog-clearing"]);
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
   * fog breaks up from the middle of the country outwards over a still map. The provinces
   * with assets light up last, with one pulse.
   */
  function startIntro() {
    // The camera stays still: moving it as the fog parts loads new tiles at that very moment and the
    // drawing stutters on phones. The fog and the traced border carry the opening alone.
    intro = intro || newIntro();
    const begin = () => {
      if (!intro || intro.start !== Infinity) return;
      intro.start = performance.now();
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

  /**
   * A city asked for during the opening (from Ana Sayfa, or a link): the fog goes at once and the
   * map is as the opening leaves it, or the opening's own camera would pull the flight back to Turkey.
   */
  function endIntroNow() {
    if (!intro) return;
    intro = null;
    drawPicturesLater();
    map.stop();
    map.jumpTo({ pitch: 0, bearing: 0, ...(turkeyView ? { center: turkeyView.center, zoom: turkeyView.zoom } : {}) });
    map.setPaintProperty("province-borders", "line-opacity", 1);
    map.setPaintProperty("province-lines", "line-opacity", 1);
    revealLabels();
    lockToTurkey();
    animate();
  }

  function drawIntro(now, width, height) {
    // The border's tracing runs on its own clock, so it can be paced apart from the fog.
    const traced = intro.start === Infinity ? 0 : smoothstep(0, TRACE_MS, now - intro.start);
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
    drawOutline(elapsed, traced);
    // Tied to the frames, not a timer: the names come a moment after the lines, before the opening ends.
    if (elapsed >= 0.75 && !labelsRevealed) revealLabels();
    if (elapsed >= 1) {
      intro = null;
      drawPicturesLater();
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
  function drawOutline(elapsed, traced) {
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
    // Never left closed if the provinces do not come. The opening styles the province layers, so on a
    // slow connection, where the base style is still loading, it waits for them (the load above adds them).
    setTimeout(() => {
      const open = () => {
        if (!provincesShown) startIntro();
      };
      if (loaded) open();
      else map.once("load", open);
    }, PROVINCES_WAIT_MS);
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

  actions.map = map;
  actions.showPins = showPins;
  actions.select = select;
  actions.showNetwork = showNetwork;
  actions.showProvinces = showProvinces;
  actions.watchSpots = watchSpots;
  actions.offerUnlock = offerUnlock;

  // Where the map tour points: the busiest province's name in the Turkey view, the chosen asset once the camera
  // has landed in a city, and "Kilidini aç" while it shows.
  // Polled rather than tied to every frame, and sent only when something moved.
  const SPOTS_MS = 120;
  let spotsTimer = null;
  let lastSpots = "";
  function watchSpots(on) {
    clearInterval(spotsTimer);
    spotsTimer = null;
    lastSpots = "";
    if (on) spotsTimer = setInterval(postSpots, SPOTS_MS);
  }
  function postSpots() {
    const province = cityPlate === null && !intro && labelsRevealed && topProvince ? map.project(topProvince.point) : null;
    const asset = cityPlate !== null && cityLanded && !flying ? cityAssets.find((candidate) => candidate.id === citySelected) : null;
    const point = asset ? map.project([asset.lng, asset.lat]) : null;
    let button = null;
    if (unlock && unlockFor) {
      const rect = unlock.getElement().firstChild.getBoundingClientRect();
      const frame = map.getContainer().getBoundingClientRect();
      button = { x: Math.round(rect.left - frame.left), y: Math.round(rect.top - frame.top), width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    const spots = { province: province ? { x: Math.round(province.x), y: Math.round(province.y), name: topProvince.name } : null, asset: point ? { x: Math.round(point.x), y: Math.round(point.y) } : null, unlock: button };
    const json = JSON.stringify(spots);
    if (json === lastSpots) return;
    lastSpots = json;
    post({ type: "spots", spots });
  }
}
</script>
</body>
</html>`;
}

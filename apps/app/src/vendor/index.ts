import { useEffect, useState } from "react";

/**
 * The browser libraries the WebView pages inline (Y12). Each is imported on first
 * use, so the web build gets it as a separate chunk that only the AR and map
 * screens download, and later screens reuse the same promise.
 */
const cache = new Map<string, Promise<unknown>>();
/** How long the tracker waits for its optional font before it starts without it. */
const OPTIONAL_WAIT_MS = 3_000;

function once<T>(key: string, load: () => Promise<T>): () => Promise<T> {
  return () => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key) as Promise<T>;
  };
}

export const loadMindar = once("mindar", () => import("./mindar.generated").then((m) => m.mindarScript));

/** The app's heading font, Marcellus, for the text the AR page draws over an inscription (base64 TrueType); "" when it could not be loaded. */
export const loadOverlayFont = once("overlay-font", () =>
  // Optional: if it fails or is slow (a web chunk after a deploy), the page draws in a system serif.
  Promise.race([
    import("./overlay-font.generated").then((m) => m.overlayFontBase64),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), OPTIONAL_WAIT_MS)),
  ]).catch(() => ""),
);

export const loadMaplibre = once("maplibre", () =>
  import("./maplibre.generated").then((m) => ({ script: m.maplibreScript, css: m.maplibreCss })),
);

/** The library once loaded, `null` before. `load` must be one of the loaders above. */
export function useVendored<T>(load: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let active = true;
    load().then((loaded) => active && setValue(() => loaded));
    return () => {
      active = false;
    };
  }, [load]);
  return value;
}

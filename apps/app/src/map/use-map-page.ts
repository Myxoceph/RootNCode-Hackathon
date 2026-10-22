import { useTheme } from "@vagabonds/ui";
import { useEffect, useMemo, useRef } from "react";

import { mapPageHtml, parseMapPageEvent, type MapPageCommand } from "./maplibre-page";
import type { AssetMapProps } from "./types";

const DEFAULT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * What the WebView and the iframe versions of the MapLibre map share: the page,
 * the commands sent to it when pins or the selection change, and its events.
 */
export function useMapPage(
  { pins, selectedId, onSelect, onReady, onError, fitPadding = DEFAULT_PADDING }: AssetMapProps,
  send: (command: MapPageCommand) => void,
) {
  const { scheme, colors: c } = useTheme();
  const html = useMemo(
    () =>
      mapPageHtml({
        scheme,
        colors: { land: c.mapBackground, pin: c.primary, pinSelected: c.highlightMark, outline: c.surface, onCluster: c.onPrimary },
      }),
    [scheme, c],
  );
  const ready = useRef(false);

  // Padding is compared by value: a literal passed on every render must not refit the map.
  const padding = JSON.stringify(fitPadding);
  useEffect(() => send({ type: "pins", pins, padding: JSON.parse(padding) }), [pins, padding, send]);
  useEffect(() => send({ type: "select", id: selectedId }), [selectedId, send]);

  const onMessage = (data: unknown) => {
    const event = parseMapPageEvent(data);
    if (event?.type === "select") onSelect(event.id);
    if (event?.type === "error") onError?.(event.message);
    if (event?.type === "ready" && !ready.current) {
      ready.current = true;
      onReady?.();
    }
  };

  /** Commands sent before the page loaded are lost; replay the current state once it has. */
  const replay = () => {
    send({ type: "pins", pins, padding: fitPadding });
    send({ type: "select", id: selectedId });
  };

  return { html, onMessage, replay };
}

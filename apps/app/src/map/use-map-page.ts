import { useTheme } from "@vagabonds/ui";
import { useEffect, useMemo, useRef } from "react";

import { loadMaplibre, useVendored } from "@/vendor";

import { mapPageHtml, parseMapPageEvent, type MapPageCommand } from "./maplibre-page";
import type { AssetMapProps } from "./types";

const DEFAULT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * What the WebView and the iframe versions of the MapLibre map share: the page,
 * the commands sent to it when pins or the selection change, and its events.
 */
export function useMapPage(
  { pins, selectedId, onSelect, onReady, onError, fitPadding = DEFAULT_PADDING, network = null, provinces = null }: AssetMapProps,
  send: (command: MapPageCommand) => void,
) {
  const { scheme, colors: c } = useTheme();
  const maplibre = useVendored(loadMaplibre);
  // Only whether and how the map opens is baked into the page; the outlined plates are sent as commands.
  const showsProvinces = provinces !== null;
  const reveal = provinces?.reveal ?? false;
  /** `null` until MapLibre is loaded. */
  const html = useMemo(
    () =>
      maplibre
        ? mapPageHtml({
            scheme,
            colors: {
              land: c.mapBackground,
              pin: c.primary,
              pinSelected: c.highlightMark,
              outline: c.surface,
              onCluster: c.onPrimary,
              fog: c.fog,
              mark: c.highlightMark,
              markText: c.highlight,
              label: c.surface,
              labelText: c.text,
              province: c.mapProvince,
            },
            maplibre,
            opening: showsProvinces ? { reveal } : null,
          })
        : null,
    [scheme, c, maplibre, showsProvinces, reveal],
  );
  const ready = useRef(false);

  // Padding is compared by value: a literal passed on every render must not refit the map.
  const padding = JSON.stringify(fitPadding);
  useEffect(() => send({ type: "pins", pins, padding: JSON.parse(padding) }), [pins, padding, send]);
  useEffect(() => send({ type: "select", id: selectedId }), [selectedId, send]);
  // Same for the network, which screens rebuild on every render.
  const networkJson = JSON.stringify(network);
  useEffect(() => send({ type: "network", network: JSON.parse(networkJson) }), [networkJson, send]);
  const provincesJson = JSON.stringify(provinces);
  useEffect(() => send({ type: "provinces", provinces: JSON.parse(provincesJson) }), [provincesJson, send]);

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
    send({ type: "network", network });
    send({ type: "provinces", provinces });
  };

  return { html, onMessage, replay };
}

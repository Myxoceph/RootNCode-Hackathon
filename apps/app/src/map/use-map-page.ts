import { palette, useUi } from "@vagabonds/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadMaplibre, useVendored } from "@/vendor";

import { useMapTheme } from "./map-theme";
import { mapPageHtml, parseMapPageEvent, type MapPageCommand } from "./maplibre-page";
import type { AssetMapProps } from "./types";
import { useMessages } from "@/i18n";

const DEFAULT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * What the WebView and the iframe versions of the MapLibre map share: the page,
 * the commands sent to it when pins or the selection change, and its events.
 */
export function useMapPage(
  { pins, selectedId, onSelect, onReady, onError, fitPadding = DEFAULT_PADDING, network = null, provinces = null, onSelectProvince, onLeaveCity, onCityLanded, onCityReady, onIntroEnd, onUnlock, onInspect, onOpenRelatedList, onLeaveNote, listen = null, onListen, onSceneEnd, watchSpots = false, onSpots, offerUnlock = false }: AssetMapProps,
  send: (command: MapPageCommand) => void,
) {
  const { scheme, colors: c } = useMapTheme();
  const words = useMessages().mapPage;
  const { textScale } = useUi();
  // The page is built with the words it first had; a new language reaches it as a command, so the
  // map is not loaded again and keeps where it is, its open fog and its selection.
  const [firstWords] = useState(words);
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
              border: c.mapBorder,
              // Night blue and leaf gold, the same in both themes.
              seal: {
                from: palette.gece700,
                to: palette.gece900,
                ring: palette.gece950,
                icon: palette.altin200,
                lock: palette.altin300,
                lockEdge: palette.gece950,
                halo: palette.gece950,
              },
              // White fog on the day map, moonlit fog on the night map.
              cloud: scheme === "dark" ? { top: palette.gece100, middle: palette.gece300, bottom: palette.gece600 } : { top: palette.white, middle: palette.gece200, bottom: palette.gece400 },
            },
            words: firstWords,
            maplibre,
            opening: showsProvinces ? { reveal } : null,
          })
        : null,
    [scheme, c, firstWords, maplibre, showsProvinces, reveal],
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
  useEffect(() => send({ type: "watchSpots", on: watchSpots }), [watchSpots, send]);
  useEffect(() => send({ type: "offerUnlock", on: offerUnlock }), [offerUnlock, send]);
  // By value, as the padding: the screen builds the object again on every render.
  const listenJson = JSON.stringify(listen);
  useEffect(() => send({ type: "listen", listen: JSON.parse(listenJson) }), [listenJson, send]);
  useEffect(() => send({ type: "words", words }), [words, send]);
  useEffect(() => send({ type: "textScale", scale: textScale }), [textScale, send]);

  const onMessage = (data: unknown) => {
    const event = parseMapPageEvent(data);
    if (event?.type === "select") onSelect(event.id);
    if (event?.type === "province") onSelectProvince?.(event.plate);
    if (event?.type === "leaveCity") onLeaveCity?.();
    if (event?.type === "cityLanded") onCityLanded?.(event.plate);
    if (event?.type === "cityReady") onCityReady?.(event.plate);
    if (event?.type === "introEnd") onIntroEnd?.();
    if (event?.type === "unlock") onUnlock?.(event.id);
    if (event?.type === "inspect") onInspect?.(event.id);
    if (event?.type === "relatedList") onOpenRelatedList?.(event.id);
    if (event?.type === "note") onLeaveNote?.(event.id);
    if (event?.type === "listen") onListen?.(event.id);
    if (event?.type === "sceneEnd") onSceneEnd?.();
    if (event?.type === "spots") onSpots?.(event.spots);
    if (event?.type === "error") onError?.(event.message);
    if (event?.type === "ready" && !ready.current) {
      ready.current = true;
      onReady?.();
    }
  };

  /** Commands sent before the page loaded are lost; replay the current state once it has. */
  const replay = () => {
    send({ type: "words", words });
    send({ type: "textScale", scale: textScale });
    send({ type: "pins", pins, padding: fitPadding });
    send({ type: "select", id: selectedId });
    send({ type: "network", network });
    send({ type: "provinces", provinces });
    send({ type: "watchSpots", on: watchSpots });
    send({ type: "offerUnlock", on: offerUnlock });
    send({ type: "listen", listen });
  };

  return { html, onMessage, replay };
}

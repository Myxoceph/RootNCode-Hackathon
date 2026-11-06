import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type { MapPageCommand } from "./maplibre-page";
import type { AssetMapProps } from "./types";
import { useMapPage } from "./use-map-page";
import { useMessages } from "@/i18n";

type MapWindow = Window & { vagabondsMap?: { receive: (command: MapPageCommand) => void } };

/** The web version: the same page in an iframe. */
export function MapLibreMap(props: AssetMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const send = useCallback((command: MapPageCommand) => {
    (frame.current?.contentWindow as MapWindow | null)?.vagabondsMap?.receive(command);
  }, []);
  const { html, onMessage, replay } = useMapPage(props, send);
  const title = useMessages().tabs.map;

  useEffect(() => {
    const listener = (message: MessageEvent) => {
      if (message.source === frame.current?.contentWindow) onMessage(message.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  });

  return (
    <View style={[styles.box, props.style]} aria-hidden>
      {html !== null && (
        <iframe ref={frame} srcDoc={html} onLoad={replay} title={title} tabIndex={-1} style={{ border: 0, width: "100%", height: "100%" }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
  },
});

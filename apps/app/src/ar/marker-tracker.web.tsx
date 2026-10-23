import { cameraColors } from "@vagabonds/ui";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { loadMindar, useVendored } from "@/vendor";

import type { MarkerTrackerProps } from "./marker-tracker";
import { parseTrackerEvent } from "./mindar";
import { trackerPageHtml } from "./tracker-page";

/**
 * The web version of the tracker: the same page in an iframe. The app's own
 * camera screens keep to their camera-free versions on the web (ADR 0001);
 * this lets the prototype be tried in a phone's browser and on a laptop.
 */
export function MarkerTracker({ targetsMind, onEvent, style }: MarkerTrackerProps) {
  const mindarScript = useVendored(loadMindar);
  const html = useMemo(
    () => (mindarScript ? trackerPageHtml({ targetsMind, markColor: cameraColors.gold, mindarScript }) : null),
    [targetsMind, mindarScript],
  );
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const listener = (message: MessageEvent) => {
      if (message.source !== frame.current?.contentWindow) return;
      const event = parseTrackerEvent(message.data);
      if (event) onEvent(event);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onEvent]);

  return (
    <View style={[styles.box, style]} aria-hidden>
      {html !== null && <iframe ref={frame} srcDoc={html} allow="camera" title="Kamera" tabIndex={-1} style={{ border: 0, width: "100%", height: "100%" }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: cameraColors.background,
  },
});

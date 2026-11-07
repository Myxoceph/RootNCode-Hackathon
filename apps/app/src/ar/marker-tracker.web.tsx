import { cameraColors } from "@vagabonds/ui";
import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { loadMindar, loadOverlayFont, useVendored } from "@/vendor";

import type { MarkerTrackerProps } from "./marker-tracker";
import { parseTrackerEvent } from "./mindar";
import { trackerPageHtml } from "./tracker-page";
import { useMessages } from "@/i18n";

/**
 * The web version of the tracker: the same page in an iframe. The app's own
 * camera screens keep to their camera-free versions on the web (ADR 0001);
 * this lets the prototype be tried in a phone's browser and on a laptop.
 */
export function MarkerTracker({ target, overlays, onEvent, style, ref }: MarkerTrackerProps) {
  const mindarScript = useVendored(loadMindar);
  const overlayFont = useVendored(loadOverlayFont);
  const html = useMemo(
    () =>
      // The font is optional: "" when it could not be loaded, and the page then draws in a system serif.
      mindarScript && overlayFont !== null ? trackerPageHtml({ target, overlays, markColor: cameraColors.gold, mindarScript, overlayFont: overlayFont || undefined }) : null,
    [target, overlays, mindarScript, overlayFont],
  );
  const frame = useRef<HTMLIFrameElement>(null);
  const title = useMessages().tabs.camera;
  useImperativeHandle(ref, () => ({
    send: (command) => frame.current?.contentWindow?.postMessage(JSON.stringify({ command }), "*"),
  }));

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
      {html !== null && <iframe ref={frame} srcDoc={html} allow="camera" title={title} tabIndex={-1} style={{ border: 0, width: "100%", height: "100%" }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: cameraColors.background,
  },
});

import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import type { MapPageCommand } from "./maplibre-page";
import type { AssetMapProps } from "./types";
import { useMapPage } from "./use-map-page";

/** The MapLibre map in a WebView (ADR 0003). Hidden from screen readers, like every map. */
export function MapLibreMap(props: AssetMapProps) {
  // react-native-webview 14 defaults the class's extra-props parameter to `undefined`, which turns its props into `never`.
  const webView = useRef<WebView<object>>(null);
  const send = useCallback((command: MapPageCommand) => {
    webView.current?.injectJavaScript(`window.vagabondsMap && window.vagabondsMap.receive(${JSON.stringify(command)}); true;`);
  }, []);
  const { html, onMessage, replay } = useMapPage(props, send);

  return (
    <View style={[styles.box, props.style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {html !== null && (
        <WebView
          ref={webView}
          source={{ html, baseUrl: "https://localhost/" }}
          originWhitelist={["*"]}
          onLoadEnd={replay}
          onMessage={(message) => onMessage(message.nativeEvent.data)}
          onError={(e) => props.onError?.(`WebView: ${e.nativeEvent.description}`)}
          scrollEnabled={false}
          bounces={false}
          style={styles.box}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: "transparent",
  },
});

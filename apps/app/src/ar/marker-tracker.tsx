import { cameraColors } from "@vagabonds/ui";
import { useEffect, useMemo } from "react";
import { useCameraPermissions } from "expo-camera";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

import { parseTrackerEvent, type TrackerEvent } from "./mindar";
import { trackerPageHtml } from "./tracker-page";

export interface MarkerTrackerProps {
  /** A compiled `.mind` file, base64. */
  targetsMind: string;
  onEvent: (event: TrackerEvent) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Camera image with marker tracking, in a WebView running MindAR (ADR 0002).
 * Purely visual and hidden from screen readers: the screen around it says
 * what is happening, from the events.
 *
 * The page is given an https base URL so it is a secure context: WebViews only
 * offer getUserMedia to those.
 */
export function MarkerTracker({ targetsMind, onEvent, style }: MarkerTrackerProps) {
  const html = useMemo(() => trackerPageHtml({ targetsMind, markColor: cameraColors.gold }), [targetsMind]);
  const permission = useCameraPermission();

  useEffect(() => {
    if (permission === "denied") onEvent({ type: "error", reason: "camera-denied", message: "Camera permission denied" });
  }, [permission, onEvent]);

  return (
    <View style={[styles.box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {permission === "granted" && (
        <WebView
          source={{ html, baseUrl: "https://localhost/" }}
          originWhitelist={["*"]}
          onError={(e) => onEvent({ type: "error", reason: "unknown", message: `WebView: ${e.nativeEvent.description}` })}
          onMessage={(message) => {
            const event = parseTrackerEvent(message.nativeEvent.data);
            if (event) onEvent(event);
          }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // iOS: the app's camera permission covers the page; no second, per-site prompt.
          mediaCapturePermissionGrantType="grant"
          scrollEnabled={false}
          bounces={false}
          style={styles.webView}
        />
      )}
    </View>
  );
}

/**
 * Asks for the camera before the page does, through Expo's permission module.
 * With React Native's PermissionsAndroid the WebView's camera request never
 * answered in Expo Go (Honor 400, Android 16), likely because Expo Go keeps
 * permissions per project. On iOS this gives one clear prompt before the WebView opens.
 */
function useCameraPermission(): "pending" | "granted" | "denied" {
  const [permission] = useCameraPermissions({ request: true });
  if (permission === null || (!permission.granted && permission.canAskAgain && permission.status === "undetermined")) return "pending";
  return permission.granted ? "granted" : "denied";
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: cameraColors.background,
  },
  webView: {
    flex: 1,
    backgroundColor: cameraColors.background,
  },
});

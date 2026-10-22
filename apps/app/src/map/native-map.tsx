import { useTheme } from "@vagabonds/ui";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import type { AssetMapProps } from "./types";

const DEFAULT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * The same map with react-native-maps (Google Maps on Android, Apple Maps on
 * iOS), for the comparison in ADR 0003. One marker per pin, no clustering.
 */
export function NativeMap({ pins, selectedId, onSelect, onReady, fitPadding = DEFAULT_PADDING, style }: AssetMapProps) {
  const { colors: c } = useTheme();
  const map = useRef<MapView>(null);
  const loaded = useRef(false);

  const fit = () => {
    if (pins.length === 0) return;
    map.current?.fitToCoordinates(
      pins.map((pin) => ({ latitude: pin.lat, longitude: pin.lng })),
      { edgePadding: fitPadding, animated: loaded.current },
    );
  };

  useEffect(fit, [pins]);

  return (
    <View style={[styles.box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView
        ref={map}
        style={styles.box}
        initialRegion={{ latitude: 40.19, longitude: 29.06, latitudeDelta: 0.2, longitudeDelta: 0.2 }}
        toolbarEnabled={false}
        onMapReady={() => {
          fit();
          loaded.current = true;
          onReady?.();
        }}
        onPress={(event) => {
          // On Android a marker tap also reaches the map.
          if (event.nativeEvent.action !== "marker-press") onSelect(null);
        }}
      >
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            pinColor={pin.id === selectedId ? c.highlightMark : c.primary}
            opacity={pin.verified ? 1 : 0.6}
            tracksViewChanges={false}
            onPress={() => onSelect(pin.id)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
  },
});

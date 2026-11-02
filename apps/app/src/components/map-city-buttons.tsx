import { radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import type { CityOption } from "@/data";
import { useScreenReaderEnabled } from "@/lib/use-screen-reader";

/**
 * What the map says in pictures, for those who cannot see or tap it: the map itself is closed to
 * assistive technology, so its cities are real buttons here. On the phone they show while a screen
 * reader runs. The web cannot tell, so they stay out of sight until one takes the keyboard's focus.
 */
export function MapCityButtons({ cities, bottom, onOpen }: { cities: CityOption[]; bottom: number; onOpen: (plate: number) => void }) {
  const { colors: c } = useTheme();
  const screenReader = useScreenReaderEnabled();
  const [focused, setFocused] = useState(false);
  const web = Platform.OS === "web";
  if (!web && !screenReader) return null;
  const shown = !web || focused;

  return (
    <View style={[styles.wrap, { bottom, backgroundColor: c.background }, !shown && styles.hidden]} accessibilityRole="list" accessibilityLabel="Haritadaki şehirler">
      {cities.flatMap((city) => {
        const plate = city.plate;
        if (plate === null) return [];
        return [
          <Pressable
            key={city.code}
            accessibilityRole="button"
            accessibilityLabel={`${city.label}, ${city.assetCount} eser, haritada aç`}
            onPress={() => onOpen(plate)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.city, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <Text variant="label">{city.label}</Text>
          </Pressable>,
        ];
      })}
      <Text variant="caption" color="textSecondary" style={styles.credit}>
        Harita verisi: OpenFreeMap, OpenStreetMap katkıcıları
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
  },
  hidden: {
    right: undefined,
    width: 1,
    height: 1,
    padding: 0,
    overflow: "hidden",
    opacity: 0,
  },
  city: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  credit: {
    width: "100%",
  },
});

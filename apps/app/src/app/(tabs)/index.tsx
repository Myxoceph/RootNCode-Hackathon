import { Button, fontFamily, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { Link } from "expo-router";
import Head from "expo-router/head";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCities } from "@/data";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { MapLibreMap, type MapPin, type MapProvince, type MapProvinces } from "@/map";

/** Room kept free for the header card when framing Turkey. */
const HEADER_SPACE = 120;
const NO_PINS: MapPin[] = [];

/**
 * Harita: Turkey rises out of the fog with every province border drawn quietly;
 * the provinces with assets are outlined in color and named.
 *
 * The map is visual only (ADR 0003): the header says the same in words
 * (which cities have assets), and "Tüm eserler" is the map-free list.
 */
export default function MapScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const cities = useCities();
  const [mapError, setMapError] = useState<string | null>(null);

  const withAssets = cities.status === "success" ? cities.data.filter((city) => city.assetCount > 0) : [];
  const highlighted: MapProvince[] = withAssets.flatMap((city) =>
    city.plate === null ? [] : [{ plate: city.plate, name: city.label, rank: city.assetCount }],
  );
  const highlightedKey = JSON.stringify(highlighted);
  // A new object only when the outlined provinces change; the fog rises once either way.
  const provinces = useMemo<MapProvinces>(
    () => ({ highlighted: JSON.parse(highlightedKey) as MapProvince[], reveal: !reduceMotion }),
    [highlightedKey, reduceMotion],
  );
  const total = withAssets.reduce((sum, city) => sum + city.assetCount, 0);

  return (
    <View style={[styles.screen, { backgroundColor: c.mapBackground }]}>
      <Head>
        <title>Harita · Vagabonds</title>
      </Head>
      <MapLibreMap
        pins={NO_PINS}
        selectedId={null}
        onSelect={() => {}}
        onError={setMapError}
        fitPadding={{ top: insets.top + HEADER_SPACE, right: spacing.lg, bottom: spacing.lg, left: spacing.lg }}
        provinces={provinces}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { top: insets.top + spacing.sm, backgroundColor: c.surface }]}>
        <View style={styles.titleRow}>
          <Text variant="heading" headingLevel={1} style={styles.flex}>
            Türkiye
          </Text>
          {cities.status === "success" && (
            <View style={[styles.count, { backgroundColor: c.surfaceRaised }]}>
              <Text variant="caption" style={styles.mono}>
                {`${withAssets.length} şehir · ${total} eser`}
              </Text>
            </View>
          )}
        </View>
        {cities.status === "loading" && (
          <Text variant="caption" color="textSecondary">
            Eser bulunan şehirler yükleniyor…
          </Text>
        )}
        {cities.status === "success" && withAssets.length > 0 && (
          // The outlined provinces, in words.
          <Text variant="caption" color="textSecondary">
            {`Eser bulunan şehirler: ${withAssets.map((city) => city.label).join(", ")}`}
          </Text>
        )}
        {cities.status === "error" && (
          <View style={styles.errorRow}>
            <Text variant="caption" color="warning" style={styles.flex}>
              {cities.error.message}
            </Text>
            <Button label="Tekrar dene" variant="ghost" onPress={cities.retry} />
          </View>
        )}
        {mapError && (
          <Text variant="caption" color="warning">
            {`Harita çizilemedi: ${mapError}`}
          </Text>
        )}
        <Link href="/monuments" style={styles.link}>
          <Text variant="caption" color="primary" style={styles.underline}>
            Tüm eserler
          </Text>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  mono: {
    fontFamily: fontFamily.monoMedium,
  },
  underline: {
    textDecorationLine: "underline",
  },
  header: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 560,
    alignSelf: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  count: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  link: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Link, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CITY_LANDMARKS, useCities, useCityMapAssets } from "@/data";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { areaAround, cityLandmark, MapLibreMap, type MapCity, type MapPin, type MapProvince, type MapProvinces } from "@/map";

/** Room kept free for the header card when framing Turkey. */
const HEADER_SPACE = 120;
const NO_PINS: MapPin[] = [];

/**
 * Harita: Turkey rises out of the fog with every province border drawn quietly;
 * the provinces with assets are outlined in color and named. Tapping one of them
 * flies into that city: the whole map goes under fog and the city's assets come
 * up above it, marked and named. "Türkiye" (or the back button) returns.
 *
 * The map is visual only (ADR 0003): the header says the same in words
 * (which cities have assets, which one is open), and "Tüm eserler" is the map-free list.
 */
export default function MapScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const cities = useCities();
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<number | null>(null);
  // "/?city=bursa" opens a city straight away: a shareable link on the web.
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();

  const withAssets = cities.status === "success" ? cities.data.filter((city) => city.assetCount > 0) : [];
  const selectedCity = withAssets.find((city) => city.plate === selectedPlate) ?? null;
  const cityAssets = useCityMapAssets(selectedCity?.code ?? null);
  // Only the chosen city's answer counts; a failed request still opens the city, without assets.
  const cityAnswer = cityAssets.status === "success" && cityAssets.data?.city === selectedCity?.code ? cityAssets.data : null;
  const cityReady = cityAnswer !== null || cityAssets.status === "error";
  const located = cityAnswer?.located ?? [];

  const highlighted: MapProvince[] = withAssets.flatMap((city) =>
    city.plate === null ? [] : [{ plate: city.plate, name: city.label, rank: city.assetCount }],
  );
  const cityMarks = located.flatMap((asset) =>
    asset.coordinates ? [{ id: asset.id, title: asset.name, lat: asset.coordinates.lat, lng: asset.coordinates.lng, verified: asset.coordinates.verified }] : [],
  );
  // The city opens on its best-known asset and the streets around it, not on all of it at once.
  const landmark = selectedCity ? cityLandmark(cityMarks, CITY_LANDMARKS[selectedCity.code]) : null;
  // The city goes to the map once its assets are in, so the camera flies only once.
  const mapCity: MapCity | null =
    selectedCity?.plate != null && cityReady
      ? {
          plate: selectedCity.plate,
          assets: cityMarks.map((mark) => ({ ...mark, landmark: mark.id === landmark?.id })),
          focus: landmark ? areaAround(landmark) : null,
        }
      : null;
  // Typed as the map's own props, so a misnamed field fails the typecheck.
  const mapView: Omit<MapProvinces, "reveal"> = { highlighted, city: mapCity };
  const mapKey = JSON.stringify(mapView);
  // A new object only when what the map shows changes; the fog rises once either way.
  const provinces = useMemo<MapProvinces>(
    () => ({ ...(JSON.parse(mapKey) as Omit<MapProvinces, "reveal">), reveal: !reduceMotion }),
    [mapKey, reduceMotion],
  );
  const total = withAssets.reduce((sum, city) => sum + city.assetCount, 0);

  const cityFromParam = cityParam ? withAssets.find((city) => city.code === cityParam)?.plate : undefined;
  useEffect(() => {
    if (cityFromParam != null) setSelectedPlate(cityFromParam);
  }, [cityFromParam]);

  function openCity(plate: number) {
    const city = withAssets.find((candidate) => candidate.plate === plate);
    if (!city) return;
    setSelectedPlate(plate);
    announce(`${city.label} açıldı.`);
  }

  function backToTurkey() {
    setSelectedPlate(null);
    announce("Türkiye haritası.");
  }

  // Android's back button leaves the city before it leaves the screen.
  useEffect(() => {
    if (selectedPlate === null) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelectedPlate(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedPlate]);

  return (
    <View style={[styles.screen, { backgroundColor: c.mapBackground }]}>
      <Head>
        <title>{selectedCity ? `${selectedCity.label} · Harita · Vagabonds` : "Harita · Vagabonds"}</title>
      </Head>
      <MapLibreMap
        pins={NO_PINS}
        selectedId={null}
        onSelect={() => {}}
        onSelectProvince={openCity}
        onError={setMapError}
        fitPadding={{ top: insets.top + HEADER_SPACE, right: spacing.lg, bottom: spacing.lg, left: spacing.lg }}
        provinces={provinces}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { top: insets.top + spacing.sm, backgroundColor: c.surface }]}>
        {selectedCity ? (
          <>
            <View style={styles.titleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Türkiye haritasına dön"
                onPress={backToTurkey}
                hitSlop={8}
                style={[styles.back, { backgroundColor: c.surfaceRaised }]}
              >
                <Ionicons name="chevron-back" size={20} color={c.text} />
              </Pressable>
              <Text variant="heading" headingLevel={1} style={styles.flex}>
                {selectedCity.label}
              </Text>
              <View style={[styles.count, { backgroundColor: c.surfaceRaised }]}>
                <Text variant="caption" style={styles.mono}>
                  {`${selectedCity.assetCount} eser`}
                </Text>
              </View>
            </View>
            <Text variant="caption" color={cityAssets.status === "error" ? "warning" : "textSecondary"} accessibilityLiveRegion="polite">
              {!cityReady
                ? "Eserlerin konumları yükleniyor…"
                : cityAssets.status === "error"
                  ? cityAssets.error.message
                  : located.length === 0
                    ? "Bu şehirdeki eserlerin konumları henüz eklenmedi."
                    : `${located.length} eser haritada${located.length < selectedCity.assetCount ? ` · ${selectedCity.assetCount - located.length} eserin konumu henüz yok` : ""}`}
            </Text>
            {cityAssets.status === "error" && <Button label="Tekrar dene" variant="ghost" onPress={cityAssets.retry} />}
            <Link href={{ pathname: "/monuments", params: { city: selectedCity.code } }} style={styles.link}>
              <Text variant="caption" color="primary" style={styles.underline}>
                {`${selectedCity.label} eserlerinin listesi`}
              </Text>
            </Link>
          </>
        ) : (
          <>
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
              // The outlined provinces, in words; each one opens like a tap on the map.
              <View style={styles.cityRow}>
                <Text variant="caption" color="textSecondary">
                  Eser bulunan şehirler:
                </Text>
                {withAssets.map((city) =>
                  city.plate === null ? null : (
                    <Pressable
                      key={city.code}
                      accessibilityRole="button"
                      accessibilityLabel={`${city.label}, ${city.assetCount} eser. Haritada aç`}
                      onPress={() => openCity(city.plate!)}
                      style={styles.cityLink}
                    >
                      <Text variant="caption" color="primary" style={styles.underline}>
                        {city.label}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            )}
            {cities.status === "error" && (
              <View style={styles.errorRow}>
                <Text variant="caption" color="warning" style={styles.flex}>
                  {cities.error.message}
                </Text>
                <Button label="Tekrar dene" variant="ghost" onPress={cities.retry} />
              </View>
            )}
            <Link href="/monuments" style={styles.link}>
              <Text variant="caption" color="primary" style={styles.underline}>
                Tüm eserler
              </Text>
            </Link>
          </>
        )}
        {mapError && (
          <Text variant="caption" color="warning">
            {`Harita çizilemedi: ${mapError}`}
          </Text>
        )}
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
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  count: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  cityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.sm,
  },
  cityLink: {
    minHeight: touchTarget.min,
    justifyContent: "center",
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

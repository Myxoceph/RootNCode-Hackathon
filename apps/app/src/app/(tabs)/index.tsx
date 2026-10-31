import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CityAssetCards } from "@/components/city-asset-cards";
import { CITY_LANDMARKS, useCities, useCityMapAssets } from "@/data";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { areaAround, assetCategory, cityLandmark, MapLibreMap, mapTiers, type MapCity, type MapPin, type MapProvince, type MapProvinces } from "@/map";

/** Room kept free for the header card when framing Turkey. */
const HEADER_SPACE = 120;
/** Room kept free for the city's top bar and its cards. */
const CITY_TOP_SPACE = 72;
const CITY_CARDS_SPACE = 136;
const NO_PINS: MapPin[] = [];

/** Squared distance in degrees: enough to order a city's assets outward from its landmark. */
function nearness(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  return (from.lat - to.lat) ** 2 + (from.lng - to.lng) ** 2;
}

/**
 * Harita: Turkey rises out of the fog with every province border drawn quietly;
 * the provinces with assets are outlined in color and named. Tapping one of them
 * flies into that city, onto its best-known asset: a light mist falls over the map and
 * each asset waits on its own cloud as a locked seal; their cards line up at the bottom.
 * Choosing on the map or swiping the cards moves both. The back button returns.
 *
 * The map is visual only (ADR 0003): the header says the same in words
 * (which cities have assets, which one is open) and the cards list the city's assets.
 */
export default function MapScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const cities = useCities();
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<number | null>(null);
  const [chosenAsset, setChosenAsset] = useState<string | null>(null);
  // "/?city=bursa" opens a city straight away: a shareable link on the web.
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();

  const withAssets = cities.status === "success" ? cities.data.filter((city) => city.assetCount > 0) : [];
  const selectedCity = withAssets.find((city) => city.plate === selectedPlate) ?? null;
  const cityAssets = useCityMapAssets(selectedCity?.code ?? null);
  // Only the chosen city's answer counts; a failed request still opens the city, without assets.
  const cityAnswer = cityAssets.status === "success" && cityAssets.data?.city === selectedCity?.code ? cityAssets.data : null;
  const cityReady = cityAnswer !== null || cityAssets.status === "error";

  const highlighted: MapProvince[] = withAssets.flatMap((city) =>
    city.plate === null ? [] : [{ plate: city.plate, name: city.label, rank: city.assetCount }],
  );
  const located = useMemo(() => (cityAnswer?.located ?? []).flatMap((asset) => (asset.coordinates ? [{ asset, at: asset.coordinates }] : [])), [cityAnswer]);
  // A complex stands for its buildings: a building whose complex is on the map is not marked on its own,
  // and the complex is as well known as its best-known building.
  const { places, buildingsOf, prominenceOf } = useMemo(() => {
    const onMap = new Set(located.map(({ asset }) => asset.id));
    const counts = new Map<string, number>();
    const prominence = new Map<string, number>();
    for (const { asset } of located) {
      const place = asset.parentId && onMap.has(asset.parentId) ? asset.parentId : asset.id;
      if (place !== asset.id) counts.set(place, (counts.get(place) ?? 0) + 1);
      prominence.set(place, Math.max(prominence.get(place) ?? 0, asset.prominence));
    }
    return { places: located.filter(({ asset }) => !(asset.parentId && onMap.has(asset.parentId))), buildingsOf: counts, prominenceOf: prominence };
  }, [located]);
  // The city opens on its best-known asset and the streets around it, not on all of it at once;
  // a landmark that is a building of a complex opens on the complex.
  const landmarkId = selectedCity ? CITY_LANDMARKS[selectedCity.code] : undefined;
  const landmarkParent = located.find(({ asset }) => asset.id === landmarkId)?.asset.parentId;
  const landmark = selectedCity
    ? cityLandmark(
        places.map(({ asset, at }) => ({ id: asset.id, ...at })),
        landmarkParent && buildingsOf.has(landmarkParent) ? landmarkParent : landmarkId,
      )
    : null;
  // The cards start at the landmark and walk outwards from it.
  const cards = useMemo(
    () => (landmark ? [...places].sort((a, b) => nearness(a.at, landmark) - nearness(b.at, landmark)) : places).map(({ asset }) => asset),
    [places, landmark],
  );
  // Zooming out, the least known places go first; the landmark stays to the last.
  const tiers = useMemo(
    () => mapTiers(places.map(({ asset }) => ({ id: asset.id, prominence: prominenceOf.get(asset.id) ?? 0 })), landmark?.id),
    [places, prominenceOf, landmark?.id],
  );
  // The city goes to the map once its assets are in, so the camera flies only once.
  const mapCity: MapCity | null =
    selectedCity?.plate != null && cityReady
      ? {
          plate: selectedCity.plate,
          assets: places.map(({ asset, at }) => ({
            id: asset.id,
            title: asset.name,
            lat: at.lat,
            lng: at.lng,
            category: assetCategory(asset.type.code),
            landmark: asset.id === landmark?.id,
            tier: tiers.get(asset.id) ?? 0,
          })),
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

  // Each city opens with its landmark chosen.
  const openingId = landmark?.id ?? null;
  useEffect(() => setChosenAsset(openingId), [openingId]);

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

  const missing = selectedCity ? selectedCity.assetCount - located.length : 0;
  const cityStatus = mapError
    ? `Harita çizilemedi: ${mapError}`
    : !cityReady
      ? "Eserlerin konumları yükleniyor…"
      : cityAssets.status === "error"
        ? cityAssets.error.message
        : located.length === 0
          ? "Bu şehirdeki eserlerin konumları henüz eklenmedi."
          : `${located.length} eser haritada${missing > 0 ? ` · ${missing} eserin konumu yok` : ""}`;
  const fitPadding = selectedCity
    ? { top: insets.top + CITY_TOP_SPACE, right: spacing.lg, bottom: CITY_CARDS_SPACE, left: spacing.lg }
    : { top: insets.top + HEADER_SPACE, right: spacing.lg, bottom: spacing.lg, left: spacing.lg };

  return (
    <View style={[styles.screen, { backgroundColor: c.mapBackground }]}>
      <Head>
        <title>{selectedCity ? `${selectedCity.label} · Harita · Vagabonds` : "Harita · Vagabonds"}</title>
      </Head>
      <MapLibreMap
        pins={NO_PINS}
        selectedId={selectedCity ? chosenAsset : null}
        onSelect={(id) => id && setChosenAsset(id)}
        onSelectProvince={openCity}
        onLeaveCity={backToTurkey}
        onError={setMapError}
        fitPadding={fitPadding}
        provinces={provinces}
        style={StyleSheet.absoluteFill}
      />

      {selectedCity ? (
        <>
          <View style={[styles.bar, { top: insets.top + spacing.sm, backgroundColor: c.surface }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Türkiye haritasına dön"
              onPress={backToTurkey}
              hitSlop={4}
              style={[styles.round, { backgroundColor: c.surfaceRaised }]}
            >
              <Ionicons name="chevron-back" size={20} color={c.text} />
            </Pressable>
            <View style={styles.flex}>
              <Text variant="label" headingLevel={1} numberOfLines={1}>
                {selectedCity.label}
              </Text>
              <Text
                variant="caption"
                color={cityAssets.status === "error" || mapError ? "warning" : "textSecondary"}
                numberOfLines={1}
                accessibilityLiveRegion="polite"
              >
                {cityStatus}
              </Text>
            </View>
            {cityAssets.status === "error" ? (
              <Button label="Tekrar dene" variant="ghost" onPress={cityAssets.retry} />
            ) : (
              // Not a `Link asChild`: that throws on this button's style.
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${selectedCity.label} eserlerinin listesi`}
                onPress={() => router.push({ pathname: "/monuments", params: { city: selectedCity.code } })}
                hitSlop={4}
                style={[styles.round, { backgroundColor: c.surfaceRaised }]}
              >
                <Ionicons name="list" size={20} color={c.text} />
              </Pressable>
            )}
          </View>
          {cards.length > 0 && (
            <View style={styles.cards}>
              <CityAssetCards assets={cards} buildingsOf={buildingsOf} selectedId={chosenAsset} onSelect={setChosenAsset} />
            </View>
          )}
        </>
      ) : (
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
          {mapError && (
            <Text variant="caption" color="warning">
              {`Harita çizilemedi: ${mapError}`}
            </Text>
          )}
        </View>
      )}
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
  bar: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 560,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.full,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  round: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cards: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
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

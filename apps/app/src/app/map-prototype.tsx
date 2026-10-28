import { Button, Card, fontFamily, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { Link, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CityPicker } from "@/components/city-picker";
import { useCities, useMapAssets } from "@/data";
import { MapLibreMap, type MapPin } from "@/map";

/**
 * Map prototype for the decision record (Y6, ADR 0003): published assets with
 * coordinates on the MapLibre map. Reached from the Kamera tab in development,
 * like the AR prototype.
 */
export default function MapPrototypeScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [city, setCity] = useState<string | undefined>("bursa");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const started = useRef(Date.now());

  const cities = useCities();
  const assets = useMapAssets(city);
  // `data` keeps its identity between renders; the pins must too, or the map redraws them every time.
  const data = assets.status === "success" ? assets.data : null;
  const pins = useMemo<MapPin[]>(
    () =>
      (data?.located ?? []).map((a) => ({
        id: a.id,
        lat: a.coordinates!.lat,
        lng: a.coordinates!.lng,
        title: a.name,
        verified: a.coordinates!.verified,
      })),
    [data],
  );
  const selected = data?.located.find((a) => a.id === selectedId) ?? null;

  const onReady = useCallback(() => setReadyMs(Date.now() - started.current), []);

  const count =
    assets.status === "success"
      ? `${assets.data.located.length} / ${assets.data.total} eserin koordinatı var`
      : assets.status === "loading"
        ? "Eserler yükleniyor…"
        : assets.error.message;

  return (
    <View style={[styles.screen, { backgroundColor: c.mapBackground }]}>
      <Head>
        <title>Harita prototipi · Vagabonds</title>
      </Head>
      <MapLibreMap
        pins={pins}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onReady={onReady}
        onError={setMapError}
        fitPadding={{ top: insets.top + 140, right: 32, bottom: insets.bottom + 220, left: 32 }}
        style={StyleSheet.absoluteFill}
      />

      <Card style={[styles.top, { top: insets.top + spacing.sm }]}>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Geri"
            onPress={() => (router.canGoBack() ? router.back() : router.navigate("/camera"))}
            style={styles.back}
          >
            <Text variant="label" color="primary">
              ‹ Geri
            </Text>
          </Pressable>
          <Text variant="heading" headingLevel={1} style={styles.flex}>
            Harita prototipi
          </Text>
        </View>
        {cities.status === "success" && (
          <CityPicker
            cities={cities.data}
            selected={city}
            onSelect={(code) => {
              setCity(code);
              setSelectedId(null);
            }}
          />
        )}
      </Card>

      <Card style={[styles.bottom, { bottom: insets.bottom + spacing.sm }]}>
        <View accessibilityLiveRegion="polite">
          {selected ? (
            <>
              <Text variant="heading">{selected.name}</Text>
              <Text color="textSecondary">{[selected.type.label, selected.district, selected.city.label].filter(Boolean).join(" · ")}</Text>
              {!selected.coordinates?.verified && (
                <Text variant="caption" color="textSecondary">
                  Konum yaklaşık; yerinde doğrulanmadı.
                </Text>
              )}
            </>
          ) : (
            <Text color="textSecondary">Bir esere dokun.</Text>
          )}
        </View>
        {selected && (
          <Button label="Eseri aç" onPress={() => router.push({ pathname: "/monuments/[id]", params: { id: selected.id } })} />
        )}
        <Link href={{ pathname: "/monuments", params: city ? { city } : {} }} style={[styles.link, { color: c.primary }]}>
          Haritasız: listede göster
        </Link>
        <View style={styles.metrics}>
          <Text variant="caption" color="textSecondary" style={styles.mono}>
            {count}
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.mono}>
            {mapError ? `Hata: ${mapError}` : readyMs === null ? "Harita açılıyor…" : `Harita ${(readyMs / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn'de çizildi`}
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  top: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.xs,
    padding: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  back: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  },
  bottom: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.sm,
    borderRadius: radius.xl,
  },
  link: {
    minHeight: 44,
    textDecorationLine: "underline",
    textAlignVertical: "center",
  },
  metrics: {
    gap: spacing.xxs,
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
});

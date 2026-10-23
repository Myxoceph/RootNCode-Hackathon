import type { AssetSummary } from "@vagabonds/contracts";
import { Button, fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Link, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAsset, useRelationsOf } from "@/data";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { MapLibreMap, type MapNetwork, type MapPin } from "@/map";
import { linkColor, linkGroupLabel, networkOf, type NetworkLink } from "@/map/urban-network";

/** The game starts with Ulucami found: the city's best-linked monument. */
const START = "bursa-osmangazi-ulucami";
/** Fog radius around a found asset, in meters. */
const CLEAR_RADIUS = 260;
/** Room kept free for the header card and the bottom sheet when fitting the map. */
const HEADER_SPACE = 150;
const SHEET_SPACE = 270;

/**
 * Harita (module 3): the city starts under a "history fog". Each found asset
 * clears its fog and points, with a dashed gold trail, to a linked asset still
 * hidden. Finding it draws the link in its relation's color. Assets and links
 * come from the API; the relations of an asset are fetched once it is found.
 *
 * The map is visual only (ADR 0003): the sheet below says what is selected and
 * offers the next step, and "Tüm eserler" is the map-free list.
 */
export default function MapScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const router = useRouter();

  const start = useAsset(START);
  const [found, setFound] = useState<string[]>([START]);
  const [selected, setSelected] = useState(START);
  const [lastLink, setLastLink] = useState<NetworkLink | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const relations = useRelationsOf(found);

  const { links, reached } = networkOf(found, relations.byId);
  const assets: Record<string, AssetSummary> = { ...reached };
  if (start.status === "success" && start.data) assets[START] = start.data;
  const isFound = (id: string) => found.includes(id);
  const nameOf = (id: string) => assets[id]?.name ?? id;

  const drawn = links.filter((l) => l.ends.every(isFound));
  const hints = links.filter((l) => !l.ends.every(isFound));
  const hidden = [...new Set(hints.map((l) => l.ends[1]))];
  const nextHint = hints.find((l) => l.ends.includes(selected)) ?? hints[0];
  const target = nextHint?.ends[1] ?? null;

  const pins: MapPin[] = [
    ...found.map((id) => ({ id, mark: "found" as const })),
    ...hidden.map((id) => ({ id, mark: "hint" as const })),
  ].flatMap(({ id, mark }) => {
    const coordinates = assets[id]?.coordinates;
    return coordinates ? [{ id, lat: coordinates.lat, lng: coordinates.lng, title: nameOf(id), verified: coordinates.verified, mark }] : [];
  });
  const where = (id: string) => assets[id]?.coordinates ?? null;
  const network: MapNetwork = {
    clearings: found.flatMap((id) => {
      const point = where(id);
      return point ? [{ id, lat: point.lat, lng: point.lng }] : [];
    }),
    clearRadius: CLEAR_RADIUS,
    links: [...drawn, ...hints].flatMap((l) => {
      const from = where(l.ends[0]);
      const to = where(l.ends[1]);
      if (!from || !to) return [];
      const dashed = !l.ends.every(isFound);
      return [{ from, to, color: dashed ? c.highlightMark : linkColor(l.group, c), dashed }];
    }),
    motion: !reduceMotion,
  };

  function reveal(id: string) {
    setSelected(id);
    if (isFound(id)) {
      setLastLink(null);
      return;
    }
    const link = hints.find((l) => l.ends[1] === id) ?? null;
    setFound((list) => [...list, id]);
    setLastLink(link);
    announce(`${nameOf(id)} çözüldü.${link ? ` ${linkGroupLabel[link.group]} bağı tamamlandı.` : ""}`);
  }

  function reset() {
    setFound([START]);
    setSelected(START);
    setLastLink(null);
  }

  const sel = assets[selected];
  const kicker = lastLink ? `Hat tamamlandı · ${linkGroupLabel[lastLink.group]}` : "Çözüldü";
  let next: string;
  if (nextHint) next = `${lastLink ? "Sıradaki · " : ""}${linkGroupLabel[nextHint.group]}: ${nextHint.description}`;
  else if (relations.loading.length > 0) next = "Bağlar yükleniyor…";
  else if (relations.failed.length > 0) next = "Bazı eserlerin bağları yüklenemedi.";
  else next = "Açılan eserlerden çıkan başka bağ kalmadı.";

  return (
    <View style={[styles.screen, { backgroundColor: c.mapBackground }]}>
      <Head>
        <title>Harita · Vagabonds</title>
      </Head>
      <MapLibreMap
        pins={pins}
        selectedId={selected}
        onSelect={(id) => id && reveal(id)}
        onError={setMapError}
        fitPadding={{ top: insets.top + HEADER_SPACE, right: 32, bottom: SHEET_SPACE, left: 32 }}
        network={network}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { top: insets.top + spacing.sm }]}>
        <View style={[styles.search, { backgroundColor: c.surface }]}>
          <View style={styles.flex}>
            <Text variant="heading" headingLevel={1}>
              Bursa
            </Text>
            <Text variant="caption" color="textSecondary">
              Tarih sisi açılıyor
            </Text>
          </View>
          <View style={[styles.progress, { backgroundColor: c.surfaceRaised }]}>
            <Text variant="caption" style={styles.mono}>
              {`${found.length} eser · ${drawn.length} bağ`}
            </Text>
          </View>
        </View>
        <View style={styles.legend}>
          {(["revenue", "patron", "style"] as const).map((group) => (
            <View key={group} style={[styles.chip, { backgroundColor: c.surface }]}>
              <View style={[styles.dot, { backgroundColor: linkColor(group, c) }]} />
              <Text variant="caption">{linkGroupLabel[group]}</Text>
            </View>
          ))}
          <Link href="/monuments" style={[styles.chip, { backgroundColor: c.surface }]}>
            <Text variant="caption" color="primary" style={styles.underline}>
              Tüm eserler
            </Text>
          </Link>
        </View>
      </View>

      <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLiveRegion="polite">
        <View style={[styles.grip, { backgroundColor: c.border }]} />
        {start.status === "loading" && <ActivityIndicator color={c.primary} accessibilityLabel="Yükleniyor" />}
        {start.status === "error" && (
          <>
            <Text variant="heading" headingLevel={2}>
              Veriler yüklenemedi
            </Text>
            <Text variant="caption" color="textSecondary">
              {start.error.message}
            </Text>
            <Button label="Tekrar dene" onPress={start.retry} />
          </>
        )}
        {start.status === "success" && sel && (
          <>
            <Text variant="overline" colorValue={lastLink ? c.text : c.highlight}>
              {kicker.toLocaleUpperCase("tr-TR")}
            </Text>
            <Text variant="heading" headingLevel={2}>
              {sel.name}
            </Text>
            <Text variant="caption" color="textSecondary" style={styles.mono}>
              {[sel.type.label, sel.datingDisplay].filter(Boolean).join(" · ")}
            </Text>
            {lastLink && <Text variant="caption">{lastLink.description}</Text>}
            <Text variant="caption" color="textSecondary">
              {next}
            </Text>
            {relations.failed.length > 0 && (
              <Pressable accessibilityRole="button" onPress={relations.retry} style={styles.reset}>
                <Text variant="caption" color="primary" style={styles.underline}>
                  Bağları yeniden yükle
                </Text>
              </Pressable>
            )}
            <View style={styles.row}>
              {target && <Button label={`${nameOf(target)} · sisi aç`} onPress={() => reveal(target)} style={styles.flex} />}
              <Button label="Eser kartı" variant="ghost" onPress={() => router.push(`/monuments/${selected}`)} />
            </View>
            {found.length > 1 && (
              <Pressable accessibilityRole="button" onPress={reset} style={styles.reset}>
                <Text variant="caption" color="primary" style={styles.underline}>
                  Sisi geri çök
                </Text>
              </Pressable>
            )}
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
    gap: spacing.sm,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
  },
  progress: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sheet: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.xl + 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reset: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
});

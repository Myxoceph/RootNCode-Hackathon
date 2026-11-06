import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import {
  cameraColors,
  palette,
  radius,
  spacing,
  Text,
  useTheme,
} from "@vagabonds/ui";
import { Link } from "expo-router";
import Head from "expo-router/head";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useMessages } from "@/i18n";
import { AssetImage } from "@/components/asset-image";
import { useSearchableAssets } from "@/data";
import { bottomInset } from "@/lib/bottom-inset";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import {
  useWideWeb,
  WIDE_PAGE,
  WIDE_PAGE_PADDING,
  wideColumn,
} from "@/lib/use-wide-web";

const COLUMN = 560;
const TILE_RATIO = 1.3;
const STAMP = 34;

/**
 * Profil · Mühürlenen eserler: the assets the visitor has unlocked, as photos with a gold stamp in
 * the corner. Each opens its eser kartı over this page.
 */
export default function SealedAssetsScreen() {
  const m = useMessages();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const unlocked = useUnlockedAssets();
  const resource = useSearchableAssets(unlocked.size > 0);
  const assets =
    resource.status === "success" && resource.data
      ? resource.data.filter((asset) => unlocked.has(asset.id))
      : [];
  // A wide web page: four photos a row in the wider column.
  const wide = useWideWeb();
  const tile = wide
    ? (Math.min(width, WIDE_PAGE) - WIDE_PAGE_PADDING * 2 - spacing.sm * 3) / 4
    : (Math.min(width, COLUMN) - spacing.lg * 2 - spacing.sm) / 2;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[
        styles.content,
        wide && wideColumn,
        { paddingBottom: bottomInset(insets.bottom) + spacing.xl },
      ]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Head>
        <title>{m.common.title(m.screens.sealed)}</title>
      </Head>

      {unlocked.size === 0 && <Empty />}
      {unlocked.size > 0 && resource.status === "loading" && (
        <ActivityIndicator
          color={c.textSecondary}
          accessibilityLabel={m.monuments.loading}
        />
      )}
      {resource.status === "error" && (
        <Pressable
          accessibilityRole="button"
          onPress={resource.retry}
          style={styles.error}
        >
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {`${resource.error.message} ${m.common.tapToRetry}`}
          </Text>
        </Pressable>
      )}
      {assets.length > 0 && (
        <>
          <View accessibilityRole="list" style={styles.tiles}>
            {assets.map((asset) => (
              <Tile key={asset.id} asset={asset} width={tile} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Empty() {
  const { colors: c } = useTheme();
  const w = useMessages().sealed;
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyMark, { borderColor: c.highlightMark }]}>
        <Ionicons
          name="shield-checkmark-outline"
          size={26}
          color={c.highlight}
        />
      </View>
      <Text variant="heading" style={styles.centered}>
        {w.emptyTitle}
      </Text>
      <Text color="textSecondary" style={styles.centered}>
        {w.emptyBody}
      </Text>
    </View>
  );
}

function Tile({ asset, width }: { asset: AssetSummary; width: number }) {
  const w = useMessages().sealed;
  const place = `${asset.district}, ${asset.city.label}`;
  return (
    <Link href={{ pathname: "/asset/[id]", params: { id: asset.id } }} asChild>
      {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${asset.name}, ${place}, ${w.opensCard}`}
        style={StyleSheet.flatten([
          styles.tile,
          { width, height: width * TILE_RATIO },
        ])}
      >
        {asset.cover && <AssetImage media={asset.cover} decorative fill />}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient
                id={`sealed-${asset.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop
                  offset="0.35"
                  stopColor={cameraColors.background}
                  stopOpacity={0}
                />
                <Stop
                  offset="1"
                  stopColor={cameraColors.background}
                  stopOpacity={0.94}
                />
              </LinearGradient>
            </Defs>
            <Rect
              width="100%"
              height="100%"
              fill={`url(#sealed-${asset.id})`}
            />
          </Svg>
        </View>
        <View style={styles.stamp}>
          <Ionicons
            name="shield-checkmark"
            size={18}
            color={cameraColors.onGold}
          />
        </View>
        <View style={styles.words}>
          <Text
            variant="label"
            colorValue={cameraColors.text}
            numberOfLines={2}
          >
            {asset.name}
          </Text>
          <Text
            variant="caption"
            colorValue={cameraColors.textSecondary}
            numberOfLines={1}
          >
            {place}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: COLUMN,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  centered: {
    textAlign: "center",
  },
  error: {
    padding: spacing.md,
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
  },
  emptyMark: {
    width: 64,
    height: 64,
    marginBottom: spacing.xs,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: palette.gece800,
  },
  stamp: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: STAMP,
    height: STAMP,
    borderRadius: STAMP / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cameraColors.gold,
  },
  words: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
  },
});

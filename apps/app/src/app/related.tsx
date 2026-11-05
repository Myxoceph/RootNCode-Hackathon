import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  AssetRelationsResponse,
  AssetSummary,
} from "@vagabonds/contracts";
import {
  cameraColors,
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { ResourceView } from "@/components/resource-view";
import { WebPageHeader } from "@/components/web-nav-bar";
import { useAsset, useAssetRelations } from "@/data";
import {
  isAssetUnlocked,
  LOCKED_WARNING,
  relatedAssetsOf,
  type RelatedAsset,
} from "@/lib/related-assets";
import { webTransition } from "@/lib/web-transition";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import {
  useWideWeb,
  WIDE_PAGE,
  WIDE_PAGE_PADDING,
  wideColumn,
} from "@/lib/use-wide-web";

/** On a photo, under its dark fade: the same in every theme. */
const onPhoto = {
  text: cameraColors.text,
  soft: cameraColors.textSecondary,
  gold: cameraColors.gold,
  fade: cameraColors.background,
  glass: "rgba(10, 14, 22, 0.62)",
  /** Over a locked photo: it shows, but as something still to be reached. */
  shut: "rgba(10, 14, 22, 0.5)",
  /** Where there is no photo, so the words stay as they are. */
  blank: palette.gece800,
};
const COLUMN = 640;
const PHOTO_HEIGHT = 176;
const TILE_RATIO = 1.25;
const WEB = Platform.OS === "web";
/** On a wide web page: the open cards two to a row, the locked tiles five. */
const WIDE_TILES = 5;
const WIDE_PHOTO_HEIGHT = 220;

/**
 * The assets an asset is related to, photos first. What joins the two stays hidden until the other
 * asset is unlocked: the open ones are large cards that say it, the locked ones small tiles to go and
 * find. The bar on top says how far the visitor has come.
 */
export default function RelatedScreen() {
  const { asset: id, name } = useLocalSearchParams<{
    asset?: string;
    name?: string;
  }>();
  const resource = useAssetRelations(id ?? "");
  const record = useAsset(id ?? "");
  const unlocked = useUnlockedAssets();
  const { colors: c } = useTheme();
  // A link can bring the visitor here past the card's button: the list stays shut for them too.
  const locked =
    record.status === "success" &&
    record.data !== null &&
    !isAssetUnlocked(record.data, unlocked);
  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <Head>
        <title>{`${name ? `${name}: ` : ""}İlişkili eserler · Vagabonds`}</title>
      </Head>
      {WEB ? (
        <WebPageHeader
          title={name ? `${name}: ilişkili eserler` : "İlişkili eserler"}
          section="monuments"
          back={{
            label: name ?? "Eser",
            href: id
              ? { pathname: "/monuments/[id]", params: { id } }
              : "/monuments",
          }}
        />
      ) : (
        <TopBar asset={id} />
      )}
      {locked ? (
        <Locked />
      ) : (
        <ResourceView resource={resource}>
          {(relations) => <Related relations={relations} name={name} />}
        </ResourceView>
      )}
    </View>
  );
}

function TopBar({ asset }: { asset?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (asset)
      router.replace({ pathname: "/monuments/[id]", params: { id: asset } });
    else router.replace("/monuments");
  };
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={6}
        onPress={back}
        style={[styles.back, { backgroundColor: c.surfaceRaised }]}
      >
        <Ionicons name="chevron-back" size={22} color={c.text} />
      </Pressable>
    </View>
  );
}

function Locked() {
  const { colors: c } = useTheme();
  return (
    <View style={styles.shutPage}>
      <View style={[styles.shutMark, { borderColor: c.highlightMark }]}>
        <Ionicons name="lock-closed" size={26} color={c.highlight} />
      </View>
      <Text
        variant="heading"
        accessibilityLiveRegion="polite"
        style={styles.center}
      >
        {LOCKED_WARNING}
      </Text>
    </View>
  );
}

function Related({
  relations,
  name,
}: {
  relations: AssetRelationsResponse | null;
  name?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const unlocked = useUnlockedAssets();
  const related = relations ? relatedAssetsOf(relations.items) : [];
  const opened = related.filter((entry) =>
    isAssetUnlocked(entry.asset, unlocked),
  );
  const closed = related.filter(
    (entry) => !isAssetUnlocked(entry.asset, unlocked),
  );
  const wide = useWideWeb();
  const tile = wide
    ? (Math.min(width, WIDE_PAGE) -
        WIDE_PAGE_PADDING * 2 -
        spacing.md * (WIDE_TILES - 1)) /
      WIDE_TILES
    : (Math.min(width - spacing.lg * 2, COLUMN) - spacing.sm) / 2;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        wide && styles.pageWide,
        { paddingBottom: insets.bottom + spacing.xxxl },
      ]}
    >
      <View style={[styles.column, wide && [wideColumn, styles.columnWide]]}>
        {/* On the web the site's header names the page; the bar says how far the visitor has come. */}
        {WEB ? (
          related.length > 0 && (
            <Progress opened={opened.length} total={related.length} />
          )
        ) : (
          <View style={styles.intro}>
            {name && (
              <Text variant="overline" color="highlight">
                {name.toLocaleUpperCase("tr")}
              </Text>
            )}
            <Text variant="display" headingLevel={1}>
              Bu eserin ilişkili olduğu eserler
            </Text>
            {related.length > 0 && (
              <Progress opened={opened.length} total={related.length} />
            )}
          </View>
        )}

        {related.length === 0 && (
          <Text color="textSecondary">Bu eserin kayıtlı bir ilişkisi yok.</Text>
        )}

        {opened.length > 0 && (
          <View style={styles.section}>
            <Text variant="overline" headingLevel={2} color="textSecondary">
              AÇILAN İLİŞKİLER
            </Text>
            <View style={wide && styles.openGrid}>
              {opened.map((entry) => (
                <OpenCard key={entry.asset.id} entry={entry} wide={wide} />
              ))}
            </View>
          </View>
        )}

        {closed.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text variant="overline" headingLevel={2} color="textSecondary">
                KİLİTLİ
              </Text>
              <Text variant="caption" color="textSecondary">
                Kilidini açtıkça ilişkisi burada görünür.
              </Text>
            </View>
            <View style={[styles.tiles, wide && styles.tilesWide]}>
              {closed.map((entry) => (
                <LockedTile
                  key={entry.asset.id}
                  asset={entry.asset}
                  width={tile}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Progress({ opened, total }: { opened: number; total: number }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityLabel={`${total} eserden ${opened} ilişki açıldı`}
    >
      <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: c.highlightMark,
              width: `${(opened / total) * 100}%`,
            },
          ]}
        />
      </View>
      <Text variant="caption" color="textSecondary" style={styles.semibold}>
        {`${opened} / ${total} açıldı`}
      </Text>
    </View>
  );
}

function metaOf(asset: AssetSummary): string {
  return [asset.type.label, asset.district].join(" · ");
}

/** The way into an asset's card, in the shape the list gives it. */
function useOpenAsset(asset: AssetSummary) {
  const router = useRouter();
  return () =>
    router.push({ pathname: "/asset/[id]", params: { id: asset.id } });
}

/** An asset unlocked: its photo large with its name on it, and under it what joins the two. */
function OpenCard({
  entry,
  wide = false,
}: {
  entry: RelatedAsset;
  wide?: boolean;
}) {
  const { asset, reasons } = entry;
  const { colors: c } = useTheme();
  const open = useOpenAsset(asset);
  const said = reasons
    .map((reason) => `${reason.type.label}: ${reason.description}`)
    .join(" ");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${asset.name}, ${metaOf(asset)}. ${said}`}
      accessibilityHint="Eserin kartını açar"
      onPress={open}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.card,
        wide && styles.cardWide,
        {
          backgroundColor: c.surface,
          borderColor: hovered || pressed ? c.highlightMark : c.border,
        },
        wide && hovered && styles.lifted,
      ]}
    >
      <View style={[styles.cardPhoto, wide && { height: WIDE_PHOTO_HEIGHT }]}>
        <Photo asset={asset} />
        <Fade id={`open-${asset.id}`} />
        <View style={styles.onPhoto}>
          <Text variant="heading" colorValue={onPhoto.text} numberOfLines={2}>
            {asset.name}
          </Text>
          <Text variant="caption" colorValue={onPhoto.soft} numberOfLines={1}>
            {metaOf(asset)}
          </Text>
        </View>
      </View>
      <View style={styles.reasons}>
        {reasons.map((reason, index) => (
          <View key={`${reason.type.code}-${index}`} style={styles.reason}>
            <View style={styles.kind}>
              <Ionicons name="link" size={14} color={c.highlight} />
              <Text variant="caption" color="highlight" style={styles.semibold}>
                {reason.type.label}
              </Text>
            </View>
            <Text>{reason.description}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** An asset still locked: a small dimmed photo, its name and a padlock; what joins the two stays unsaid. */
function LockedTile({ asset, width }: { asset: AssetSummary; width: number }) {
  const { colors: c } = useTheme();
  const open = useOpenAsset(asset);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${asset.name}, ${metaOf(asset)}. Kilitli: ilişkisi, bu eserin kilidi açılınca görünür.`}
      accessibilityHint="Eserin kartını açar"
      onPress={open}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.tile,
        {
          width,
          height: width * TILE_RATIO,
          borderColor: hovered || pressed ? c.highlightMark : c.border,
        },
      ]}
    >
      <Photo asset={asset} />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: onPhoto.shut }]}
      />
      <Fade id={`shut-${asset.id}`} />
      <View style={styles.padlock}>
        <Ionicons name="lock-closed" size={14} color={onPhoto.gold} />
      </View>
      <View style={styles.onPhoto}>
        <Text
          variant="label"
          colorValue={onPhoto.text}
          numberOfLines={3}
          style={styles.semibold}
        >
          {asset.name}
        </Text>
        <Text variant="caption" colorValue={onPhoto.soft} numberOfLines={1}>
          {asset.district}
        </Text>
      </View>
    </Pressable>
  );
}

function Photo({ asset }: { asset: AssetSummary }) {
  return asset.cover ? (
    <AssetImage media={asset.cover} decorative fill />
  ) : (
    <View style={styles.noPhoto}>
      <Ionicons name="image-outline" size={28} color={onPhoto.soft} />
    </View>
  );
}

/** The dark fade under the words on a photo, so they read on any of them. */
function Fade({ id }: { id: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.35" stopColor={onPhoto.fade} stopOpacity={0} />
            <Stop offset="0.7" stopColor={onPhoto.fade} stopOpacity={0.72} />
            <Stop offset="1" stopColor={onPhoto.fade} stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: "center",
  },
  semibold: {
    fontFamily: fontFamily.sansSemiBold,
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  pageWide: {
    paddingHorizontal: 0,
  },
  columnWide: {
    gap: spacing.xl,
  },
  openGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: spacing.lg,
  },
  cardWide: {
    width: `calc(50% - ${spacing.lg / 2}px)` as unknown as number,
    ...webTransition("transform, border-color", "180ms"),
  } as object,
  lifted: {
    transform: [{ translateY: -3 }],
  },
  tilesWide: {
    gap: spacing.md,
  },
  column: {
    gap: spacing.xxl,
    maxWidth: COLUMN,
    width: "100%",
    alignSelf: "center",
  },
  intro: {
    gap: spacing.sm,
  },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    gap: spacing.xxs,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardPhoto: {
    height: PHOTO_HEIGHT,
    backgroundColor: onPhoto.blank,
  },
  onPhoto: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
    gap: spacing.xxs,
  },
  reasons: {
    gap: spacing.md,
    padding: spacing.md,
  },
  reason: {
    gap: spacing.xxs,
  },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    borderRadius: radius.xl,
    borderWidth: 1,
    backgroundColor: onPhoto.blank,
    overflow: "hidden",
  },
  padlock: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onPhoto.glass,
  },
  noPhoto: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shutPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  shutMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
});

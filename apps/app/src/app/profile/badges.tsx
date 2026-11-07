import Ionicons from "@expo/vector-icons/Ionicons";
import type { MyAchievementsResponse } from "@vagabonds/contracts";
import {
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  useTheme,
  useUi,
} from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { BadgeArt, hasBadgeArt } from "@/components/badge-art";
import { useCommunity, useMyAchievements } from "@/data";
import { localeTag, useLang, useMessages, type Messages } from "@/i18n";
import { bottomInset } from "@/lib/bottom-inset";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";

type Badge = MyAchievementsResponse["items"][number];
type Rule = Badge["rule"];
type Filter = "all" | "earned" | "next";

/**
 * The tiles are white in light and dark theme alike, so the badges' navy art sits on the same
 * paper everywhere; their text is gece900 / gece600 / altin700, all at least 4.5:1 on white.
 */
const tileInk = {
  title: palette.gece900,
  muted: palette.gece600,
  gold: palette.altin700,
  line: palette.gece200,
  track: palette.gece100,
};
const goldLine = "rgba(156, 116, 36, 0.38)";

const COLUMNS = 3;
const GAP = spacing.sm;

/**
 * Categories by what a badge's rule asks, so one an admin adds later lands in the right one
 * without code. Within one, badges run from the fewest points to the most.
 */
const CATEGORIES: Array<{
  key: keyof Messages["badges"]["categories"];
  holds: (rule: Rule) => boolean;
}> = [
  {
    key: "cities",
    holds: (r) =>
      (r.kind === "visit_count" &&
        !!r.city &&
        !r.district &&
        !r.types &&
        !r.era) ||
      r.kind === "cities",
  },
  {
    key: "districts",
    holds: (r) =>
      (r.kind === "visit_count" && !!r.district) || r.kind === "districts",
  },
  { key: "journeys", holds: (r) => r.kind === "within" },
  {
    key: "kinds",
    holds: (r) => r.kind === "visit_count" && (!!r.types || !!r.era),
  },
  { key: "complexes", holds: (r) => r.kind === "complex" },
  { key: "seals", holds: (r) => r.kind === "proven_visits" },
  {
    key: "pen",
    holds: (r) => r.kind === "contributions",
  },
  { key: "other", holds: () => true },
];

const share = (badge: Badge) =>
  Math.min(1, badge.progress.current / badge.progress.target);
const left = (badge: Badge) => badge.progress.target - badge.progress.current;
const earnedTime = (badge: Badge) =>
  badge.earnedAt ? Date.parse(badge.earnedAt) : 0;

/** Not yet earned, nearest first: the largest share done, then the fewest steps left. */
const upNext = (items: Badge[]) =>
  items
    .filter((b) => !b.earnedAt)
    .sort((a, b) => share(b) - share(a) || left(a) - left(b));

/** The sections for a filter: by category for all, else one list in the filter's own order. */
function sections(
  items: Badge[],
  filter: Filter,
  titles: Messages["badges"]["categories"],
): Array<{ key: string; title: string | null; items: Badge[] }> {
  if (filter === "earned") {
    return [
      {
        key: "earned",
        title: null,
        items: items
          .filter((b) => b.earnedAt)
          .sort((a, b) => earnedTime(b) - earnedTime(a)),
      },
    ];
  }
  if (filter === "next")
    return [{ key: "next", title: null, items: upNext(items) }];
  const groups = CATEGORIES.map((category) => ({
    key: category.key,
    title: titles[category.key] as string | null,
    items: [] as Badge[],
  }));
  for (const item of items)
    groups[
      CATEGORIES.findIndex((category) => category.holds(item.rule))
    ]!.items.push(item);
  for (const group of groups) group.items.sort((a, b) => a.points - b.points);
  return groups.filter((group) => group.items.length > 0);
}

/**
 * Profil · Rozetlerim as a showcase: the latest badge earned, large, with the collection's
 * progress under it; then every badge as a tile, filtered to all, earned or next up. A tile
 * opens the badge's story in a sheet.
 */
export default function MyBadgesScreen() {
  const m = useMessages();
  const w = m.badges;
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const { user } = useCommunity();
  const badges = useMyAchievements();
  const data = badges.status === "success" ? badges.data : null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Badge | null>(null);
  const shown = useMemo(() => sections(items, filter, w.categories), [items, filter, w]);
  const earned = items.filter((item) => item.earnedAt).length;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{
        paddingBottom: bottomInset(insets.bottom) + spacing.xl,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Head>
        <title>{m.common.title(m.screens.badges)}</title>
      </Head>
      {/* Not on the web: there the site's bar sits above the page and the light would end in a hard line under it. */}
      {Platform.OS !== "web" && <Backdrop />}

      <View style={[styles.content, wide && wideColumn]}>
        {items.length > 0 && (
          <Showcase
            items={items}
            points={data?.totalPoints ?? 0}
            visits={data?.visits ?? 0}
            onOpen={setOpen}
          />
        )}
        {!user && (
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {w.startHint}
          </Text>
        )}

        {badges.status === "loading" && (
          <ActivityIndicator
            color={c.textSecondary}
            accessibilityLabel={w.loading}
          />
        )}
        {badges.status === "error" && (
          <Pressable
            accessibilityRole="button"
            onPress={badges.retry}
            style={styles.error}
          >
            <Text
              variant="caption"
              color="textSecondary"
              style={styles.centered}
            >
              {`${badges.error.message} ${m.common.tapToRetry}`}
            </Text>
          </Pressable>
        )}
        {badges.status === "success" && data === null && (
          <Text color="textSecondary" style={styles.centered}>
            {w.needsServer}
          </Text>
        )}

        {items.length > 0 && (
          <>
            <Filters
              value={filter}
              onChange={setFilter}
              counts={{
                all: items.length,
                earned,
                next: items.length - earned,
              }}
            />
            {shown.map((section) => (
              <View key={`${filter}-${section.key}`} style={styles.section}>
                {section.title && (
                  <View style={styles.sectionHead}>
                    <Text
                      variant="label"
                      headingLevel={2}
                      style={styles.sectionTitle}
                    >
                      {section.title}
                    </Text>
                    <Text color="textSecondary" style={styles.sectionCount}>
                      {`${section.items.filter((b) => b.earnedAt).length}/${section.items.length}`}
                    </Text>
                  </View>
                )}
                {section.items.length > 0 ? (
                  <Grid items={section.items} onOpen={setOpen} />
                ) : (
                  <Text
                    variant="caption"
                    color="textSecondary"
                    style={styles.centered}
                  >
                    {filter === "earned"
                      ? w.noneEarned
                      : w.allEarned}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}
      </View>

      <BadgeSheet badge={open} onClose={() => setOpen(null)} />
    </ScrollView>
  );
}

/** How tall the page's gold light is: centred on the latest badge, it reaches just to the top. */
const GLOW_HEIGHT = 300;

/**
 * A soft gold light at the head of the page, behind the latest badge: it fades out before the top
 * edge, so the header never cuts it off.
 */
function Backdrop() {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.backdropGlow}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      pointerEvents="none"
      aria-hidden
    >
      {width > 0 && (
        <Svg width={width} height={GLOW_HEIGHT}>
          <Defs>
            <RadialGradient id="page-glow" cx="50%" cy="50%" r="50%">
              <Stop
                offset="0"
                stopColor={palette.altin200}
                stopOpacity={0.16}
              />
              <Stop offset="1" stopColor={palette.altin200} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={width} height={GLOW_HEIGHT} fill="url(#page-glow)" />
        </Svg>
      )}
    </View>
  );
}

/**
 * The showcase: the latest badge earned, large in a gold glow, the few earned before it, and the
 * collection's progress, points and visits. Before any badge, only the progress.
 */
function Showcase({
  items,
  points,
  visits,
  onOpen,
}: {
  items: Badge[];
  points: number;
  visits: number;
  onOpen: (badge: Badge) => void;
}) {
  const lang = useLang();
  const { colors: c } = useTheme();
  const w = useMessages().badges;
  const router = useRouter();
  const earnedList = items
    .filter((b) => b.earnedAt)
    .sort((a, b) => earnedTime(b) - earnedTime(a));
  const featured = earnedList[0];
  const recent = earnedList.slice(1, 6);
  const more = earnedList.length - 1 - recent.length;
  const earned = earnedList.length;
  const total = items.length;
  const date = featured?.earnedAt
    ? new Date(featured.earnedAt).toLocaleDateString(localeTag(lang), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <View style={[styles.showcase, { backgroundColor: c.surface }]}>
      {featured && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={w.latestLabel(featured.title, date)}
          accessibilityHint={w.opensBadge}
          onPress={() => onOpen(featured)}
          style={({ pressed }) => [styles.feature, pressed && styles.pressed]}
        >
          <Glow size={176} on>
            <Medal badge={featured} size={132} ring={c.border} />
          </Glow>
          <View style={styles.featureText}>
            <Text color="highlight" style={styles.overline}>
              {w.latest}
            </Text>
            <Text variant="title" style={styles.centered}>
              {featured.title}
            </Text>
            <Text variant="caption" color="textSecondary">
              {w.latestMeta(date, featured.points)}
            </Text>
          </View>
        </Pressable>
      )}

      {recent.length > 0 && (
        <View
          style={styles.recent}
          accessible
          accessibilityLabel={w.beforeLabel(recent.map((b) => b.title).join(", "), more)}
        >
          <View style={styles.recentRow}>
            {recent.map((badge, i) => (
              <View
                key={badge.code}
                style={[
                  styles.recentItem,
                  { borderColor: c.surface, backgroundColor: c.surface },
                  i > 0 && styles.recentOverlap,
                ]}
              >
                <BadgeArt
                  code={badge.code}
                  emoji={badge.badge}
                  imageUrl={badge.imageUrl}
                  size={34}
                />
              </View>
            ))}
            {more > 0 && (
              <View
                style={[
                  styles.recentItem,
                  styles.recentOverlap,
                  { borderColor: c.surface, backgroundColor: c.surfaceRaised },
                ]}
              >
                <Text style={styles.recentMoreText}>{`+${more}`}</Text>
              </View>
            )}
          </View>
          <Text variant="caption" color="textSecondary">
            {w.before}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.progress,
          featured && [styles.progressUnder, { borderTopColor: c.border }],
        ]}
        accessible
        accessibilityLabel={w.progressLabel(earned, total, points, visits)}
      >
        <View style={styles.progressHead}>
          <Text style={styles.progressValue}>
            {earned}
            <Text
              color="textSecondary"
              style={styles.progressOf}
            >{w.ofTotal(total)}</Text>
          </Text>
          <Text
            color="highlight"
            style={styles.progressShare}
          >{w.percent(total > 0 ? Math.round((earned / total) * 100) : 0)}</Text>
        </View>
        <View style={[styles.track, { backgroundColor: c.surfaceRaised }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: c.highlightMark,
                width: `${total > 0 ? (earned / total) * 100 : 0}%`,
              },
            ]}
          />
        </View>
        {!featured && (
          <Text variant="caption" color="textSecondary">
            {w.firstBadge}
          </Text>
        )}
        <View style={styles.stats}>
          <Stat value={points} label={w.points} />
          <View style={[styles.statRule, { backgroundColor: c.border }]} />
          <Stat value={visits} label={w.visits} />
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/profile/rewards")}
          style={({ pressed }) => [
            styles.spend,
            { backgroundColor: c.surfaceRaised },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="gift-outline" size={18} color={c.highlight} />
          <Text variant="label" style={styles.spendText}>
            {w.spend}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

/** A soft gold light behind what it holds, when `on`. */
function Glow({
  size,
  on,
  children,
}: {
  size: number;
  on: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.glow, { width: size, height: size }]}>
      {on && (
        <Svg
          width={size}
          height={size}
          style={StyleSheet.absoluteFill}
          aria-hidden
        >
          <Defs>
            <RadialGradient id={`glow-${size}`}>
              <Stop
                offset="0.5"
                stopColor={palette.altin200}
                stopOpacity={0.4}
              />
              <Stop offset="1" stopColor={palette.altin200} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2}
            fill={`url(#glow-${size})`}
          />
        </Svg>
      )}
      {children}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text color="textSecondary" style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

/** Tümü / Kazanılan / Sırada, as tabs over the grid. */
function Filters({
  value,
  onChange,
  counts,
}: {
  value: Filter;
  onChange: (filter: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const { colors: c } = useTheme();
  const w = useMessages().badges;
  const options: Array<{ key: Filter; label: string }> = [
    { key: "all", label: w.all },
    { key: "earned", label: w.earned },
    { key: "next", label: w.next },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.filters,
        { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            // react-native-web does not carry accessibilityState.
            {...(Platform.OS === "web" ? { "aria-selected": selected } : null)}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.filter,
              selected && { backgroundColor: c.text },
              pressed && styles.pressed,
            ]}
          >
            <Text
              variant="label"
              colorValue={selected ? c.background : c.text}
              style={styles.filterText}
            >
              {option.label}
            </Text>
            <Text
              colorValue={selected ? c.background : c.textSecondary}
              style={styles.filterCount}
            >
              {counts[option.key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The badges as equal tiles, three to a row; six on a wide web page. */
function Grid({
  items,
  onOpen,
}: {
  items: Badge[];
  onOpen: (badge: Badge) => void;
}) {
  const [width, setWidth] = useState(0);
  const columns = useWideWeb() ? 6 : COLUMNS;
  const tile =
    width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : 0;
  return (
    <View
      accessibilityRole="list"
      style={styles.grid}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {tile > 0 &&
        items.map((badge, i) => (
          <Tile
            key={badge.code}
            badge={badge}
            width={tile}
            index={i}
            onOpen={onOpen}
          />
        ))}
    </View>
  );
}

/** One badge: its medal, its name in two lines, and its points or how far along. Fades up in turn. */
function Tile({
  badge,
  width,
  index,
  onOpen,
}: {
  badge: Badge;
  width: number;
  index: number;
  onOpen: (badge: Badge) => void;
}) {
  const reduced = useReducedMotion();
  const { textScale } = useUi();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const earned = badge.earnedAt !== null;
  const medal = Math.min(84, width - spacing.lg * 2);
  const w = useMessages().badges;

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 12) * 35,
      useNativeDriver: true,
    }).start();
  }, [enter, index, reduced]);

  const state = earned
    ? w.earnedState(badge.points)
    : `${badge.progress.current}/${badge.progress.target}`;
  return (
    <Animated.View
      role="listitem"
      style={{
        width,
        opacity: enter,
        transform: [
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${badge.title}, ${state}`}
        accessibilityHint={w.opensBadge}
        onPress={() => onOpen(badge)}
        style={({ pressed }) => [
          styles.tile,
          earned && styles.tileEarned,
          pressed && styles.pressed,
        ]}
      >
        <Medal badge={badge} size={medal} ring={tileInk.line} />
        <Text
          variant="caption"
          colorValue={earned ? tileInk.title : tileInk.muted}
          style={[styles.tileTitle, { minHeight: 36 * textScale }]}
          numberOfLines={2}
        >
          {badge.title}
        </Text>
        {earned ? (
          <View style={styles.tileFoot}>
            <Text
              colorValue={tileInk.gold}
              style={styles.tilePoints}
            >{`✦ +${badge.points}`}</Text>
          </View>
        ) : (
          <View style={[styles.tileFoot, styles.tileProgress]}>
            <View style={styles.tileTrack}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: palette.altin600,
                    width: `${share(badge) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text
              colorValue={tileInk.muted}
              style={styles.tileCount}
            >{`${badge.progress.current}/${badge.progress.target}`}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Gold foil, light to deep and back, as on the passport. */
function Foil({ id }: { id: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor="#F6DE9C" />
      <Stop offset="0.45" stopColor={palette.altin600} />
      <Stop offset="0.7" stopColor={palette.altin200} />
      <Stop offset="1" stopColor={palette.altin700} />
    </LinearGradient>
  );
}

/**
 * A badge as a medal. With illustrated art (assets/badges): the drawing inside a foil rim when
 * earned; when not yet, the drawing in grey, a lock, and a thin gold arc for the progress.
 * Without art: a gold coin with the emoji struck in it, or a night disc with the emoji faded.
 */
function Medal({
  badge,
  size,
  ring,
}: {
  badge: Badge;
  size: number;
  ring: string;
}) {
  const earned = badge.earnedAt !== null;
  const done = share(badge);
  const mid = size / 2;
  const arc = mid - 2;
  const disc = mid - 9;
  const length = 2 * Math.PI * arc;
  const id = `m-${badge.code}-${Math.round(size)}`;
  const art = hasBadgeArt(badge.code, badge.imageUrl);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} aria-hidden>
        <Defs>
          <Foil id={`${id}-foil`} />
          <RadialGradient id={`${id}-coin`} cx="35%" cy="30%" r="75%">
            <Stop offset="0" stopColor="#FBE7B0" />
            <Stop offset="0.55" stopColor={palette.altin200} />
            <Stop offset="1" stopColor={palette.altin600} />
          </RadialGradient>
        </Defs>
        {earned ? (
          <>
            <Circle
              cx={mid}
              cy={mid}
              r={arc}
              stroke={`url(#${id}-foil)`}
              strokeWidth={2}
              fill="none"
            />
            {!art && (
              <>
                <Circle cx={mid} cy={mid} r={disc} fill={`url(#${id}-coin)`} />
                <Circle
                  cx={mid}
                  cy={mid}
                  r={disc - 4}
                  stroke={palette.altin700}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="1.5 2.5"
                  fill="none"
                />
              </>
            )}
          </>
        ) : (
          <>
            <Circle
              cx={mid}
              cy={mid}
              r={arc}
              stroke={ring}
              strokeWidth={2}
              fill="none"
            />
            {done > 0 && (
              <Circle
                cx={mid}
                cy={mid}
                r={arc}
                stroke={`url(#${id}-foil)`}
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${done * length} ${length}`}
                transform={`rotate(-90 ${mid} ${mid})`}
              />
            )}
            {!art && (
              <>
                <Circle cx={mid} cy={mid} r={disc} fill={palette.gece100} />
                <Circle
                  cx={mid}
                  cy={mid}
                  r={disc - 4}
                  stroke={palette.gece600}
                  strokeOpacity={0.25}
                  strokeWidth={1}
                  strokeDasharray="1.5 2.5"
                  fill="none"
                />
              </>
            )}
          </>
        )}
      </Svg>
      <View style={styles.medalFace}>
        {art ? (
          // Up to the rim: the arc is drawn at `mid - 2` with a 2 px stroke, so its inside is `mid - 3`.
          <BadgeArt
            code={badge.code}
            emoji={badge.badge}
            imageUrl={badge.imageUrl}
            size={size - 6}
            earned={earned}
          />
        ) : (
          <Text
            style={[
              { fontSize: size * 0.36, lineHeight: size * 0.44 },
              !earned && styles.faded,
            ]}
          >
            {badge.badge}
          </Text>
        )}
      </View>
      {!earned && (
        <View style={styles.lock}>
          <Ionicons name="lock-closed" size={10} color={palette.gece600} />
        </View>
      )}
    </View>
  );
}

/** A badge's story: the big medal, its name, what it asks, and the points or how far along. */
function BadgeSheet({
  badge,
  onClose,
}: {
  badge: Badge | null;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  // Kept while the sheet slides away, so it does not empty before it is gone.
  const [shown, setShown] = useState<Badge | null>(badge);
  const m = useMessages();
  const w = m.badges;
  useEffect(() => {
    if (badge) setShown(badge);
  }, [badge]);
  if (!shown) return null;

  const earned = shown.earnedAt !== null;
  const { current, target } = shown.progress;
  return (
    <Modal
      visible={badge !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={m.common.close}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <Glow size={200} on={earned}>
          <Medal badge={shown} size={148} ring={c.border} />
        </Glow>
        <Text variant="title" headingLevel={2} style={styles.centered}>
          {shown.title}
        </Text>
        <Text color="textSecondary" style={styles.centered}>
          {shown.description}
        </Text>
        {earned ? (
          <View style={styles.earnedChip}>
            <Ionicons name="sparkles" size={14} color={palette.altin950} />
            <Text
              variant="label"
              colorValue={palette.altin950}
              style={styles.chipText}
            >
              {w.earnedChip(shown.points)}
            </Text>
          </View>
        ) : (
          <View style={styles.sheetProgress}>
            <View style={[styles.track, { backgroundColor: c.surfaceRaised }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: c.highlightMark,
                    width: `${Math.min(1, current / target) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text variant="caption" color="textSecondary">
              {w.whenEarned(current, target, shown.points)}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { borderColor: c.border },
            pressed && styles.pressed,
          ]}
        >
          <Text variant="label" style={styles.chipText}>
            {w.ok}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.75,
  },
  backdropGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.xl,
  },
  error: {
    padding: spacing.md,
  },
  showcase: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: goldLine,
    overflow: "hidden",
  },
  feature: {
    alignItems: "center",
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  featureText: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: -spacing.md,
  },
  overline: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.5,
  },
  glow: {
    alignItems: "center",
    justifyContent: "center",
  },
  recent: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  recentRow: {
    flexDirection: "row",
  },
  recentItem: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  recentOverlap: {
    marginLeft: -10,
  },
  recentMoreText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  progress: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  progressUnder: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
  },
  progressHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  // Sans figures: the display face draws its zero as a ring.
  progressValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 22,
    lineHeight: 28,
  },
  progressOf: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
  },
  progressShare: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  track: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  spend: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  spendText: {
    flex: 1,
    fontSize: 15,
  },
  statRule: {
    width: 1,
    height: 28,
  },
  statValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 18,
    lineHeight: 24,
  },
  statLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  filters: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filter: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.full,
  },
  filterText: {
    fontSize: 14,
    lineHeight: 20,
  },
  filterCount: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 17,
  },
  sectionCount: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  tile: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tileInk.line,
    backgroundColor: palette.white,
  },
  tileEarned: {
    borderColor: goldLine,
  },
  tileTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  tileFoot: {
    height: 18,
    justifyContent: "center",
  },
  tilePoints: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  tileProgress: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: tileInk.track,
  },
  tileCount: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  medalFace: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  faded: {
    opacity: 0.4,
  },
  lock: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tileInk.line,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 6, 14, 0.6)",
  },
  sheet: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  earnedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: palette.altin200,
  },
  chipText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  sheetProgress: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.sm,
  },
  close: {
    alignSelf: "stretch",
    height: 48,
    marginTop: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

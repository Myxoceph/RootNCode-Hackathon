import Ionicons from "@expo/vector-icons/Ionicons";
import type { WeatherCondition } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { useAsset, useCities, useCityMapAssets, useCommunity, useMyAchievements, useWeather } from "@/data";
import { announce } from "@/lib/announce";
import { useLastCity } from "@/lib/last-city";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { dayAsset, nearestBadge, weatherMood } from "@/lib/welcome-lines";
import { loadMaplibre } from "@/vendor";
import { localeTag, useLang, useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** The page's navy in the dark theme (lacivert): bluer than the app's night blue. */
const NAVY = "#0E1F3D";
/** The chip over the photo: dark glass in both themes, the photo under it is the same. */
const chip = {
  fill: "rgba(8, 18, 38, 0.62)",
  edge: "rgba(255, 255, 255, 0.14)",
  text: palette.gece50,
  sub: palette.gece300,
  gold: palette.altin200,
};

/**
 * The page's colours: navy with light gold in the dark theme, white with deep gold in the light
 * one. Text comes from the theme, so high contrast still reaches it.
 */
function usePageColors() {
  const { scheme, colors: c } = useTheme();
  const dark = scheme === "dark";
  return {
    dark,
    background: dark ? NAVY : palette.white,
    text: c.text,
    textSecondary: c.textSecondary,
    /** Small gold words; deep gold on white for 4.5:1. */
    gold: dark ? palette.altin200 : palette.altin700,
    /** Large gold words and marks (the name, the ring): 3:1 is enough for them. */
    goldMark: dark ? palette.altin200 : palette.altin600,
    /** The button: gold on the navy, navy on the white. */
    button: dark ? palette.altin200 : NAVY,
    onButton: dark ? palette.altin950 : palette.white,
    buttonMark: dark ? palette.altin950 : palette.altin200,
    fill: dark ? "rgba(255, 255, 255, 0.05)" : palette.white,
    edge: dark ? "rgba(255, 255, 255, 0.11)" : palette.gece100,
    rule: dark ? "rgba(255, 255, 255, 0.09)" : palette.gece100,
    track: dark ? "rgba(255, 255, 255, 0.13)" : palette.gece100,
    medallion: dark ? "rgba(255, 255, 255, 0.04)" : palette.gece50,
  };
}
/** Emir Sultan, the sign-in screen's photo: shown until the site of the day is in, or without one. */
const FALLBACK_ASSET = "bursa-yildirim-emir-sultan-kulliyesi";
/** The medallion on the left of each card: the badge's ring, the weather's disc. */
const MEDALLION = 76;
const RING = 6;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The weather's icon: the sun by day, the moon by night when it is clear. */
function weatherIcon(condition: WeatherCondition, isDay: boolean): IconName {
  if (condition === "clear") return isDay ? "sunny-outline" : "moon-outline";
  return ({ cloudy: "cloudy-outline", fog: "cloud-outline", rain: "rainy-outline", snow: "snow-outline", storm: "thunderstorm-outline" } as const)[condition];
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * `/welcome`: the page the app opens on. The site of the day fills the top and sinks into the night
 * blue; under it the date and "Hoş geldin, <ad>" in the display face. Two cards of one make follow,
 * a medallion on the left, words on the right and a line of detail under a hairline: the visitor's
 * progress drawn out (a gold ring for the badge nearest to hand and a bar of the whole collection)
 * and the city's weather (the city last opened on the map, else the one with the most sites).
 * Nothing here needs the visitor; the page stays until "Keşfe başla" opens the map.
 */
export default function WelcomePage() {
  const router = useRouter();
  const m = useMessages();
  const w = m.welcome;
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user } = useCommunity();
  const reduced = useReducedMotion();
  const ink = usePageColors();
  const [today] = useState(() => new Date());

  // The first name when the account has a full name, else the nickname.
  const name = user?.fullName?.trim().split(/\s+/)[0] || user?.nickname || null;

  // The badges: the one nearest to hand, and how many of all are earned.
  const achievements = useMyAchievements();
  const items = achievements.status === "success" ? (achievements.data?.items ?? null) : null;
  const near = items ? nearestBadge(items) : null;
  const earned = items ? items.filter((item) => item.earnedAt).length : 0;
  const nearLeft = near ? w.left(near.left, w.units[near.unit](near.left)) : null;

  // The city: the one last opened on the map, else the one with the most sites.
  const lastCity = useLastCity();
  const cities = useCities();
  const biggest = cities.status === "success" ? ([...cities.data].sort((a, b) => b.assetCount - a.assetCount)[0]?.code ?? null) : null;
  const city = lastCity === undefined ? null : (lastCity ?? biggest);
  const weather = useWeather(city);
  const forecast = weather.status === "success" ? weather.data : null;
  const now = forecast?.available ? forecast.current : null;
  const mood = weatherMood(forecast);
  const todayForecast = forecast?.daily[0] ?? null;

  // The site of the day, from the same city; Emir Sultan until it is in.
  const cityAssets = useCityMapAssets(city);
  const featured = cityAssets.status === "success" && cityAssets.data ? dayAsset(cityAssets.data.located, today) : null;
  const fallback = useAsset(FALLBACK_ASSET);
  const cover = featured?.cover ?? (fallback.status === "success" ? fallback.data?.cover : null) ?? null;

  const upper = (text: string) => text.toLocaleUpperCase(localeTag(lang));
  const date = upper(today.toLocaleDateString(localeTag(lang), { weekday: "long", day: "numeric", month: "long" }));
  const heroHeight = Math.min(Math.max(height * 0.36, 240), 380);

  // The page rises in; each part a moment after the one above it.
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    // The map's library starts loading while the visitor reads, so the map opens at once after.
    void loadMaplibre();
    announce(w.announce(name));
    if (!reduced) Animated.timing(enter, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Said once, with the name the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rise = (from: number) => ({
    opacity: enter.interpolate({ inputRange: [from, Math.min(from + 0.5, 1)], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [{ translateY: enter.interpolate({ inputRange: [from, Math.min(from + 0.5, 1)], outputRange: [16, 0], extrapolate: "clamp" }) }],
  });

  const footerHeight = 56 + spacing.lg * 2 + insets.bottom;

  return (
    <View style={[styles.screen, { backgroundColor: ink.background }]}>
      <Head>
        <title>{m.common.title(w.title)}</title>
      </Head>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={{ paddingBottom: footerHeight + spacing.md }} showsVerticalScrollIndicator={false} bounces={false}>
        {/* The site of the day, its lower part sinking into the night blue. */}
        <View style={[styles.hero, { height: heroHeight + insets.top }]}>
          <View style={StyleSheet.absoluteFill} aria-hidden importantForAccessibility="no-hide-descendants">
            {cover && <AssetImage media={cover} decorative fill />}
            <Fade />
          </View>

          {featured && (
            <Pressable
              onPress={() => router.push(`/asset/${featured.id}` as Href)}
              accessibilityRole="link"
              accessibilityLabel={w.dayAssetLabel(featured.name)}
              style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
            >
              <View style={[styles.featuredMark, { borderColor: chip.gold }]}>
                <Ionicons name="sparkles" size={12} color={chip.gold} />
              </View>
              <View style={styles.featuredWords}>
                <Text colorValue={chip.gold} style={styles.kicker}>
                  {upper(w.dayAsset)}
                </Text>
                <Text colorValue={chip.text} style={styles.featuredName} numberOfLines={1}>
                  {featured.name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={chip.sub} />
            </Pressable>
          )}
        </View>

        <View style={styles.column}>
          <Animated.View style={rise(0)}>
            <Text colorValue={ink.gold} style={styles.overline}>
              {date}
            </Text>
            <Text headingLevel={1} colorValue={ink.text} style={styles.title}>
              {w.greeting}
              {"\n"}
              <Text colorValue={ink.goldMark} style={styles.title}>
                {name ?? w.traveller}
              </Text>
            </Text>
          </Animated.View>

          {/* Told by screen readers as they arrive: they may come a moment after the greeting. */}
          <View style={styles.cards} accessibilityLiveRegion="polite">
            {items && items.length > 0 && (
              <Animated.View style={rise(0.2)}>
                <Card
                  label={near && nearLeft ? w.ringLabel(near.title, near.current, near.target, nearLeft) : w.complete}
                  medallion={
                    <Ring share={near ? near.current / near.target : 1} reduced={reduced}>
                      {near ? (
                        <Text colorValue={ink.text} style={styles.ringCount}>
                          {w.progress(near.current, near.target)}
                        </Text>
                      ) : (
                        <Ionicons name="checkmark" size={28} color={ink.goldMark} />
                      )}
                    </Ring>
                  }
                  kicker={upper(w.nextBadge)}
                  title={near?.title ?? w.complete}
                  emoji={near?.badge}
                  body={nearLeft ? capitalize(nearLeft) : w.completeLead}
                  foot={<Collection earned={earned} total={items.length} />}
                />
              </Animated.View>
            )}

            {now && forecast && mood && (
              <Animated.View style={rise(0.35)}>
                <Card
                  medallion={
                    <Ring share={0} reduced>
                      <Ionicons name={weatherIcon(now.condition, now.isDay)} size={26} color={ink.goldMark} />
                    </Ring>
                  }
                  kicker={upper(w.cardTitle(w.weatherLabel, forecast.city.label))}
                  title={w.cardTitle(w.degrees(Math.round(now.temperatureC)), w.conditions[now.condition])}
                  body={w.sentence(capitalize(mood))}
                  foot={
                    todayForecast && (
                      <View style={styles.footRow}>
                        <Text colorValue={ink.textSecondary} style={styles.footText}>
                          {w.highLow(Math.round(todayForecast.highC), Math.round(todayForecast.lowC))}
                        </Text>
                        <Text colorValue={ink.textSecondary} style={[styles.footText, styles.credit]}>
                          {forecast.attribution}
                        </Text>
                      </View>
                    )
                  }
                />
              </Animated.View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* The way on, always in reach: the page scrolls under it. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="welcome-foot" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ink.background} stopOpacity={0} />
                <Stop offset="0.4" stopColor={ink.background} stopOpacity={0.94} />
                <Stop offset="1" stopColor={ink.background} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#welcome-foot)" />
          </Svg>
        </View>
        <Pressable
          onPress={() => router.replace("/map")}
          accessibilityRole="button"
          accessibilityHint={w.startHint}
          style={({ pressed }) => [styles.start, { backgroundColor: ink.button }, pressed && styles.pressed]}
        >
          <Text variant="label" colorValue={ink.onButton} style={styles.startText}>
            {w.start}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={ink.buttonMark} />
        </Pressable>
      </View>
    </View>
  );
}

/** The photo: darker under the status bar and at the foot, where the chip sits; clear between. */
function Fade() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="welcome-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={NAVY} stopOpacity={0.5} />
            <Stop offset="0.3" stopColor={NAVY} stopOpacity={0} />
            <Stop offset="0.6" stopColor={NAVY} stopOpacity={0} />
            <Stop offset="1" stopColor={NAVY} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#welcome-fade)" />
      </Svg>
    </View>
  );
}

/**
 * One card of the page: the medallion on the left; the kicker, the title and a line on the right;
 * a detail under a hairline. Read as one by screen readers (`label`, else its words in order).
 */
function Card({
  medallion,
  kicker,
  title,
  emoji,
  body,
  foot,
  label,
}: {
  medallion: ReactNode;
  kicker: string;
  title: string;
  emoji?: string;
  body: string;
  foot?: ReactNode;
  label?: string;
}) {
  const ink = usePageColors();
  return (
    <View style={[styles.card, { backgroundColor: ink.fill, borderColor: ink.edge }, !ink.dark && styles.lifted]} accessible accessibilityLabel={label}>
      <View style={styles.cardMain}>
        {medallion}
        <View style={styles.cardWords}>
          <Text colorValue={ink.textSecondary} style={styles.kicker}>
            {kicker}
          </Text>
          <View style={styles.titleRow}>
            {emoji && (
              <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
                {emoji}
              </Text>
            )}
            <Text colorValue={ink.text} style={styles.cardTitle} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <Text colorValue={ink.textSecondary} style={styles.cardBody}>
            {body}
          </Text>
        </View>
      </View>
      {foot ? <View style={[styles.cardFoot, { borderTopColor: ink.rule }]}>{foot}</View> : null}
    </View>
  );
}

/** A ring around the medallion: a faint track, and a gold arc for the share done that draws itself in. */
function Ring({ share, reduced, children }: { share: number; reduced: boolean; children: ReactNode }) {
  const ink = usePageColors();
  const r = (MEDALLION - RING) / 2;
  const length = 2 * Math.PI * r;
  const drawn = useRef(new Animated.Value(reduced ? share : 0)).current;
  useEffect(() => {
    if (reduced) drawn.setValue(share);
    else Animated.timing(drawn, { toValue: share, duration: 1200, delay: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [share, reduced, drawn]);
  const offset = drawn.interpolate({ inputRange: [0, 1], outputRange: [length, 0] });
  return (
    <View style={styles.medallion}>
      <Svg width={MEDALLION} height={MEDALLION} style={StyleSheet.absoluteFill}>
        <Circle cx={MEDALLION / 2} cy={MEDALLION / 2} r={r} stroke={ink.track} strokeWidth={RING} fill={ink.medallion} />
        {share > 0 && (
          <AnimatedCircle
            cx={MEDALLION / 2}
            cy={MEDALLION / 2}
            r={r}
            stroke={ink.goldMark}
            strokeWidth={RING}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${length} ${length}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${MEDALLION / 2} ${MEDALLION / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

/** The whole collection: one segment for each badge, gold for the earned ones, and its count. */
function Collection({ earned, total }: { earned: number; total: number }) {
  const m = useMessages();
  const ink = usePageColors();
  return (
    <View accessible accessibilityLabel={m.welcome.collectionLabel(earned, total)} style={styles.collection}>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, index) => (
          <View key={index} style={[styles.segment, { backgroundColor: index < earned ? ink.goldMark : ink.track }]} />
        ))}
      </View>
      <Text colorValue={ink.textSecondary} style={styles.footText}>
        {m.welcome.collection(earned, total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  hero: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  featured: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "86%",
    margin: spacing.lg,
    gap: spacing.sm,
    paddingLeft: 6,
    paddingRight: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: chip.fill,
    borderWidth: 1,
    borderColor: chip.edge,
  },
  featuredMark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredWords: {
    flexShrink: 1,
  },
  featuredName: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  column: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  overline: {
    fontFamily: fontFamily.sansBold,
    fontSize: 12,
    letterSpacing: 2.2,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: -0.5,
  },
  cards: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.lg,
  },
  lifted: {
    shadowColor: NAVY,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  medallion: {
    width: MEDALLION,
    height: MEDALLION,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCount: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 24,
  },
  cardWords: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emoji: {
    fontSize: 18,
    lineHeight: 26,
  },
  cardTitle: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 28,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  cardFoot: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  footRow: {
    gap: 2,
  },
  footText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  credit: {
    opacity: 0.75,
  },
  collection: {
    gap: spacing.sm,
  },
  segments: {
    flexDirection: "row",
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  start: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 56,
    width: "100%",
    maxWidth: 600,
    borderRadius: radius.full,
  },
  startText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});

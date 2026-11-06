import Ionicons from "@expo/vector-icons/Ionicons";
import type { WeatherCondition } from "@vagabonds/contracts";
import { cameraColors, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { useAsset, useCities, useCityMapAssets, useCommunity, useMyAchievements, useWallet, useWeather } from "@/data";
import { announce } from "@/lib/announce";
import { useLastCity } from "@/lib/last-city";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { dailyLine, dayAsset, weatherMood } from "@/lib/welcome-lines";
import { localeTag, useLang, useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Always the night look, as the sign-in screen it follows: the photo and the gold read best on it. */
const ink = cameraColors;
const glass = {
  fill: "rgba(255, 255, 255, 0.05)",
  edge: "rgba(255, 255, 255, 0.11)",
  rule: "rgba(255, 255, 255, 0.09)",
};
/** Emir Sultan, the sign-in screen's photo: shown until the site of the day is in, or without one. */
const FALLBACK_ASSET = "bursa-yildirim-emir-sultan-kulliyesi";

/** The weather's icon: the sun by day, the moon by night when it is clear. */
function weatherIcon(condition: WeatherCondition, isDay: boolean): IconName {
  if (condition === "clear") return isDay ? "sunny-outline" : "moon-outline";
  return ({ cloudy: "cloudy-outline", fog: "cloud-outline", rain: "rainy-outline", snow: "snow-outline", storm: "thunderstorm-outline" } as const)[condition];
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * `/welcome`: the page the app opens on. The site of the day fills the top, sinking into the night
 * blue; over it the date and the weather, under it "Hoş geldin, <ad>" in the display face. Then the
 * visitor's seals, badges and points, the city's weather (the city last opened on the map, else the
 * one with the most sites) and the day's line: the badge nearest to hand with its progress, or a
 * tip, by turns from day to day. Nothing here needs the visitor; the page stays until "Keşfe
 * başla" opens the map. It never moves on by itself.
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
  const [today] = useState(() => new Date());

  // The first name when the account has a full name, else the nickname.
  const name = user?.fullName?.trim().split(/\s+/)[0] || user?.nickname || null;

  // The visitor's seals, badges and points.
  const wallet = useWallet();
  const achievements = useMyAchievements();
  const items = achievements.status === "success" ? (achievements.data?.items ?? []) : null;
  const walletData = wallet.status === "success" ? wallet.data : null;
  const stats =
    walletData && items
      ? { seals: walletData.provenVisits, badges: items.filter((item) => item.earnedAt).length, points: walletData.balance }
      : null;

  // The day's line: the badge nearest to hand or a tip; it waits for the badges, a tip without them.
  const dayLine = useMemo(() => (achievements.status === "loading" ? null : dailyLine(items, today)), [achievements.status, items, today]);

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

  const date = today.toLocaleDateString(localeTag(lang), { weekday: "long", day: "numeric", month: "long" });
  const heroHeight = Math.min(Math.max(height * 0.5, 320), 480);

  // The page rises in; each part a moment after the one above it.
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    announce(w.announce(name));
    if (!reduced) Animated.timing(enter, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Said once, with the name the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rise = (from: number) => ({
    opacity: enter.interpolate({ inputRange: [from, Math.min(from + 0.5, 1)], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [{ translateY: enter.interpolate({ inputRange: [from, Math.min(from + 0.5, 1)], outputRange: [18, 0], extrapolate: "clamp" }) }],
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
        <View style={{ height: heroHeight }}>
          <View style={StyleSheet.absoluteFill} aria-hidden importantForAccessibility="no-hide-descendants">
            {cover && <AssetImage media={cover} decorative fill />}
            <Fade />
          </View>

          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.datePill}>
              <View style={[styles.dot, { backgroundColor: ink.gold }]} />
              <Text variant="caption" colorValue={ink.text} style={styles.dateText}>
                {capitalize(date)}
              </Text>
            </View>
            {now && (
              <View style={styles.weatherPill} accessible accessibilityLabel={w.place(forecast?.city.label ?? "", w.degrees(Math.round(now.temperatureC)))}>
                <Ionicons name={weatherIcon(now.condition, now.isDay)} size={16} color={ink.gold} />
                <Text variant="caption" colorValue={ink.text} style={styles.pillText}>
                  {w.degrees(Math.round(now.temperatureC))}
                </Text>
              </View>
            )}
          </View>

          {featured && (
            <Pressable
              onPress={() => router.push(`/asset/${featured.id}` as Href)}
              accessibilityRole="link"
              accessibilityLabel={w.dayAssetLabel(featured.name)}
              style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
            >
              <Text variant="caption" colorValue={ink.gold} style={styles.featuredKicker}>
                {w.dayAsset.toLocaleUpperCase(localeTag(lang))}
              </Text>
              <View style={styles.featuredRow}>
                <Text colorValue={ink.text} style={styles.featuredName} numberOfLines={1}>
                  {featured.name}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={ink.textSecondary} />
              </View>
              <Text variant="caption" colorValue={ink.textSecondary} numberOfLines={1}>
                {w.place(featured.district, featured.city.label)}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.column}>
          <Animated.View style={rise(0)}>
            <Text variant="caption" colorValue={ink.gold} style={styles.overline}>
              {w.overline}
            </Text>
            <Text headingLevel={1} colorValue={ink.text} style={styles.title}>
              {w.greeting}
              {"\n"}
              <Text colorValue={ink.gold} style={styles.title}>
                {name ?? w.traveller}
              </Text>
            </Text>
            <Text colorValue={ink.textSecondary} style={styles.lead}>
              {w.lead}
            </Text>
          </Animated.View>

          {/* Seals, badges and points, the three numbers of the visitor's journey. */}
          {stats && (
            <Animated.View style={[styles.panel, styles.stats, rise(0.15)]} accessible accessibilityLabel={w.statsLabel(stats.seals, stats.badges, stats.points)}>
              <Stat value={stats.seals} label={w.stats.seals} />
              <View style={styles.statRule} />
              <Stat value={stats.badges} label={w.stats.badges} />
              <View style={styles.statRule} />
              <Stat value={stats.points} label={w.stats.points} />
            </Animated.View>
          )}

          {/* Told by screen readers as they arrive: they may come a moment after the greeting. */}
          <View style={styles.cards} accessibilityLiveRegion="polite">
            {now && forecast && mood && (
              <Animated.View style={rise(0.3)}>
                <Panel>
                  <View style={styles.cardHead}>
                    <Text variant="caption" colorValue={ink.textSecondary} style={styles.cardLabel}>
                      {w.cardTitle(w.weatherLabel, forecast.city.label).toLocaleUpperCase(localeTag(lang))}
                    </Text>
                    <Ionicons name={weatherIcon(now.condition, now.isDay)} size={22} color={ink.gold} accessibilityElementsHidden importantForAccessibility="no" />
                  </View>
                  <View style={styles.weatherBody} accessible>
                    <Text colorValue={ink.text} style={styles.degrees}>
                      {w.degrees(Math.round(now.temperatureC))}
                    </Text>
                    <View style={styles.weatherWords}>
                      <Text colorValue={ink.text} style={styles.condition}>
                        {w.conditions[now.condition]}
                      </Text>
                      <Text colorValue={ink.textSecondary} style={styles.cardText}>
                        {w.sentence(capitalize(mood))}
                      </Text>
                    </View>
                  </View>
                  {todayForecast && (
                    <View style={styles.cardFoot}>
                      <Text variant="caption" colorValue={ink.textSecondary}>
                        {w.highLow(Math.round(todayForecast.highC), Math.round(todayForecast.lowC))}
                      </Text>
                      <Text variant="caption" colorValue={ink.textSecondary} style={styles.credit}>
                        {forecast.attribution}
                      </Text>
                    </View>
                  )}
                </Panel>
              </Animated.View>
            )}

            {dayLine && (
              <Animated.View style={rise(0.45)}>
                <Panel>
                  <View style={styles.cardHead}>
                    <Text variant="caption" colorValue={ink.textSecondary} style={styles.cardLabel}>
                      {(dayLine.kind === "badge" ? w.badgeLabel : w.tipLabel).toLocaleUpperCase(localeTag(lang))}
                    </Text>
                    <Ionicons
                      name={dayLine.kind === "badge" ? "ribbon-outline" : "bulb-outline"}
                      size={22}
                      color={ink.gold}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </View>
                  <Text colorValue={ink.text} style={styles.dayText}>
                    {dayLine.text}
                  </Text>
                  {dayLine.kind === "badge" && <Progress current={dayLine.current} target={dayLine.target} />}
                </Panel>
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
                <Stop offset="0.35" stopColor={ink.background} stopOpacity={0.92} />
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
          style={({ pressed }) => [styles.start, { backgroundColor: ink.gold }, pressed && styles.pressed]}
        >
          <Text variant="label" colorValue={ink.onGold} style={styles.startText}>
            {w.start}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={ink.onGold} />
        </Pressable>
      </View>
    </View>
  );
}

/** The photo: darker under the status bar, clear in the middle, night blue at the foot. */
function Fade() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="welcome-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink.background} stopOpacity={0.55} />
            <Stop offset="0.3" stopColor={ink.background} stopOpacity={0.08} />
            <Stop offset="0.62" stopColor={ink.background} stopOpacity={0.25} />
            <Stop offset="1" stopColor={ink.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#welcome-fade)" />
      </Svg>
    </View>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text colorValue={ink.text} style={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" colorValue={ink.textSecondary} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

/** The badge's progress: a thin gold bar and its count. */
function Progress({ current, target }: { current: number; target: number }) {
  const m = useMessages();
  const share = target > 0 ? Math.min(current / target, 1) : 0;
  return (
    <View style={styles.progress}>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${share * 100}%`, backgroundColor: ink.gold }]} />
      </View>
      <Text variant="caption" colorValue={ink.textSecondary} style={styles.progressText}>
        {m.welcome.progress(current, target)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: "rgba(10, 14, 22, 0.55)",
    borderWidth: 1,
    borderColor: glass.edge,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dateText: {
    fontFamily: fontFamily.sansSemiBold,
    letterSpacing: 0.3,
  },
  weatherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: "rgba(10, 14, 22, 0.55)",
    borderWidth: 1,
    borderColor: glass.edge,
  },
  pillText: {
    fontFamily: fontFamily.sansBold,
  },
  featured: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xxl * 2 + spacing.lg,
    maxWidth: "62%",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: "rgba(10, 14, 22, 0.6)",
    borderWidth: 1,
    borderColor: glass.edge,
    gap: 1,
  },
  featuredKicker: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  featuredRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featuredName: {
    flexShrink: 1,
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 14,
  },
  column: {
    marginTop: -spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  overline: {
    fontFamily: fontFamily.sansBold,
    letterSpacing: 2.4,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 46,
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  lead: {
    marginTop: spacing.md,
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: glass.edge,
    backgroundColor: glass.fill,
    padding: spacing.lg,
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 36,
  },
  statLabel: {
    fontFamily: fontFamily.sansMedium,
    letterSpacing: 0.4,
  },
  statRule: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: spacing.xs,
    backgroundColor: glass.rule,
  },
  cards: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  weatherBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  degrees: {
    fontFamily: fontFamily.display,
    fontSize: 64,
    lineHeight: 72,
  },
  weatherWords: {
    flex: 1,
    gap: 2,
  },
  condition: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 21,
  },
  cardFoot: {
    gap: 2,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: glass.rule,
  },
  credit: {
    opacity: 0.8,
  },
  dayText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 17,
    lineHeight: 25,
  },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: glass.rule,
  },
  bar: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontFamily: fontFamily.monoMedium,
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

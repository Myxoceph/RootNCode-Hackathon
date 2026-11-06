import Ionicons from "@expo/vector-icons/Ionicons";
import type { WeatherCondition, WeatherResponse } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { useCities, useCommunity, useWeather, useWeatherAt } from "@/data";
import { announce } from "@/lib/announce";
import { useHere } from "@/lib/here";
import { useLastCity } from "@/lib/last-city";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { dayLabel } from "@/lib/welcome-lines";
import { loadMaplibre } from "@/vendor";
import { localeTag, useLang, useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** The page's navy in the dark theme (lacivert): bluer than the app's night blue. */
const NAVY = "#0E1F3D";

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
    /** Large gold words and marks: 3:1 is enough for them. */
    goldMark: dark ? palette.altin200 : palette.altin600,
    /** The button: gold on the navy, navy on the white. */
    button: dark ? palette.altin200 : NAVY,
    onButton: dark ? palette.altin950 : palette.white,
    buttonMark: dark ? palette.altin950 : palette.altin200,
    /** The weather card's sky, top to bottom, and its edge. */
    sky: dark ? ["#1D3A6E", "#122A52"] : ["#E3EDFB", "#F4F8FE"],
    skyEdge: dark ? "rgba(255, 255, 255, 0.12)" : "#D6E2F3",
    rule: dark ? "rgba(255, 255, 255, 0.12)" : "#D6E2F3",
    chip: dark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.85)",
  };
}

/** The weather's icon: the sun by day, the moon by night when it is clear or cloudy. */
function weatherIcon(condition: WeatherCondition, isDay: boolean): IconName {
  if (condition === "clear") return isDay ? "sunny" : "moon";
  if (condition === "cloudy" && !isDay) return "cloudy-night";
  return ({ cloudy: "partly-sunny", fog: "cloud", rain: "rainy", snow: "snow", storm: "thunderstorm" } as const)[condition];
}

/**
 * `/welcome`: the page the app opens on. At the top the date and "Hoş geldin, <ad>" in the display
 * face, under a faint gold eight-pointed star (the map's mark for a monument); under them the
 * weather where the visitor is (without the location, in the city last opened on the map): now,
 * in large, and the next three days. Nothing here needs the visitor; the page
 * stays until "Devam et" opens the map.
 */
export default function WelcomePage() {
  const router = useRouter();
  const m = useMessages();
  const w = m.welcome;
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { user } = useCommunity();
  const reduced = useReducedMotion();
  const ink = usePageColors();
  const [today] = useState(() => new Date());

  // The first name when the account has a full name, else the nickname.
  const name = user?.fullName?.trim().split(/\s+/)[0] || user?.nickname || null;

  // The weather where the visitor is. Without the location (refused, or no fix), the city last
  // opened on the map, else the one with the most sites.
  const here = useHere();
  const hereWeather = useWeatherAt(here?.position ?? null);
  const lastCity = useLastCity();
  const cities = useCities();
  const biggest = cities.status === "success" ? ([...cities.data].sort((a, b) => b.assetCount - a.assetCount)[0]?.code ?? null) : null;
  const city = here !== null || lastCity === undefined ? null : (lastCity ?? biggest);
  const cityWeather = useWeather(city);
  const weather = here ? hereWeather : cityWeather;
  const forecast = weather.status === "success" ? weather.data : null;
  const place = here?.place ?? forecast?.city.label ?? "";

  const upper = (text: string) => text.toLocaleUpperCase(localeTag(lang));
  const date = upper(today.toLocaleDateString(localeTag(lang), { weekday: "long", day: "numeric", month: "long" }));

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
      <StatusBar style={ink.dark ? "light" : "dark"} />

      <Star color={ink.goldMark} top={insets.top} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl * 2, paddingBottom: footerHeight + spacing.md }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.column}>
          <Animated.View style={rise(0)}>
            <View style={styles.dateRow}>
              <View style={[styles.dateRule, { backgroundColor: ink.gold }]} />
              <Text colorValue={ink.gold} style={styles.overline}>
                {date}
              </Text>
            </View>
            <Text headingLevel={1} colorValue={ink.text} style={styles.title}>
              {w.greeting}
              {"\n"}
              <Text colorValue={ink.goldMark} style={styles.title}>
                {name ?? w.traveller}
              </Text>
            </Text>
          </Animated.View>

          {/* Told by screen readers when it arrives: it may come a moment after the greeting. */}
          <View accessibilityLiveRegion="polite" style={styles.cardSlot}>
            {forecast?.available && forecast.current && (
              <Animated.View style={rise(0.25)}>
                <WeatherCard forecast={forecast} place={place} located={here != null} today={today} />
              </Animated.View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* The way on, always in reach: the page scrolls under it. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg, backgroundColor: ink.background }]}>
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

/** A faint gold eight-pointed star in the top corner: the map's mark for a monument, as an ornament. */
function Star({ color, top }: { color: string; top: number }) {
  const size = 260;
  const middle = size / 2;
  // Two squares, one turned an eighth of a turn: the Seljuk star.
  const square = (turn: number) =>
    "M" +
    Array.from({ length: 4 }, (_, corner) => {
      const angle = turn + (Math.PI / 2) * corner;
      return [middle + Math.cos(angle) * (middle - 6), middle + Math.sin(angle) * (middle - 6)].join(",");
    }).join("L") +
    "Z";
  return (
    <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={[styles.star, { top: top - size * 0.28 }]}>
      <Svg width={size} height={size}>
        <Path d={square(0)} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={1.5} />
        <Path d={square(Math.PI / 4)} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={1.5} />
        <Circle cx={middle} cy={middle} r={middle * 0.38} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={1} />
      </Svg>
    </View>
  );
}

/**
 * The weather: a sky-coloured card with the moon's or the sun's glow in its corner. Now in large
 * (the degrees and the sky), then the next three days in a row. `located`: it is where the visitor is.
 */
function WeatherCard({ forecast, place, located, today }: { forecast: WeatherResponse; place: string; located: boolean; today: Date }) {
  const m = useMessages();
  const w = m.welcome;
  const lang = useLang();
  const ink = usePageColors();
  const now = forecast.current!;
  const degrees = Math.round(now.temperatureC);
  const days = forecast.daily.slice(0, 3);

  return (
    <View style={[styles.card, { borderColor: ink.skyEdge }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="welcome-sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ink.sky[0]} />
              <Stop offset="1" stopColor={ink.sky[1]} />
            </LinearGradient>
            <RadialGradient id="welcome-glow" cx="88%" cy="6%" r="60%">
              <Stop offset="0" stopColor={palette.altin200} stopOpacity={ink.dark ? 0.32 : 0.45} />
              <Stop offset="1" stopColor={palette.altin200} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#welcome-sky)" />
          <Rect width="100%" height="100%" fill="url(#welcome-glow)" />
        </Svg>
      </View>

      <View style={styles.cardTop}>
        <View style={[styles.place, { backgroundColor: ink.chip }]}>
          <Ionicons name={located ? "navigate" : "location"} size={13} color={ink.goldMark} />
          <Text colorValue={ink.text} style={styles.placeText}>
            {place}
          </Text>
        </View>
        <Text colorValue={ink.textSecondary} style={styles.nowLabel}>
          {w.now.toLocaleUpperCase(localeTag(lang))}
        </Text>
      </View>

      <View style={styles.nowRow} accessible accessibilityLabel={w.nowLabel(place, degrees, w.conditions[now.condition])}>
        <Text colorValue={ink.text} style={styles.degrees}>
          {w.degrees(degrees)}
        </Text>
        <View style={styles.nowSide}>
          <Ionicons name={weatherIcon(now.condition, now.isDay)} size={40} color={ink.goldMark} />
          <Text colorValue={ink.text} style={styles.condition}>
            {w.conditions[now.condition]}
          </Text>
        </View>
      </View>

      {days.length > 0 && (
        <View style={[styles.days, { borderTopColor: ink.rule }]}>
          {days.map((day, index) => {
            const label = dayLabel(day.date, today, lang);
            const high = Math.round(day.highC);
            const low = Math.round(day.lowC);
            const rain = day.precipitationProbability;
            return (
              <View
                key={day.date}
                style={[styles.day, index > 0 && { borderLeftWidth: 1, borderLeftColor: ink.rule }]}
                accessible
                accessibilityLabel={w.dayLabel(label, w.conditions[day.condition], high, low, rain)}
              >
                <Text colorValue={ink.textSecondary} style={styles.dayName}>
                  {label}
                </Text>
                <Ionicons name={weatherIcon(day.condition, true)} size={22} color={ink.goldMark} />
                <Text colorValue={ink.text} style={styles.dayTemps}>
                  {w.degrees(high)}
                  <Text colorValue={ink.textSecondary} style={styles.dayLow}>
                    {w.slashLow(low)}
                  </Text>
                </Text>
                {rain !== null && rain >= 20 && (
                  <View style={styles.rain}>
                    <Ionicons name="water" size={11} color={ink.textSecondary} />
                    <Text colorValue={ink.textSecondary} style={styles.rainText}>
                      {w.percent(rain)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Text colorValue={ink.textSecondary} style={styles.credit}>
        {forecast.attribution}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  star: {
    position: "absolute",
    right: -70,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateRule: {
    width: 24,
    height: 2,
    borderRadius: 1,
  },
  overline: {
    fontFamily: fontFamily.sansBold,
    fontSize: 12,
    letterSpacing: 2.2,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -0.5,
  },
  cardSlot: {
    flex: 1,
    justifyContent: "center",
    paddingTop: spacing.xxl,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    padding: spacing.lg,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  place: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.full,
  },
  placeText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 13,
  },
  nowLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  degrees: {
    fontFamily: fontFamily.display,
    fontSize: 88,
    lineHeight: 96,
    letterSpacing: -2,
  },
  nowSide: {
    alignItems: "flex-end",
    gap: 4,
  },
  condition: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  days: {
    flexDirection: "row",
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  dayName: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12.5,
  },
  dayTemps: {
    fontFamily: fontFamily.sansBold,
    fontSize: 15,
  },
  dayLow: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
  },
  rain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  rainText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11.5,
  },
  credit: {
    marginTop: spacing.md,
    fontSize: 11,
    opacity: 0.8,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
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

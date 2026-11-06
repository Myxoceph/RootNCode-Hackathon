import Ionicons from "@expo/vector-icons/Ionicons";
import type { WeatherCondition } from "@vagabonds/contracts";
import { Button, fontFamily, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCities, useCommunity, useMyAchievements, useWeather } from "@/data";
import { announce } from "@/lib/announce";
import { useLastCity } from "@/lib/last-city";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { dailyLine, weatherLine } from "@/lib/welcome-lines";
import { useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** The weather's icon: the sun by day, the moon by night when it is clear. */
function weatherIcon(condition: WeatherCondition, isDay: boolean): IconName {
  if (condition === "clear") return isDay ? "sunny-outline" : "moon-outline";
  return ({ cloudy: "cloudy-outline", fog: "cloud-outline", rain: "rainy-outline", snow: "snow-outline", storm: "thunderstorm-outline" } as const)[condition];
}

/**
 * `/welcome`: the page the app opens on, "Hoş geldin, <ad>", with two cards that need nothing from
 * the visitor: the day's line (the badge nearest to hand, or a tip, by turns from day to day) and
 * the weather in the city last opened on the map. It stays until the visitor goes on to the map
 * with "Keşfe başla"; it never moves on by itself.
 */
export default function WelcomePage() {
  const router = useRouter();
  const m = useMessages();
  const w = m.welcome;
  const insets = useSafeAreaInsets();
  const { user } = useCommunity();
  const { scheme, colors: c } = useTheme();
  // The dark theme's page blue; in the light one white, not the page grey.
  const background = scheme === "dark" ? c.background : c.surface;
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;

  // The first name when the account has a full name, else the nickname.
  const name = user?.fullName?.trim().split(/\s+/)[0] || user?.nickname || null;

  // The day's line: the badge nearest to hand or a tip; it waits for the badges, a tip without them.
  const achievements = useMyAchievements();
  const [today] = useState(() => new Date());
  const badges = achievements.status === "success" ? (achievements.data?.items ?? []) : null;
  const dayLine = useMemo(
    () => (achievements.status === "loading" ? null : dailyLine(badges, today)),
    [achievements.status, badges, today],
  );
  // The weather in the city last opened on the map, else in the one with the most assets.
  const lastCity = useLastCity();
  const cities = useCities();
  const biggest = cities.status === "success" ? ([...cities.data].sort((a, b) => b.assetCount - a.assetCount)[0]?.code ?? null) : null;
  const weatherCity = lastCity === undefined ? null : (lastCity ?? biggest);
  const weather = useWeather(weatherCity);
  const forecast = weather.status === "success" ? weather.data : null;
  const weatherText = weatherLine(forecast);

  useEffect(() => {
    announce(w.announce(name));
    Animated.timing(fade, { toValue: 1, duration: reduced ? 0 : 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Said once, with the name the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 24, 0] });

  return (
    <View style={[styles.screen, { backgroundColor: background }]}>
      <Head>
        <title>{m.common.title(w.title)}</title>
      </Head>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: rise }] }]}>
          <Text variant="caption" colorValue={c.highlightMark} style={styles.overline}>
            {w.overline}
          </Text>
          <Text headingLevel={1} colorValue={c.text} style={styles.title}>
            {w.greeting}
            {"\n"}
            {name ?? w.traveller}
          </Text>
          <Text colorValue={c.textSecondary} style={styles.lead}>
            {w.lead}
          </Text>

          {/* Told by screen readers as they arrive: they may come a moment after the greeting. */}
          <View style={styles.cards} accessibilityLiveRegion="polite">
            {dayLine && (
              <WelcomeCard
                icon={dayLine.kind === "badge" ? "ribbon-outline" : "bulb-outline"}
                label={dayLine.kind === "badge" ? w.badgeLabel : w.tipLabel}
                text={dayLine.text}
              />
            )}
            {weatherText && forecast?.current && (
              <WelcomeCard icon={weatherIcon(forecast.current.condition, forecast.current.isDay)} label={w.weatherLabel} text={weatherText} />
            )}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label={w.start}
          accessibilityHint={w.startHint}
          icon={<Ionicons name="map-outline" size={20} color={c.onPrimary} />}
          onPress={() => router.replace("/map")}
          style={styles.start}
        />
      </View>
    </View>
  );
}

/** One card under the greeting: what it is, then its line; it fades in when its words arrive. */
function WelcomeCard({ icon, label, text }: { icon: IconName; label: string; text: string }) {
  const { colors: c } = useTheme();
  const reduced = useReducedMotion();
  const show = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!reduced) Animated.timing(show, { toValue: 1, duration: 500, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduced, show]);
  return (
    <Animated.View style={[styles.card, { opacity: show, backgroundColor: c.surfaceRaised, borderColor: c.border }]} accessible>
      <View style={[styles.cardIcon, { borderColor: c.border }]}>
        <Ionicons name={icon} size={22} color={c.highlightMark} accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      <View style={styles.cardBody}>
        <Text variant="caption" colorValue={c.textSecondary} style={styles.cardLabel}>
          {label}
        </Text>
        <Text colorValue={c.text} style={styles.cardText}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  content: {
    width: "100%",
    maxWidth: 560,
  },
  overline: {
    fontFamily: fontFamily.sansSemiBold,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.2,
  },
  lead: {
    marginTop: spacing.md,
    fontSize: 16,
    lineHeight: 23,
  },
  cards: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    fontFamily: fontFamily.sansSemiBold,
  },
  cardText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  start: {
    width: "100%",
    maxWidth: 560,
  },
});

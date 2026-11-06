import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, Card, fontFamily, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { visuallyHidden } from "@/lib/visually-hidden";
import { Segmented } from "@/components/segmented";
import { bursaDishesIn } from "@/content/food";
import {
  formatClock,
  planRoute,
  weatherAdvice,
  type DayPlan,
  type Duration,
  type PlanItem,
  type Region,
} from "@/content/routes";
import { announce } from "@/lib/announce";
import { setDishes, useAddedDishes } from "@/lib/route-plan";
import { useLang, useMessages } from "@/i18n";
import { routeKey, saveRoute, useSavedRoutes } from "@/lib/saved-routes";

const regions = [
  { value: "bursa", label: "Bursa" },
  { value: "edirne", label: "Edirne" },
  { value: "both", label: "Bursa & Edirne" },
] as const;

const DURATIONS = ["half", "1", "2"] as const;

/**
 * Rota Planla (module 4): pick a region and a length, get a themed waqf route
 * ordered by importance and fitted to the weather. "Rotayı kaydet" keeps it in Profil ·
 * Rotalarım, which opens it here again (`/route?region=…&duration=…&dishes=…`).
 */
export default function RouteScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const m = useMessages();
  const w = m.planner;
  const lang = useLang();
  const durations = DURATIONS.map((value) => ({ value, label: w.durations[value] }));
  const params = useLocalSearchParams<{ region?: string; duration?: string; dishes?: string }>();
  const [region, setRegion] = useState<Region>("bursa");
  const [duration, setDuration] = useState<Duration>("half");
  const addedIds = useAddedDishes();
  const saved = useSavedRoutes();

  // A saved route opened from Rotalarım.
  useEffect(() => {
    if (params.region === "bursa" || params.region === "edirne" || params.region === "both") setRegion(params.region);
    if (params.duration === "half" || params.duration === "1" || params.duration === "2") setDuration(params.duration);
    if (params.dishes !== undefined) setDishes(params.dishes ? params.dishes.split(",") : []);
  }, [params.region, params.duration, params.dishes]);

  const plan = useMemo(() => planRoute(region, duration, lang), [region, duration, lang]);
  const [firstDay] = plan.days;
  const stopCount = plan.days.reduce((n, d) => n + d.stops.length, 0);
  const added = useMemo(() => bursaDishesIn(lang).filter((d) => addedIds.includes(d.id)), [addedIds, lang]);
  const isSaved = saved.some((route) => routeKey(route) === routeKey({ region, duration, dishes: [...addedIds] }));

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Head>
        <title>{m.common.title(m.screens.planRoute)}</title>
      </Head>
      {/* The tab bar names the page: the title is for screen readers only. */}
      <Text variant="title" headingLevel={1} style={visuallyHidden}>
        {m.screens.planRoute}
      </Text>
      <Text color="textSecondary">{w.intro}</Text>

      <Segmented label={w.region} options={regions} value={region} onChange={setRegion} />
      <Segmented label={w.duration} options={durations} value={duration} onChange={setDuration} look="track" />

      <View accessibilityLiveRegion="polite" style={styles.content}>
        {plan.notice && (
          <View style={[styles.notice, { borderColor: c.warning }]}>
            <Text variant="caption">{plan.notice}</Text>
          </View>
        )}
        {firstDay && (
          <>
            <WeatherCard day={firstDay} />
            <Balance share={firstDay.outdoorShare} />
            <View style={[styles.advice, { backgroundColor: c.surfaceRaised }]}>
              <Text variant="caption">{weatherAdvice(firstDay, w)}</Text>
            </View>
          </>
        )}

        <Card>
          <Text variant="overline" color="textSecondary">
            {w.routeHead(stopCount)}
          </Text>
          <Text variant="heading" headingLevel={2}>
            {plan.title}
          </Text>
          {plan.days.map((day, i) => (
            <View key={`${day.city}-${i}`} style={styles.day}>
              {plan.days.length > 1 && (
                <Text variant="overline" color="primary">
                  {w.dayHead(i + 1, day.city.toLocaleUpperCase(lang), day.weather.day.toLocaleUpperCase(lang))}
                </Text>
              )}
              <Timeline items={day.items} />
            </View>
          ))}
          {added.length > 0 && (
            <View style={styles.day}>
              <Text variant="overline" color="warning">
                {w.addedFood}
              </Text>
              <Timeline
                items={added.map((d) => ({ kind: "food", minutes: -1, label: w.foodStop, name: d.name, where: d.where }))}
              />
            </View>
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaved }}
              disabled={isSaved}
              onPress={() => {
                void saveRoute({ region, duration, dishes: [...addedIds], title: plan.title, stops: stopCount });
                announce(w.savedSaid);
              }}
              style={({ pressed }) => [styles.save, { borderColor: isSaved ? c.border : c.highlightMark }, pressed && styles.pressed]}
            >
              <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? c.textSecondary : c.highlight} />
              <Text variant="label" colorValue={isSaved ? c.textSecondary : c.highlight}>
                {isSaved ? w.saved : w.save}
              </Text>
            </Pressable>
            <View style={styles.flex}>
              <Button label={w.startOnMap} onPress={() => router.navigate("/map")} />
            </View>
          </View>
        </Card>

        <Link href="/route/food" asChild>
          <Button label={w.seeFood} variant="ghost" accessibilityRole="link" />
        </Link>
      </View>
    </ScrollView>
  );
}

function WeatherCard({ day }: { day: DayPlan }) {
  const { colors: c } = useTheme();
  const words = useMessages().planner;
  const w = day.weather;
  return (
    <Card style={styles.weather}>
      <Ionicons
        name={w.icon === "sunny" ? "sunny-outline" : "rainy-outline"}
        size={32}
        color={c.highlightMark}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.flex}>
        <Text variant="title" accessibilityLabel={words.degrees(w.high)}>{`${w.high}°`}</Text>
        <Text variant="caption" color="textSecondary">{`${day.city} · ${w.day} · ${w.sky}`}</Text>
        <Text variant="caption" color="textSecondary">
          {words.low(w.low, w.rain, w.afternoonRain)}
        </Text>
      </View>
      <View style={[styles.chip, { backgroundColor: c.surfaceRaised }]}>
        <Text variant="caption">{words.forecast}</Text>
      </View>
    </Card>
  );
}

/** Outdoor vs indoor share of the day, as a bar and in words. */
function Balance({ share }: { share: number }) {
  const { colors: c } = useTheme();
  const w = useMessages().planner;
  const pct = Math.round(share * 100);
  return (
    <View accessible accessibilityLabel={w.balanceLabel(pct)}>
      <View style={[styles.bar, { backgroundColor: c.surfaceRaised }]}>
        <View style={{ width: `${pct}%`, backgroundColor: c.success }} />
        <View style={[styles.flex, { backgroundColor: c.primary }]} />
      </View>
      <View style={styles.barLegend}>
        <Text variant="caption" color="textSecondary">{w.outdoor(pct)}</Text>
        <Text variant="caption" color="textSecondary">{w.indoor(100 - pct)}</Text>
      </View>
    </View>
  );
}

function Timeline({ items }: { items: PlanItem[] }) {
  const { colors: c } = useTheme();
  const w = useMessages().planner;
  return (
    <View accessibilityRole="list">
      {items.map((item, i) => {
        const food = item.kind === "food";
        const last = i === items.length - 1;
        const time = item.minutes >= 0 ? `${formatClock(item.minutes)} ` : "";
        const title = food ? `${item.label} · ${item.name}` : item.stop.name;
        const detail = food
          ? item.where
          : `${w.minutes(Math.round(item.stop.hours * 60))} · ${item.stop.tag}${item.stop.outdoor >= 0.6 ? w.openAir : ""}`;
        return (
          <View key={`${title}-${i}`} style={styles.stop} accessible accessibilityLabel={`${time}${title}, ${detail}`}>
            <Text variant="caption" color="textSecondary" style={styles.time}>
              {time.trim()}
            </Text>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  { borderColor: food ? c.warning : c.primary, backgroundColor: food ? c.warning : c.surface },
                ]}
              />
              {!last && <View style={[styles.line, { backgroundColor: c.border }]} />}
            </View>
            <View style={styles.flex}>
              <Text variant="label" color={food ? "warning" : "text"}>
                {title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {detail}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  save: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  flex: {
    flex: 1,
  },
  notice: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  weather: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  bar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  advice: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  day: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  stop: {
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
  },
  time: {
    width: 48,
    fontFamily: fontFamily.monoMedium,
    paddingTop: 2,
  },
  rail: {
    width: 14,
    alignItems: "center",
  },
  node: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
});

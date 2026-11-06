import Ionicons from "@expo/vector-icons/Ionicons";
import {
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
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

import type { Lang } from "@vagabonds/contracts";

import { FoodAdviceList, TransitAdviceList } from "@/components/saved-advice";
import { planRoute } from "@/content/routes";
import { announce } from "@/lib/announce";
import { bottomInset } from "@/lib/bottom-inset";
import { inkFor } from "@/lib/route-ink";
import {
  isRoute,
  removeRoute,
  routeKey,
  useSavedRoutes,
  type FoodAdvice,
  type PlannerRoute,
  type TransitAdvice,
  type TripRoute,
} from "@/lib/saved-routes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";
import { localeTag, useLang, useMessages, type Messages } from "@/i18n";

const regionLabel: Record<PlannerRoute["region"], string> = {
  bursa: "Bursa",
  edirne: "Edirne",
  both: "Bursa & Edirne",
};

type RouteEntry = PlannerRoute | TripRoute;
type Tab = "routes" | "food" | "transit";

const TABS: ReadonlyArray<Tab> = ["routes", "food", "transit"];

/** What a ticket shows: the city, the title, how long, from where, the stops and their ends. */
function ticketOf(route: RouteEntry, m: Messages, lang: Lang) {
  const w = m.saved;
  if (route.kind === "trip") {
    const stops = route.trip.days.flatMap((day) =>
      day.items.flatMap((item) =>
        item.kind === "stop" ? [item.asset.name] : [],
      ),
    );
    return {
      city: route.trip.city.label,
      code: route.trip.city.code,
      title: m.shared.tripTitle(route.trip.city.label),
      duration: w.durations[route.trip.duration],
      fromRehber: true,
      ends:
        stops.length > 1
          ? `${stops[0]} → ${stops[stops.length - 1]}`
          : (stops[0] ?? null),
    };
  }
  return {
    city: regionLabel[route.region],
    code: route.region,
    title: planRoute(route.region, route.duration, lang).title,
    duration: w.durations[route.duration],
    fromRehber: false,
    ends:
      route.dishes.length > 0
        ? w.withFood(route.dishes.length)
        : null,
  };
}

/**
 * Profil · Kaydettiklerim, one tab each for what is kept. Rotalar: the routes saved from the planner
 * ("Rotayı kaydet") and the trips Rehber planned, newest first, each as a ticket: the city on its
 * own ink, the stops as dots on a dashed line. A planner ticket opens its route in the planner
 * again, a Rehber ticket its plan day by day (./trip.tsx). New routes are planned with Rehber, where
 * "Yeni" leads. Yemek and Ulaşım: what Rehber suggested in the chat (components/saved-advice.tsx).
 */
export default function MyRoutesScreen() {
  const m = useMessages();
  const w = m.saved;
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab: wanted } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    wanted === "food" || wanted === "transit" ? wanted : "routes",
  );
  const saved = useSavedRoutes();
  const routes = saved.filter(isRoute);
  const food = saved.filter(
    (route): route is FoodAdvice => route.kind === "food",
  );
  const transit = saved.filter(
    (route): route is TransitAdvice => route.kind === "transit",
  );
  const counts: Record<Tab, number> = {
    routes: routes.length,
    food: food.length,
    transit: transit.length,
  };
  const stopTotal = routes.reduce((sum, route) => sum + route.stops, 0);
  // A wide web page: a wider column, the tabs and the summary in one bar, the tickets two to a row.
  const wide = useWideWeb();
  const head = (
    <View style={styles.head}>
      <Text variant="caption" color="textSecondary" style={styles.headText}>
        {w.summary(routes.length, stopTotal)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={w.planNew}
        onPress={() => router.navigate("/rehber")}
        style={({ pressed }) => [styles.newPill, pressed && styles.pressed]}
      >
        <Ionicons name="sparkles" size={14} color={palette.white} />
        <Text
          variant="label"
          colorValue={palette.white}
          style={styles.newPillText}
        >
          {w.newShort}
        </Text>
      </Pressable>
    </View>
  );

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
        <title>{m.common.title(m.screens.saved)}</title>
      </Head>

      <View style={wide ? styles.toolbar : undefined}>
        <View
          accessibilityRole="tablist"
          style={[
            styles.tabs,
            wide && styles.tabsWide,
            { backgroundColor: c.surfaceRaised },
          ]}
        >
          {TABS.map((key) => {
            const option = { key, label: w.tabs[key] };
            const on = option.key === tab;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={w.tabLabel(option.label, counts[option.key])}
                onPress={() => setTab(option.key)}
                style={[styles.tab, on && { backgroundColor: c.surface }]}
              >
                <Text
                  variant="caption"
                  color={on ? "text" : "textSecondary"}
                  style={styles.tabText}
                >
                  {counts[option.key] > 0
                    ? `${option.label} ${counts[option.key]}`
                    : option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {wide && tab === "routes" && routes.length > 0 && head}
      </View>

      {tab === "food" && <FoodAdviceList items={food} grid={wide} />}
      {tab === "transit" && <TransitAdviceList items={transit} grid={wide} />}
      {tab === "routes" && routes.length === 0 && (
        <Empty onNew={() => router.navigate("/rehber")} />
      )}
      {tab === "routes" && routes.length > 0 && (
        <>
          {!wide && head}
          <View
            accessibilityRole="list"
            style={wide ? styles.grid : styles.list}
          >
            {routes.map((route, i) =>
              wide ? (
                <View key={route.id} style={styles.gridCell}>
                  <Ticket route={route} index={i} />
                </View>
              ) : (
                <Ticket key={route.id} route={route} index={i} />
              ),
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** One saved route as a ticket; it rises in a moment after the one above it. */
function Ticket({ route, index }: { route: RouteEntry; index: number }) {
  const lang = useLang();
  const { colors: c } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const m = useMessages();
  const w = m.saved;
  const ticket = ticketOf(route, m, lang);
  const [light, deep] = inkFor(ticket.code);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const saved = new Date(route.savedAt).toLocaleDateString(localeTag(lang), {
    day: "numeric",
    month: "long",
  });
  // What Rehber suggested for this route, so it is found from here too.
  const forThis = useSavedRoutes().filter(
    (entry) =>
      (entry.kind === "food" || entry.kind === "transit") &&
      entry.about?.key === routeKey(route),
  );
  const adviceCounts = (["food", "transit"] as const).flatMap((kind) => {
    const count = forThis.filter((entry) => entry.kind === kind).length;
    return count > 0
      ? [kind === "food" ? w.foodCount(count) : w.transitCount(count)]
      : [];
  });

  useEffect(() => {
    if (reduced) {
      rise.setValue(1);
      return;
    }
    Animated.spring(rise, {
      toValue: 1,
      delay: Math.min(index, 8) * 70,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [index, reduced, rise]);

  const open = () =>
    route.kind === "trip"
      ? router.push({ pathname: "/profile/trip", params: { id: route.id } })
      : router.push({
          pathname: "/route",
          params: {
            region: route.region,
            duration: route.duration,
            dishes: route.dishes.join(","),
          },
        });

  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [
          {
            translateY: rise.interpolate({
              inputRange: [0, 1],
              outputRange: [18, 0],
            }),
          },
        ],
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={w.ticketLabel(ticket.title, ticket.city, ticket.duration, route.stops, ticket.fromRehber)}
        onPress={open}
        style={({ pressed }) => [
          styles.ticket,
          { backgroundColor: c.surface },
          pressed && styles.ticketPressed,
        ]}
      >
        <View
          style={styles.band}
          onLayout={(e) => setSize(e.nativeEvent.layout)}
        >
          {size.width > 0 && (
            <Svg
              key={`${size.width}x${size.height}`}
              width={size.width}
              height={size.height}
              style={StyleSheet.absoluteFill}
              aria-hidden
            >
              <Defs>
                <LinearGradient
                  id={`ink-${route.id}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <Stop offset="0" stopColor={light} />
                  <Stop offset="1" stopColor={deep} />
                </LinearGradient>
              </Defs>
              <Rect
                width={size.width}
                height={size.height}
                fill={`url(#ink-${route.id})`}
              />
              {/* A compass rose's rings in the corner, faint. */}
              <Circle
                cx={size.width * 0.92}
                cy={size.height * 0.2}
                r={46}
                stroke={palette.altin200}
                strokeOpacity={0.12}
                fill="none"
              />
              <Circle
                cx={size.width * 0.92}
                cy={size.height * 0.2}
                r={30}
                stroke={palette.altin200}
                strokeOpacity={0.1}
                strokeDasharray="2 4"
                fill="none"
              />
            </Svg>
          )}
          <View style={styles.bandTop}>
            <Text colorValue={palette.altin200} style={styles.city}>
              {ticket.city.toLocaleUpperCase(lang)}
            </Text>
            <View style={styles.chip}>
              <Ionicons
                name={ticket.fromRehber ? "sparkles" : "compass"}
                size={12}
                color={palette.altin200}
              />
              <Text colorValue={palette.gece50} style={styles.chipText}>
                {ticket.fromRehber ? m.tabs.rehber : w.planner}
              </Text>
            </View>
          </View>
          <Text
            colorValue={palette.white}
            style={styles.title}
            numberOfLines={2}
          >
            {ticket.title}
          </Text>
          <View style={styles.chip}>
            <Ionicons name="time-outline" size={12} color={palette.altin200} />
            <Text colorValue={palette.gece50} style={styles.chipText}>
              {ticket.duration}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View
            style={[
              styles.notch,
              styles.notchLeft,
              { backgroundColor: c.background },
            ]}
          />
          <View
            style={[
              styles.notch,
              styles.notchRight,
              { backgroundColor: c.background },
            ]}
          />

          <RouteLine stops={route.stops} />
          {ticket.ends && (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {ticket.ends}
            </Text>
          )}

          <View style={[styles.foot, { borderTopColor: c.border }]}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={c.textSecondary}
            />
            <Text variant="caption" color="textSecondary" style={styles.flex}>
              {[w.ticketMeta(saved, route.stops), ...adviceCounts].join(" · ")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={w.removeLabel(ticket.title)}
              onPress={() => {
                void removeRoute(route.id);
                announce(w.removed);
              }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.remove,
                pressed && { backgroundColor: c.surfaceRaised },
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={17}
                color={c.textSecondary}
              />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Dots between the flag and the pin before the rest is told as "+n". */
const MAX_DOTS = 6;

/** The stops on a dashed gold line: a flag for the first, a pin for the last, dots between. */
function RouteLine({ stops }: { stops: number }) {
  const w = useMessages().saved;
  const { colors: c } = useTheme();
  if (stops === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        {w.noStops}
      </Text>
    );
  }
  const between = Math.max(0, stops - 2);
  const dots = Math.min(between, MAX_DOTS);
  const dash = (key: string) => (
    <View key={key} style={styles.segment}>
      <Svg height={2} width="100%">
        <Line
          x1="0"
          y1="1"
          x2="100%"
          y2="1"
          stroke={c.highlightMark}
          strokeOpacity={0.6}
          strokeWidth={2}
          strokeDasharray="3 4"
        />
      </Svg>
    </View>
  );
  return (
    <View style={styles.line} aria-hidden>
      <Ionicons name="flag" size={16} color={c.highlightMark} />
      {stops > 1 && (
        <>
          {Array.from({ length: dots }, (_, i) => [
            dash(`d${i}`),
            <View
              key={`p${i}`}
              style={[
                styles.dot,
                { borderColor: c.highlightMark, backgroundColor: c.surface },
              ]}
            />,
          ])}
          {between > MAX_DOTS && (
            <Text
              variant="caption"
              colorValue={c.highlight}
              style={styles.more}
            >
              {`+${between - MAX_DOTS}`}
            </Text>
          )}
          {dash("last")}
          <Ionicons name="location" size={18} color={c.highlightMark} />
        </>
      )}
    </View>
  );
}

/** No routes yet: a dashed path between two pins, and the way to Rehber. */
function Empty({ onNew }: { onNew: () => void }) {
  const w = useMessages().saved;
  const { colors: c } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: c.surface }]}>
      <View style={styles.emptyArt} aria-hidden>
        <Svg width={220} height={90}>
          <Line
            x1={30}
            y1={60}
            x2={110}
            y2={30}
            stroke={c.highlightMark}
            strokeWidth={2}
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <Line
            x1={110}
            y1={30}
            x2={190}
            y2={55}
            stroke={c.highlightMark}
            strokeWidth={2}
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <Circle
            cx={110}
            cy={30}
            r={6}
            fill={c.surface}
            stroke={c.highlightMark}
            strokeWidth={2}
          />
        </Svg>
        <Ionicons
          name="flag"
          size={26}
          color={c.highlightMark}
          style={styles.emptyStart}
        />
        <Ionicons
          name="location"
          size={30}
          color={c.highlightMark}
          style={styles.emptyEnd}
        />
      </View>
      <Text
        variant="heading"
        headingLevel={2}
        style={[styles.centered, styles.emptyTitle]}
      >
        {w.firstTitle}
      </Text>
      <Text color="textSecondary" style={styles.centered}>
        {w.firstBody}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onNew}
        // On a wide web page the button keeps to its words instead of the whole card.
        style={({ pressed }) => [
          styles.new,
          Platform.OS === "web" && styles.newWeb,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="sparkles" size={18} color={palette.white} />
        <Text variant="label" colorValue={palette.white} style={styles.newText}>
          {w.planWithRehber}
        </Text>
      </Pressable>
    </View>
  );
}

const NOTCH = 22;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  newWeb: {
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
  },
  /** The tabs at the left, the summary and "Yeni" at the right. */
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  tabsWide: {
    width: 440,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: spacing.lg,
  },
  gridCell: {
    width: "calc(50% - 12px)" as unknown as number,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: radius.full,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  tabText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headText: {
    fontFamily: fontFamily.sansMedium,
  },
  newPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: palette.altin700,
  },
  newPillText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  list: {
    gap: spacing.lg,
  },
  ticket: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: palette.gece1000,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  ticketPressed: {
    transform: [{ scale: 0.98 }],
  },
  band: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg + spacing.xs,
  },
  bandTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  city: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.5,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    height: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  chipText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  // Half circles cut into the ticket where the band meets the body.
  notch: {
    position: "absolute",
    top: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
  },
  notchLeft: {
    left: -NOTCH / 2,
  },
  notchRight: {
    right: -NOTCH / 2,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
  },
  segment: {
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  more: {
    fontFamily: fontFamily.sansBold,
    marginHorizontal: spacing.xs,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  remove: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: 24,
  },
  emptyArt: {
    width: 220,
    height: 90,
  },
  emptyStart: {
    position: "absolute",
    left: 18,
    top: 50,
  },
  emptyEnd: {
    position: "absolute",
    left: 176,
    top: 30,
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
  },
  new: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    alignSelf: "stretch",
    minHeight: touchTarget.min + 4,
    borderRadius: radius.full,
    backgroundColor: palette.altin700,
  },
  newText: {
    fontFamily: fontFamily.sansSemiBold,
  },
});

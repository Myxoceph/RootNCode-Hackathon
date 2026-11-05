import Ionicons from "@expo/vector-icons/Ionicons";
import type { TripDay, TripItem, TripPlanResponse } from "@vagabonds/contracts";
import {
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, type ComponentProps } from "react";
import {
  Animated,
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
  Rect,
  Stop,
} from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { formatClock } from "@/content/routes";
import { RouteAdvice } from "@/components/saved-advice";
import { announce } from "@/lib/announce";
import { bottomInset } from "@/lib/bottom-inset";
import { inkFor } from "@/lib/route-ink";
import {
  removeRoute,
  routeKey,
  useSavedRoutes,
  type TripRoute,
} from "@/lib/saved-routes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";

type IconName = ComponentProps<typeof Ionicons>["name"];

const durationLabel: Record<TripPlanResponse["duration"], string> = {
  half: "Yarım gün",
  "1": "1 gün",
  "2": "2 gün",
};
const weatherIcon: Record<TripDay["weatherNote"]["code"], IconName> = {
  afternoon_rain: "rainy",
  rain_possible: "umbrella",
  heat: "thermometer",
  clear: "sunny",
  unavailable: "cloud-outline",
};
const settingLabel = {
  indoor: "Kapalı",
  outdoor: "Açık hava",
  mixed: "Açık + kapalı",
} as const;
/** The API calls them "Öğle molası" and "Tatlı durağı"; these say what the break is for. */
const mealLabel = {
  lunch: "Öğle yemeği molası",
  dessert: "Tatlı molası",
} as const;
const NODE = 30;

/** "850 m", "1,2 km". */
function distance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1).replace(".", ",")} km`
    : `${meters} m`;
}

/** "1 sa 20 dk", "45 dk". */
function minutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? (m > 0 ? `${h} sa ${m} dk` : `${h} sa`) : `${m} dk`;
}

/**
 * Profil · Rotalarım · a trip Rehber planned: the city's band with the weather and the day's
 * totals, then the day as a timeline, each site a card with its photo that opens it, the walking
 * distance between them on the line (no walking times), and the breaks in coral.
 */
export default function SavedTripScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const route = useSavedRoutes().find((r) => r.id === id);
  const trip = route?.kind === "trip" ? route : null;

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
      <Stack.Screen options={{ title: trip?.title ?? "Rota" }} />
      <Head>
        <title>{`${trip?.title ?? "Rota"} · Vagabonds`}</title>
      </Head>

      {trip ? (
        <>
          <Hero route={trip} />
          {/* A wide web page: the days on the left, what Rehber suggested for them on the right. */}
          <View style={wide ? styles.split : styles.stack}>
            <View style={wide ? styles.splitMain : styles.stack}>
              {trip.trip.days.map((day) => (
                <Day
                  key={day.day}
                  day={day}
                  multiDay={trip.trip.days.length > 1}
                />
              ))}
            </View>
            <View style={wide ? styles.splitSide : styles.stack}>
              <RouteAdvice routeKey={routeKey(trip)} />
            </View>
          </View>
          {/* The API's note is about walking times, which this page leaves out. */}
          <Text variant="caption" color="textSecondary" style={styles.note}>
            Yürüme mesafeleri kuş uçuşu mesafeden tahmin edilmiştir.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void removeRoute(trip.id);
              announce("Rota silindi.");
              router.back();
            }}
            style={({ pressed }) => [
              styles.remove,
              pressed && { backgroundColor: c.surfaceRaised },
            ]}
          >
            <Ionicons name="trash-outline" size={17} color={c.warning} />
            <Text variant="label" color="warning">
              Rotayı sil
            </Text>
          </Pressable>
        </>
      ) : (
        <Text color="textSecondary" style={styles.centered}>
          Bu rota artık kayıtlı değil.
        </Text>
      )}
    </ScrollView>
  );
}

/** The city's band, as on its ticket in Rotalarım: title, chips, and the trip's totals. */
function Hero({ route }: { route: TripRoute }) {
  const { trip } = route;
  const [light, deep] = inkFor(trip.city.code);
  const meters = trip.days.reduce((sum, day) => sum + day.totals.walkMeters, 0);
  const visit = trip.days.reduce(
    (sum, day) => sum + day.totals.visitMinutes,
    0,
  );
  const walk = distance(meters);
  const saved = new Date(route.savedAt).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
  });

  return (
    <View style={styles.hero}>
      {/* Sized outright: on the web an SVG without a width keeps its 300px default, not its box's. */}
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        aria-hidden
      >
        <Defs>
          <LinearGradient id="trip-ink" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={light} />
            <Stop offset="1" stopColor={deep} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#trip-ink)" />
        <Circle
          cx="90%"
          cy="18%"
          r={70}
          stroke={palette.altin200}
          strokeOpacity={0.12}
          fill="none"
        />
        <Circle
          cx="90%"
          cy="18%"
          r={46}
          stroke={palette.altin200}
          strokeOpacity={0.1}
          strokeDasharray="2 4"
          fill="none"
        />
      </Svg>

      <Text colorValue={palette.altin200} style={styles.city}>
        {trip.city.label.toLocaleUpperCase("tr")}
      </Text>
      <Text
        colorValue={palette.white}
        style={styles.heroTitle}
        headingLevel={1}
      >
        {route.title}
      </Text>
      <View style={styles.chips}>
        <Chip icon="sparkles" text="Rehber" />
        <Chip icon="time-outline" text={durationLabel[trip.duration]} />
        <Chip icon="bookmark-outline" text={saved} />
      </View>

      <View
        style={styles.totals}
        accessible
        accessibilityLabel={`${route.stops} durak, ${minutes(visit)} ziyaret, ${walk} yürüyüş`}
      >
        <Total value={String(route.stops)} label="durak" />
        <View style={styles.totalRule} />
        <Total value={minutes(visit)} label="ziyaret" />
        <View style={styles.totalRule} />
        <Total value={walk} label="yürüyüş" />
      </View>
    </View>
  );
}

function Chip({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color={palette.altin200} />
      <Text colorValue={palette.gece50} style={styles.chipText}>
        {text}
      </Text>
    </View>
  );
}

function Total({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.total}>
      <Text
        colorValue={palette.white}
        style={styles.totalValue}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text colorValue={palette.gece300} style={styles.totalLabel}>
        {label}
      </Text>
    </View>
  );
}

/** One day: its weather as a note, then its stops and breaks on the timeline. */
function Day({ day, multiDay }: { day: TripDay; multiDay: boolean }) {
  const { colors: c } = useTheme();
  let stop = 0;
  return (
    <View style={styles.day}>
      {multiDay && (
        <Text
          variant="overline"
          color="textSecondary"
          style={styles.dayTitle}
          headingLevel={2}
        >
          {`${day.day}. GÜN · ${new Date(day.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }).toLocaleUpperCase("tr")}`}
        </Text>
      )}
      <View
        style={[
          styles.weather,
          { backgroundColor: c.surface, borderColor: c.border },
        ]}
      >
        <View
          style={[styles.weatherIcon, { backgroundColor: c.surfaceRaised }]}
        >
          <Ionicons
            name={weatherIcon[day.weatherNote.code]}
            size={18}
            color={c.highlightMark}
          />
        </View>
        <Text variant="caption" color="textSecondary" style={styles.flex}>
          {day.weatherNote.text}
        </Text>
      </View>

      <View accessibilityRole="list">
        {day.items.map((item, i) => {
          if (item.kind === "stop") stop += 1;
          return (
            <Row
              key={`${i}-${item.kind}-${item.at}`}
              item={item}
              number={stop}
              index={i}
              last={i === day.items.length - 1}
            />
          );
        })}
      </View>
    </View>
  );
}

/** One item on the timeline: the walk to it on the line, its node, and its card; it rises in. */
function Row({
  item,
  number,
  index,
  last,
}: {
  item: TripItem;
  number: number;
  index: number;
  last: boolean;
}) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      rise.setValue(1);
      return;
    }
    Animated.spring(rise, {
      toValue: 1,
      delay: Math.min(index, 12) * 60,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [index, reduced, rise]);

  const meal = item.kind === "meal";
  const walk = item.kind === "stop" && item.legMeters > 0;
  const coral = c.warning;
  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [
          {
            translateX: rise.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      }}
    >
      {/* Always a gap on the line before an item, so neighbours never touch; the walk to it when there is one. */}
      {index > 0 && (
        <View style={[styles.leg, !walk && styles.legEmpty]}>
          <View style={styles.rail}>
            <View
              style={[styles.railLine, { backgroundColor: c.highlightMark }]}
            />
          </View>
          {walk && (
            <>
              <Ionicons name="walk" size={14} color={c.textSecondary} />
              <Text variant="caption" color="textSecondary">
                {distance(item.legMeters)}
              </Text>
            </>
          )}
        </View>
      )}
      <View style={styles.row}>
        <View style={styles.rail}>
          <View
            style={[
              styles.railLine,
              styles.railTop,
              {
                backgroundColor: index === 0 ? "transparent" : c.highlightMark,
              },
            ]}
          />
          <View
            style={[
              styles.node,
              meal
                ? { backgroundColor: coral }
                : {
                    backgroundColor: c.surface,
                    borderColor: c.highlightMark,
                    borderWidth: 2,
                  },
            ]}
          >
            {meal ? (
              <Ionicons
                name={item.meal === "dessert" ? "ice-cream" : "restaurant"}
                size={14}
                color={palette.white}
              />
            ) : (
              <Text colorValue={c.highlight} style={styles.nodeText}>
                {number}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.railLine,
              { backgroundColor: last ? "transparent" : c.highlightMark },
            ]}
          />
        </View>

        {item.kind === "stop" ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${formatClock(item.at)}, ${item.asset.name}, ${item.visitMinutes} dakika. Eseri aç`}
            onPress={() =>
              router.push({
                pathname: "/asset/[id]",
                params: { id: item.asset.id },
              })
            }
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: c.surface },
              pressed && styles.cardPressed,
            ]}
          >
            <View style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>
              {item.asset.cover ? (
                <AssetImage media={item.asset.cover} decorative fill />
              ) : (
                <Ionicons
                  name="business-outline"
                  size={20}
                  color={c.textSecondary}
                />
              )}
            </View>
            <View style={styles.flex}>
              <Text colorValue={c.highlight} style={styles.clock}>
                {formatClock(item.at)}
              </Text>
              <Text variant="label" style={styles.cardTitle} numberOfLines={2}>
                {item.asset.name}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {`${item.visitMinutes} dk · ${settingLabel[item.setting]}`}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={c.textSecondary}
            />
          </Pressable>
        ) : (
          <View
            style={[styles.card, styles.mealCard, { borderColor: coral }]}
            accessible
            accessibilityLabel={`${formatClock(item.at)}, ${mealLabel[item.meal]}${item.dish ? `, yöresel lezzet: ${item.dish.name}` : ""}, ${item.minutes} dakika`}
          >
            <View style={styles.flex}>
              <Text colorValue={coral} style={styles.clock}>
                {`${formatClock(item.at)} · ${item.minutes} dk`}
              </Text>
              <Text variant="label" style={styles.cardTitle}>
                {mealLabel[item.meal]}
              </Text>
              {item.dish && (
                <Text variant="caption" color="textSecondary">
                  {`Yöresel lezzet: ${item.dish.name}`}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.lg,
  },
  split: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  splitMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.lg,
  },
  splitSide: {
    width: 420,
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 26,
    overflow: "hidden",
  },
  city: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.5,
  },
  heroTitle: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 36,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  chipText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  totals: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  total: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  totalValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 18,
    lineHeight: 24,
  },
  totalLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  totalRule: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  day: {
    gap: spacing.md,
  },
  dayTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  weather: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  weatherIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  leg: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 28,
  },
  legEmpty: {
    minHeight: spacing.md,
  },
  row: {
    flexDirection: "row",
  },
  rail: {
    width: NODE + spacing.md,
    alignItems: "center",
    alignSelf: "stretch",
    paddingRight: spacing.md,
  },
  railLine: {
    width: 2,
    flex: 1,
    opacity: 0.45,
  },
  railTop: {
    flex: 0,
    height: spacing.md,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 13,
    lineHeight: 16,
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: 18,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  mealCard: {
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  clock: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  cardTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 15,
  },
  note: {
    textAlign: "center",
  },
  remove: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min,
    borderRadius: radius.full,
  },
});

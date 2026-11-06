import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  SavedAnswerAbout,
  TransitItinerary,
  TransitLeg,
  Lang,
} from "@vagabonds/contracts";
import {
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { announce } from "@/lib/announce";
import { inkFor } from "@/lib/route-ink";
import {
  menuOf,
  removeRoute,
  routeKey,
  useSavedRoutes,
  type FoodAdvice,
  type TransitAdvice,
} from "@/lib/saved-routes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { localeTag, useLang, useMessages } from "@/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Dishes on a menu before "Tümünü gör". */
const MENU_DISHES = 2;
const NOTCH = 22;

const legIcons: Record<TransitLeg["mode"], IconName> = {
  walk: "walk-outline",
  bus: "bus-outline",
  tram: "train-outline",
};

const savedOn = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(localeTag(lang), { day: "numeric", month: "long" });

type Advice = FoodAdvice | TransitAdvice;

const adviceCard = (item: Advice, index: number) =>
  item.kind === "food" ? (
    <FoodCard key={item.id} item={item} index={index} />
  ) : (
    <TransitCard key={item.id} item={item} index={index} />
  );

/** The answers under what they were asked about, newest first; the rest come last, as "Diğer". */
function groupsOf<T extends Advice>(items: readonly T[]) {
  const groups = new Map<
    string,
    { about: SavedAnswerAbout | null; items: T[] }
  >();
  for (const item of items) {
    const key = item.about?.key ?? "";
    const group = groups.get(key) ?? { about: item.about, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.about === null) - Number(b.about === null),
  );
}

/** What a group of answers is for: the route (with its length and day, as two plans can share a city) or the asset, and the way there. */
function GroupHead({
  about,
  alone,
  icon,
}: {
  about: SavedAnswerAbout | null;
  alone: boolean;
  icon: boolean;
}) {
  const lang = useLang();
  const m = useMessages();
  const w = useMessages().advice;
  const { colors: c } = useTheme();
  const router = useRouter();
  const trip = useSavedRoutes().find(
    (route) =>
      route.kind === "trip" &&
      about?.kind === "route" &&
      routeKey(route) === about.key,
  );
  if (!about) {
    if (alone) return null;
    return (
      <Text variant="overline" headingLevel={2} color="textSecondary">
        {w.other}
      </Text>
    );
  }
  const firstDay = trip?.kind === "trip" ? trip.trip.days[0]?.date : undefined;
  const details =
    trip?.kind === "trip"
      ? [m.saved.durations[trip.trip.duration], firstDay && savedOn(firstDay, lang)]
          .filter(Boolean)
          .join(" · ")
      : null;
  const href: Href | null =
    about.kind === "asset"
      ? { pathname: "/asset/[id]", params: { id: about.key } }
      : trip
        ? { pathname: "/profile/trip", params: { id: trip.id } }
        : null;
  const words = (
    <>
      {icon && (
        <Ionicons
          name={about.kind === "route" ? "map" : "business"}
          size={18}
          color={c.highlightMark}
          style={styles.groupIcon}
        />
      )}
      <View style={styles.flex}>
        <Text variant="label" headingLevel={2}>
          {about.title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {details ??
            (about.kind === "route"
              ? w.routeGone
              : w.forSite)}
        </Text>
      </View>
    </>
  );
  if (!href) return <View style={styles.group}>{words}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${about.title}${details ? `, ${details}` : ""}, ${about.kind === "route" ? w.opensRoute : w.opensSite}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.group, pressed && styles.pressed]}
    >
      {words}
      <Ionicons name="chevron-forward" size={17} color={c.textSecondary} />
    </Pressable>
  );
}

function Groups<T extends Advice>({
  items,
  headIcon = true,
  grid = false,
}: {
  items: readonly T[];
  headIcon?: boolean;
  grid?: boolean;
}) {
  const groups = groupsOf(items);
  // A wide web page: several groups stand side by side, each a column of its own; one group lays
  // its cards out two to a row instead.
  const sideBySide = grid && groups.length > 1;
  const inner = grid && !sideBySide;
  return (
    <View style={sideBySide ? styles.grid : styles.groups}>
      {groups.map((group) => (
        <View
          key={group.about?.key ?? "other"}
          style={[styles.list, sideBySide && styles.gridCell]}
        >
          {/* Side by side, the heads take the same height, so the cards under them start level. */}
          <View style={sideBySide ? styles.evenHead : undefined}>
            <GroupHead
              about={group.about}
              alone={groups.length === 1}
              icon={headIcon}
            />
          </View>
          <View
            accessibilityRole="list"
            style={inner ? styles.grid : styles.list}
          >
            {inner
              ? group.items.map((item, i) => (
                  <View key={item.id} style={styles.gridCell}>
                    {adviceCard(item, i)}
                  </View>
                ))
              : group.items.map(adviceCard)}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Kaydettiklerim · Yemek: the food Rehber suggested, under the route or asset it was for. */
export function FoodAdviceList({
  items,
  grid = false,
}: {
  items: readonly FoodAdvice[];
  grid?: boolean;
}) {
  const w = useMessages().advice;
  if (items.length === 0)
    return (
      <Empty
        icon="restaurant-outline"
        title={w.noFood}
        text={w.noFoodBody}
      />
    );
  return <Groups items={items} headIcon={false} grid={grid} />;
}

/** A trip's page: what Rehber suggested for this route, food first. Nothing shows until there is some. */
export function RouteAdvice({ routeKey: key }: { routeKey: string }) {
  const w = useMessages().advice;
  const saved = useSavedRoutes();
  const items = saved.filter(
    (route): route is Advice =>
      (route.kind === "food" || route.kind === "transit") &&
      route.about?.key === key,
  );
  if (items.length === 0) return null;
  const inOrder = [...items].sort(
    (a, b) => Number(a.kind === "transit") - Number(b.kind === "transit"),
  );
  return (
    <View style={styles.list}>
      <Text variant="overline" headingLevel={2} color="textSecondary">
        {w.forThisRoute}
      </Text>
      {inOrder.map(adviceCard)}
    </View>
  );
}

/**
 * A food suggestion as a menu: the city's ink and the dishes' names on top, what was asked, then
 * each dish with its story, gold marks down the side. The rest of a long one opens below.
 */
function FoodCard({ item, index }: { item: FoodAdvice; index: number }) {
  const lang = useLang();
  const w = useMessages().advice;
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const code = item.dishes[0]?.id.split("-")[0] ?? "";
  const { intro, dishes, outro } = menuOf(item.answer);
  const shown = open ? dishes : dishes.slice(0, MENU_DISHES);
  const hidden = dishes.length - shown.length;
  const long = dishes.length === 0 && intro.length > 220;
  return (
    <Ticket
      index={index}
      code={code}
      id={item.id}
      savedAt={item.savedAt}
      title={item.title}
      spoken={w.foodSpoken}
      band={
        <>
          <BandTop
            label={code.toLocaleUpperCase(lang)}
            icon="restaurant"
            tag="Sofra"
          />
          <Text
            headingLevel={3}
            colorValue={palette.white}
            style={styles.bandTitle}
            numberOfLines={3}
          >
            {item.title}
          </Text>
        </>
      }
    >
      <Asked question={item.question} />
      {intro.length > 0 && (
        <Text
          color="textSecondary"
          numberOfLines={long && !open ? 4 : undefined}
        >
          {intro}
        </Text>
      )}
      {shown.length > 0 && (
        <View accessibilityRole="list" style={styles.menu}>
          {shown.map((dish) => (
            <View key={dish.name} style={styles.dish}>
              <View
                style={[styles.diamond, { backgroundColor: c.highlightMark }]}
              />
              <View style={styles.flex}>
                <Text style={styles.dishName}>{dish.name}</Text>
                {dish.text.length > 0 && (
                  <Text color="textSecondary">{dish.text}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {open && outro.length > 0 && <Text color="textSecondary">{outro}</Text>}
      {(hidden > 0 ||
        long ||
        (outro.length > 0 && !open) ||
        (open && dishes.length > MENU_DISHES)) && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={styles.more}
        >
          <Text variant="label" color="highlight">
            {open
              ? w.collapse
              : hidden > 0
                ? w.moreDishes(hidden)
                : w.readMore}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={c.highlight}
          />
        </Pressable>
      )}
    </Ticket>
  );
}

/** Kaydettiklerim · Ulaşım: the directions Rehber gave, under the route or asset they were for. */
export function TransitAdviceList({
  items,
  grid = false,
}: {
  items: readonly TransitAdvice[];
  grid?: boolean;
}) {
  const w = useMessages().advice;
  if (items.length === 0)
    return (
      <Empty
        icon="bus-outline"
        title={w.noTransit}
        text={w.noTransitBody}
      />
    );
  return <Groups items={items} grid={grid} />;
}

/**
 * Directions as a boarding pass: where from and where to large on the city's ink, how long and how
 * many changes, then the way itself as stops on a line. Other ways to go are a tap away.
 */
function TransitCard({ item, index }: { item: TransitAdvice; index: number }) {
  const lang = useLang();
  const w = useMessages().advice;
  const { colors: c } = useTheme();
  const { itineraries, from, to, source } = item.transit;
  const [way, setWay] = useState(0);
  const itinerary = itineraries[way] ?? itineraries[0];
  if (!itinerary) return null;
  const transfers =
    itinerary.transfers > 0 ? w.transfers(itinerary.transfers) : w.direct;
  return (
    <Ticket
      index={index}
      code={item.transit.city}
      id={item.id}
      savedAt={item.savedAt}
      title={item.title}
      spoken={w.transitSpoken}
      band={
        <>
          <BandTop
            label={item.transit.city.toLocaleUpperCase(lang)}
            icon="bus"
            tag={w.boardingPass}
          />
          <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={w.journeyLabel(from.name, to.name)}
            style={styles.journey}
          >
            <Text
              colorValue={palette.white}
              style={[styles.journeyEnd, styles.flex]}
              numberOfLines={3}
            >
              {from.name}
            </Text>
            <View style={styles.journeyWay} aria-hidden>
              <View style={styles.journeyDash}>
                <Svg height={2} width="100%">
                  <Line
                    x1="0"
                    y1="1"
                    x2="100%"
                    y2="1"
                    stroke={palette.altin200}
                    strokeOpacity={0.7}
                    strokeWidth={2}
                    strokeDasharray="3 4"
                  />
                </Svg>
              </View>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={palette.altin200}
              />
            </View>
            <Text
              colorValue={palette.white}
              style={[styles.journeyEnd, styles.journeyTo, styles.flex]}
              numberOfLines={3}
            >
              {to.name}
            </Text>
          </View>
          <View style={styles.chips}>
            <Chip
              icon="time-outline"
              text={w.minutes(itinerary.durationMinutes)}
            />
            <Chip icon="swap-horizontal" text={transfers} />
            <Chip icon="walk-outline" text={`${itinerary.walkMeters} m`} />
          </View>
        </>
      }
    >
      <Asked question={item.question} />
      {itineraries.length > 1 && (
        <View accessibilityRole="tablist" style={styles.ways}>
          {itineraries.map((option, i) => (
            <Pressable
              key={i}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === way }}
              accessibilityLabel={w.wayLabel(i + 1, option.durationMinutes)}
              onPress={() => setWay(i)}
              style={[
                styles.wayTab,
                { borderColor: i === way ? c.highlightMark : c.border },
              ]}
            >
              <Text
                variant="caption"
                color={i === way ? "text" : "textSecondary"}
                style={styles.wayText}
              >
                {w.minutes(option.durationMinutes)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View accessibilityRole="list">
        {itinerary.legs.map((leg, i) => (
          <Leg key={i} leg={leg} last={i === itinerary.legs.length - 1} />
        ))}
      </View>
      {/* Times change with the timetable: the legs are kept, the clock is not promised. */}
      <Text variant="caption" color="textSecondary">
        {w.timetable(source.name)}
      </Text>
    </Ticket>
  );
}

/** White on a dark line color, ink on a light one: colors come from the timetable. */
function onColor(hex: string): string {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) =>
    parseInt(hex.slice(i, i + 2), 16),
  );
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
    ? palette.gece900
    : palette.white;
}

/** One step of the way: its mode on the line down the side, the bus or tram's own badge, where from and to. */
function Leg({ leg, last }: { leg: TransitLeg; last: boolean }) {
  const w = useMessages().advice;
  const { colors: c } = useTheme();
  const walking = !leg.line;
  return (
    <View style={styles.leg}>
      <View style={styles.legRail} aria-hidden>
        <View
          style={[
            styles.legNode,
            walking
              ? { borderColor: c.border, backgroundColor: c.surface }
              : {
                  borderColor: c.highlightMark,
                  backgroundColor: c.highlightMark,
                },
          ]}
        >
          <Ionicons
            name={legIcons[leg.mode]}
            size={14}
            color={walking ? c.textSecondary : c.onPrimary}
          />
        </View>
        {!last && (
          <View
            style={[
              styles.legLine,
              { backgroundColor: walking ? c.border : c.highlightMark },
            ]}
          />
        )}
      </View>
      <View style={[styles.flex, !last && styles.legBody]}>
        {leg.line ? (
          <>
            <View style={styles.legHead}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: leg.line.color ?? c.surfaceRaised },
                ]}
              >
                <Text
                  variant="caption"
                  colorValue={leg.line.color ? onColor(leg.line.color) : c.text}
                  style={styles.badgeText}
                  numberOfLines={2}
                >
                  {leg.line.name}
                </Text>
              </View>
            </View>
            <Text>{`${leg.from.name} → ${leg.to.name}`}</Text>
            <Text variant="caption" color="textSecondary">
              {[
                w.minutes(leg.durationMinutes),
                leg.stopsBetween > 0 && w.stops(leg.stopsBetween),
                leg.headsign && w.towards(leg.headsign),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </>
        ) : (
          <Text color="textSecondary">{w.walkTo(leg.to.name, leg.distanceMeters)}</Text>
        )}
      </View>
    </View>
  );
}

function BandTop({
  label,
  icon,
  tag,
}: {
  label: string;
  icon: IconName;
  tag: string;
}) {
  return (
    <View style={styles.bandTop}>
      <Text colorValue={palette.altin200} style={styles.city}>
        {label}
      </Text>
      <Chip icon={icon} text={tag} />
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

/** What was asked, as the visitor put it. */
function Asked({ question }: { question: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.asked, { borderLeftColor: c.highlightMark }]}>
      <Text variant="caption" color="textSecondary">
        {question}
      </Text>
    </View>
  );
}

/** The card Rotalar's tickets are made of: the city's ink with a compass rose, cut notches, then paper. It rises in after the one above. */
function Ticket({
  index,
  code,
  id,
  title,
  savedAt,
  spoken,
  band,
  children,
}: {
  index: number;
  code: string;
  id: string;
  title: string;
  savedAt: string;
  spoken: string;
  band: ReactNode;
  children: ReactNode;
}) {
  const lang = useLang();
  const w = useMessages().advice;
  const { colors: c } = useTheme();
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const [light, deep] = inkFor(code);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  return (
    <Animated.View
      style={[
        styles.ticket,
        {
          backgroundColor: c.surface,
          opacity: rise,
          transform: [
            {
              translateY: rise.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.band} onLayout={(e) => setSize(e.nativeEvent.layout)}>
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
                id={`advice-ink-${id}`}
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
              fill={`url(#advice-ink-${id})`}
            />
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
        {band}
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
        {children}
        <View style={[styles.foot, { borderTopColor: c.border }]}>
          <Ionicons name="calendar-outline" size={14} color={c.textSecondary} />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {savedOn(savedAt, lang)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.deleteLabel(title, spoken)}
            hitSlop={6}
            onPress={() => {
              void removeRoute(id);
              announce(w.deleted);
            }}
            style={({ pressed }) => [
              styles.remove,
              pressed && { backgroundColor: c.surfaceRaised },
            ]}
          >
            <Ionicons name="trash-outline" size={17} color={c.textSecondary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  const w = useMessages().advice;
  const { colors: c } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.empty, { backgroundColor: c.surface }]}>
      <View style={[styles.emptyMark, { borderColor: c.highlightMark }]}>
        <Ionicons name={icon} size={26} color={c.highlight} />
      </View>
      <Text variant="heading" headingLevel={2} style={styles.centered}>
        {title}
      </Text>
      <Text color="textSecondary" style={styles.centered}>
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate("/rehber")}
        style={styles.more}
      >
        <Text variant="label" color="highlight">
          {w.askRehber}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.75,
  },
  groups: {
    gap: spacing.xl,
  },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min,
  },
  groupIcon: {
    alignSelf: "flex-start",
    marginTop: 3,
  },
  list: {
    gap: spacing.md,
  },
  /** A wide web page: the cards two to a row. */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: spacing.lg,
  },
  evenHead: {
    minHeight: 52,
    justifyContent: "flex-end",
  },
  gridCell: {
    width: "calc(50% - 12px)" as unknown as number,
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
  band: {
    overflow: "hidden",
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
  bandTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
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
  journey: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  journeyEnd: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
  },
  journeyTo: {
    textAlign: "right",
  },
  journeyWay: {
    flexDirection: "row",
    alignItems: "center",
    width: 48,
  },
  journeyDash: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  // Half circles cut into the card where the band meets the body.
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
  asked: {
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
  },
  menu: {
    gap: spacing.md,
  },
  dish: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  diamond: {
    width: 8,
    height: 8,
    marginTop: 9,
    transform: [{ rotate: "45deg" }],
  },
  dishName: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    lineHeight: 26,
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xxs,
    minHeight: touchTarget.min,
  },
  ways: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  wayTab: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  wayText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  leg: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  legRail: {
    alignItems: "center",
    width: 28,
  },
  legNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  legLine: {
    flex: 1,
    width: 2,
    minHeight: spacing.md,
  },
  legBody: {
    paddingBottom: spacing.md,
  },
  legHead: {
    flexDirection: "row",
    marginBottom: spacing.xxs,
  },
  badge: {
    flexShrink: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontFamily: fontFamily.sansBold,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
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
});

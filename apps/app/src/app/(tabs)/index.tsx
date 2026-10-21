import { Button, fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Link, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FogMap, linkColor, MAP_FOCUS, type MapTransform } from "@/components/fog-map";
import { Star } from "@/components/star";
import {
  linkKindLabel,
  networkLinks,
  networkMonuments,
  startingMonuments,
  type NetworkLink,
} from "@/content/bursa-network";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** Fog radius around a resolved monument, in map units. */
const CLEAR_RADIUS = 46;
const REVEAL_MS = 900;
/** Room kept free for the header card and the bottom sheet when fitting the map. */
const HEADER_SPACE = 150;
const SHEET_SPACE = 250;

const byId = Object.fromEntries(networkMonuments.map((m) => [m.id, m]));
const nameOf = (id: string) => byId[id]?.name ?? id;

function initialRadii(): Record<string, number> {
  return Object.fromEntries(networkMonuments.map((m) => [m.id, startingMonuments.includes(m.id) ? CLEAR_RADIUS : 0]));
}

/**
 * Harita (module 3): the city starts under a "history fog". Each resolved
 * monument clears its fog and points, with a dashed gold trail, to a linked
 * monument still hidden. Finding it draws the link in its relation color.
 */
export default function MapScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const router = useRouter();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [resolved, setResolved] = useState<string[]>(startingMonuments);
  /** Fog clearing radius per monument; grows while a monument is being revealed. */
  const [radii, setRadii] = useState(initialRadii);
  const [selected, setSelected] = useState("emir");
  const [lastLink, setLastLink] = useState<NetworkLink | null>(null);
  const frame = useRef<number | null>(null);

  const found = (id: string) => resolved.includes(id);
  const drawn = networkLinks.filter((l) => found(l.from) && found(l.to));
  const hints = networkLinks.filter((l) => found(l.from) !== found(l.to));
  const nextHint = hints.find((l) => l.from === selected || l.to === selected) ?? hints[0];
  const target = nextHint ? (found(nextHint.from) ? nextHint.to : nextHint.from) : null;
  const resolvedCount = resolved.length;

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  function reveal(id: string) {
    setSelected(id);
    if (found(id)) {
      setLastLink(null);
      return;
    }
    const newLink = networkLinks.find((l) => (l.from === id && found(l.to)) || (l.to === id && found(l.from))) ?? null;
    const done = () => {
      setRadii((r) => ({ ...r, [id]: CLEAR_RADIUS }));
      setResolved((list) => [...list, id]);
      setLastLink(newLink);
      AccessibilityInfo.announceForAccessibility(
        `${nameOf(id)} çözüldü.${newLink ? ` ${linkKindLabel[newLink.kind]} tamamlandı.` : ""}`,
      );
    };
    if (reduceMotion) return done();
    const start = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / REVEAL_MS);
      if (k >= 1) {
        frame.current = null;
        return done();
      }
      setRadii((r) => ({ ...r, [id]: CLEAR_RADIUS * (1 - (1 - k) ** 3) }));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }

  function reset() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setRadii(initialRadii());
    setResolved(startingMonuments);
    setSelected("emir");
    setLastLink(null);
  }

  // Fit the monuments into the space between the header card and the sheet.
  const transform = useMemo<MapTransform>(() => {
    const top = insets.top + HEADER_SPACE;
    const free = Math.max(160, size.height - top - SHEET_SPACE);
    const scale = Math.min(size.width / MAP_FOCUS.width, free / MAP_FOCUS.height, 3);
    return { scale, x: size.width / 2 - MAP_FOCUS.cx * scale, y: top + free / 2 - MAP_FOCUS.cy * scale };
  }, [size, insets.top]);

  const sel = byId[selected];
  let kicker = "Çözüldü";
  let kickerColor = c.highlight;
  let body = sel ? `${sel.summary}.` : "";
  if (lastLink) {
    kicker = `Hat tamamlandı · ${linkKindLabel[lastLink.kind]}`;
    kickerColor = c.text;
    body = lastLink.resolved;
  }
  body += nextHint ? ` ${lastLink ? "Sıradaki: " : ""}${nextHint.hint}` : " Bursa ağının tamamı açıldı.";

  return (
    <View style={[styles.screen, { backgroundColor: c.mapBackground }]} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <Head>
        <title>Harita · Vagabonds</title>
      </Head>
      {size.width > 0 && (
        <FogMap
          width={size.width}
          height={size.height}
          transform={transform}
          monuments={networkMonuments}
          radii={radii}
          drawn={drawn}
          hints={hints}
        />
      )}

      {size.width > 0 &&
        networkMonuments.map((m) => {
          const left = m.x * transform.scale + transform.x;
          const top = m.y * transform.scale + transform.y;
          return found(m.id) ? (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`${m.name}, çözüldü`}
              aria-selected={m.id === selected}
              onPress={() => reveal(m.id)}
              style={[styles.pin, { left: left - touchTarget.min / 2, top: top - touchTarget.min / 2 }]}
            >
              <Star size={m.id === selected ? 28 : 24} color={c.highlightMark} />
              <View style={[styles.pinLabel, { backgroundColor: c.surface }]}>
                <Text variant="caption" style={styles.pinText} numberOfLines={1}>
                  {m.name}
                </Text>
              </View>
            </Pressable>
          ) : (
            <HiddenPin
              key={m.id}
              left={left}
              top={top}
              isTarget={m.id === target}
              reduceMotion={reduceMotion}
              onPress={() => reveal(m.id)}
            />
          );
        })}

      <View style={[styles.header, { top: insets.top + spacing.sm }]}>
        <View style={[styles.search, { backgroundColor: c.surface }]}>
          <View style={styles.flex}>
            <Text variant="heading" headingLevel={1}>
              Bursa
            </Text>
            <Text variant="caption" color="textSecondary">
              Tarih sisi açılıyor
            </Text>
          </View>
          <View style={[styles.progress, { backgroundColor: c.surfaceRaised }]}>
            <Text variant="caption" style={styles.mono}>
              {`${resolvedCount}/${networkMonuments.length} eser · ${drawn.length}/${networkLinks.length} bağ`}
            </Text>
          </View>
        </View>
        <View style={styles.legend}>
          {(["revenue", "patron", "style"] as const).map((kind) => (
            <View key={kind} style={[styles.chip, { backgroundColor: c.surface }]}>
              <View style={[styles.dot, { backgroundColor: linkColor(kind, c) }]} />
              <Text variant="caption">{linkKindLabel[kind]}</Text>
            </View>
          ))}
          <Link href="/monuments" style={[styles.chip, { backgroundColor: c.surface }]}>
            <Text variant="caption" color="primary" style={styles.underline}>
              Tüm eserler
            </Text>
          </Link>
        </View>
      </View>

      {sel && (
        <View
          style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.grip, { backgroundColor: c.border }]} />
          <Text variant="overline" colorValue={kickerColor}>
            {kicker.toLocaleUpperCase("tr-TR")}
          </Text>
          <Text variant="heading" headingLevel={2}>
            {sel.name}
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.mono}>
            {sel.year}
          </Text>
          <Text variant="caption">{body}</Text>
          <View style={styles.row}>
            {target && <Button label={`${nameOf(target)} · sisi aç`} onPress={() => reveal(target)} style={styles.flex} />}
            <Button label="Eser kartı" variant="ghost" onPress={() => router.push("/monuments")} />
          </View>
          {resolvedCount > startingMonuments.length && (
            <Pressable accessibilityRole="button" onPress={reset} style={styles.reset}>
              <Text variant="caption" color="primary" style={styles.underline}>
                Sisi geri çök
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function HiddenPin({
  left,
  top,
  isTarget,
  reduceMotion,
  onPress,
}: {
  left: number;
  top: number;
  isTarget: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isTarget || reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [isTarget, reduceMotion, pulse]);

  const ring = isTarget ? c.highlightMark : c.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isTarget ? "Sıradaki bağlantılı eser: sisi aç" : "Sisli eser: sisi aç"}
      onPress={onPress}
      style={[styles.pin, { left: left - touchTarget.min / 2, top: top - touchTarget.min / 2 }]}
    >
      {isTarget && (
        <Animated.View
          style={[
            styles.pulse,
            {
              borderColor: c.highlightMark,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
            },
          ]}
        />
      )}
      <View style={[styles.hidden, { borderColor: ring, borderStyle: isTarget ? "solid" : "dashed", backgroundColor: c.fog }]}>
        <Text variant="caption" colorValue={isTarget ? c.highlight : c.textSecondary} style={styles.bold}>
          ?
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  mono: {
    fontFamily: fontFamily.monoMedium,
  },
  bold: {
    fontFamily: fontFamily.sansBold,
  },
  underline: {
    textDecorationLine: "underline",
  },
  pin: {
    position: "absolute",
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  pinLabel: {
    position: "absolute",
    top: touchTarget.min - 6,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.sm,
    minWidth: 60,
    alignItems: "center",
  },
  pinText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  hidden: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
  },
  header: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
  },
  progress: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sheet: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.xl + 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reset: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
});

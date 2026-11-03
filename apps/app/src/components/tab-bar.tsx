import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useSegments } from "expo-router";
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from "expo-router/js-tabs";
import { useContext, useRef, type ComponentProps } from "react";
import { Pressable, StyleSheet, View, type PressableInstance } from "react-native";

import { setTabSpot, useTabSpotlight } from "@/lib/tab-bar-spots";

type IconName = ComponentProps<typeof Ionicons>["name"];

export interface TabItem {
  name: string;
  title: string;
  icon: IconName;
  iconFocused: IconName;
}

/** The tabs that float the bar over the screen: the map, the Eserler gallery and Profil run on under it. */
const FLOATS_ON = new Set(["map", "monuments", "settings"]);
/** Screens on the card surface, not the page grey (Rehber, white as chat apps are): the bar's strip matches them. */
const ON_SURFACE = new Set(["rehber"]);
/** Screens that fill the whole screen, the bar hidden: an asset's story. */
const HIDDEN_ON = new Set(["[id]"]);
const ICON_SIZE = 22;
/** Every item is this tall, Kamera's disc too: the capsule's inset is then the same on all sides. */
const ITEM_SIZE = 48;
/** The gap between the capsule's edge and the open tab's pill, on every side. */
const INSET = 6;

/**
 * The tab bar: an opaque capsule floating over the bottom of the screen, white in the
 * light theme and night blue in the dark one. The open tab is a gold pill with its name; the
 * others show their icon, and Kamera sits in the middle as a gold disc. On the map and the Eserler gallery the capsule floats over them;
 * elsewhere it rests on the screen's background, so no screen content hides behind it.
 *
 * Every tab is a button with the "tab" role and its title, whatever is shown of it.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets, items }: BottomTabBarProps & { items: TabItem[] }) {
  const { scheme, colors: c } = useTheme();
  const look = LOOKS[scheme];
  const onHeight = useContext(BottomTabBarHeightCallbackContext);
  const focusedName = state.routes[state.index]?.name;
  const floats = FLOATS_ON.has(focusedName ?? "");
  const segments = useSegments();
  // While the map tour shows a tab, that one stays lit in a gold ring and the others fade back.
  const spotlight = useTabSpotlight();
  // Each button tells where it is on screen, for the map tour's bubbles; a move of the bar moves them all.
  const buttons = useRef<Record<string, PressableInstance | null>>({});
  const measure = (name: string) => buttons.current[name]?.measureInWindow((x, y, width, height) => width > 0 && setTabSpot(name, { x, y, width, height }));
  const measureAll = () => items.forEach((item) => measure(item.name));
  // The opening greeting (`index`) fills the screen too, before the map.
  if (focusedName === "index" || HIDDEN_ON.has(segments.at(-1) ?? "")) return null;

  return (
    <View
      onLayout={(event) => {
        onHeight?.(event.nativeEvent.layout.height);
        measureAll();
      }}
      style={[
        styles.dock,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        floats ? styles.floating : { backgroundColor: ON_SURFACE.has(focusedName ?? "") ? c.surface : c.background },
      ]}
    >
      <View style={[styles.shadow, { shadowOpacity: look.shadow }]}>
        <View accessibilityRole="tablist" style={[styles.capsule, { backgroundColor: look.surface, borderColor: look.edge }]}>
          {items.map((item) => {
            const route = state.routes.find((candidate) => candidate.name === item.name);
            if (!route) return null;
            const focused = route.key === state.routes[state.index]?.key;
            const onPress = () => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            };
            const onLongPress = () => emitter.emit({ type: "tabLongPress", target: route.key });
            const common = {
              accessibilityRole: "tab" as const,
              accessibilityState: { selected: focused },
              accessibilityLabel: descriptors[route.key]?.options.tabBarAccessibilityLabel ?? item.title,
              onPress,
              onLongPress,
              ref: (node: PressableInstance | null) => {
                buttons.current[item.name] = node;
              },
              onLayout: () => measure(item.name),
            };

            if (item.name === "camera") {
              return (
                <Pressable
                  key={item.name}
                  {...common}
                  hitSlop={4}
                  style={({ pressed }) => [styles.camera, { backgroundColor: GOLD }, pressed && styles.pressed, spotlight && (spotlight === item.name ? styles.lit : styles.dimmed)]}
                >
                  <Ionicons name={focused ? item.iconFocused : item.icon} size={ICON_SIZE} color={ON_GOLD} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={item.name}
                {...common}
                style={({ pressed }) => [styles.tab, focused && [styles.tabFocused, { backgroundColor: GOLD }], pressed && styles.pressed, spotlight && (spotlight === item.name ? styles.lit : styles.dimmed)]}
              >
                <Ionicons name={focused ? item.iconFocused : item.icon} size={ICON_SIZE} color={focused ? ON_GOLD : look.icon} />
                {focused && (
                  <Text variant="caption" colorValue={ON_GOLD} numberOfLines={1} style={styles.label}>
                    {item.title}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * The open tab's pill and Kamera's disc, the same in both themes: white on gold. The gold sits
 * between `altin700` and `altin600`, the lightest white text still reads on (4.57:1, AA);
 * `altin700` looked too dark, `altin600` fails under white text (4.25:1).
 */
const GOLD = "#966F22";
const ON_GOLD = palette.white;

/** The capsule in each theme: white in the light one, night blue in the dark one. */
const LOOKS = {
  light: {
    surface: palette.white,
    edge: "rgba(13, 20, 32, 0.08)",
    shadow: 0.14,
    icon: palette.gece600,
  },
  dark: {
    surface: palette.gece900,
    edge: "rgba(255, 255, 255, 0.14)",
    shadow: 0.3,
    icon: palette.gece300,
  },
} as const;

const styles = StyleSheet.create({
  dock: {
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  floating: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  shadow: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 440,
    borderRadius: radius.full,
    shadowColor: "#000",
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: INSET,
    borderRadius: radius.full,
    borderWidth: 1,
    overflow: "hidden",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minWidth: ITEM_SIZE,
    height: ITEM_SIZE,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  tabFocused: {
    paddingHorizontal: spacing.md,
  },
  label: {
    fontFamily: fontFamily.sansSemiBold,
  },
  camera: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  dimmed: {
    opacity: 0.25,
  },
  lit: {
    borderWidth: 2,
    borderColor: palette.altin300,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, spacing, Text, useTheme } from "@vagabonds/ui";
import { router, useSegments, type Href } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type PressableInstance,
} from "react-native";

import { useCommunity } from "@/data";
import { webTransition } from "@/lib/web-transition";
import { setTabSpot, useTabSpotlight } from "@/lib/tab-bar-spots";
import { useWideWeb, wideColumn } from "@/lib/use-wide-web";

import type { TabItem } from "./tab-bar";
import { useLang, useMessages, type Messages } from "@/i18n";

/** Screens that fill the whole screen, the bar hidden: an asset's story. */
const HIDDEN_ON = new Set(["[id]"]);
/** Tabs the bar floats over, as the phone's capsule does: the map runs on under it. */
const FLOATS_ON = new Set(["map"]);
/** Tabs on the card surface, not the page grey (Rehber, white as chat sites are): the bar's strip matches them. */
const ON_SURFACE = new Set(["rehber"]);
/** Profil is not among the links: it is the outlined button on the right. */
const PROFILE = "settings";

/** The site's sections, for the bar on pages outside the tabs (`WebPageHeader`). */
/** The site's pages with their names in the language asked for. */
export const siteItems = (m: Messages): Array<TabItem & { href: Href }> => [
  {
    name: "map",
    title: m.tabs.map,
    icon: "map-outline",
    iconFocused: "map",
    href: "/map",
  },
  {
    name: "rehber",
    title: m.tabs.rehber,
    icon: "sparkles-outline",
    iconFocused: "sparkles",
    href: "/rehber",
  },
  {
    name: "monuments",
    title: m.tabs.monuments,
    icon: "library-outline",
    iconFocused: "library",
    href: "/monuments",
  },
  {
    name: "settings",
    title: m.tabs.profile,
    icon: "person-outline",
    iconFocused: "person",
    href: "/settings",
  },
];

const BAR = 60;
const EDGE = 14;
/** How much of the page's top the bar takes, with its gaps: a floating one's screen keeps clear of it. */
export const WEB_NAV_SPACE = EDGE + BAR + EDGE;

/**
 * The phone's tab bar's gold (tab-bar.tsx): the open link and the one under the pointer are a pill
 * of it with white words, as the open tab is in the app (4.57:1, AA).
 */
const GOLD = "#966F22";
const ON_GOLD = palette.white;
const LIGHT_GOLD = "#E7C26A";
const NIGHT = "#0B0F18";

/** The bar in each theme: white in the light one, night glass in the dark one. */
const LOOKS = {
  light: {
    surface: "#FFFFFF",
    text: NIGHT,
    muted: "rgba(11, 15, 24, 0.6)",
    line: "rgba(11, 15, 24, 0.07)",
    edge: "rgba(11, 15, 24, 0.18)",
    shadow: "0 14px 34px -16px rgba(5, 8, 14, 0.35)",
  },
  dark: {
    surface: "rgba(18, 22, 32, 0.94)",
    text: "#F4F1EA",
    muted: "rgba(244, 241, 234, 0.68)",
    line: "rgba(244, 241, 234, 0.1)",
    edge: "rgba(244, 241, 234, 0.28)",
    shadow: "0 14px 34px -14px rgba(0, 0, 0, 0.6)",
  },
} as const;

interface SiteNavProps {
  items: TabItem[];
  /** The section open, marked in gold; `null` for none. */
  active: string | null;
  onPress: (item: TabItem) => void;
  /** Floats over the screen (the map) instead of resting on a strip of this color. */
  floats?: boolean;
  background?: string;
  /** Extra props for one item's button: the tab bar's tour spots and labels. */
  itemProps?: (item: TabItem) => object;
  spotlight?: string | null;
}

/**
 * The site's bar: a rounded bar floating at the top of the page, inset from its edges, white in the
 * light theme and night glass in the dark one. The mark and the name on the left go to the home
 * page; Harita, Rehber and Eserler are plain words on the right; Profil is an outlined button at
 * the far right with the visitor's avatar. The open link and the one under the pointer turn into
 * the app's gold pill. On a narrow window the links keep only their icons.
 */
export function SiteNav({
  items,
  active,
  onPress,
  floats = false,
  background,
  itemProps,
  spotlight = null,
}: SiteNavProps) {
  const m = useMessages();
  const lang = useLang();
  const { scheme } = useTheme();
  const { user } = useCommunity();
  const narrow = useWindowDimensions().width < 760;
  const [hovered, setHovered] = useState<string | null>(null);
  const tone = LOOKS[scheme];

  const propsOf = (item: TabItem) => {
    const focused = item.name === active;
    return {
      focused,
      lit: focused || hovered === item.name,
      props: {
        accessibilityRole: "tab" as const,
        accessibilityState: { selected: focused },
        "aria-selected": focused,
        accessibilityLabel: item.title,
        onPress: () => onPress(item),
        onHoverIn: () => setHovered(item.name),
        onHoverOut: () =>
          setHovered((name) => (name === item.name ? null : name)),
        ...itemProps?.(item),
      },
    };
  };

  const links = items.filter((item) => item.name !== PROFILE);
  const profile = items.find((item) => item.name === PROFILE);
  const profileTab = profile ? propsOf(profile) : null;
  const initials = (user?.fullName || user?.username || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase(lang))
    .join("");

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.dock,
        floats ? styles.floating : { backgroundColor: background },
      ]}
    >
      <View
        style={[
          styles.bar,
          narrow && styles.barNarrow,
          {
            backgroundColor: tone.surface,
            borderColor: tone.line,
            boxShadow: tone.shadow,
          },
        ]}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={m.web.home}
          onPress={() => router.navigate("/")}
          style={styles.brand}
        >
          <View style={styles.mark} aria-hidden>
            <Text style={styles.markLetter}>V</Text>
          </View>
          {!narrow && (
            <Text style={[styles.wordmark, { color: tone.text }]}>
              Vagabonds
            </Text>
          )}
        </Pressable>

        <View style={styles.end}>
          <View accessibilityRole="tablist" style={styles.links}>
            {links.map((item) => {
              const tab = propsOf(item);
              const color = tab.lit ? ON_GOLD : tone.muted;
              return (
                <Pressable
                  key={item.name}
                  {...tab.props}
                  style={({ pressed }) => [
                    styles.link,
                    tab.lit && styles.linkLit,
                    pressed && styles.pressed,
                    spotlight === item.name && styles.spot,
                  ]}
                >
                  {(narrow || tab.focused) && (
                    <Ionicons
                      name={tab.focused ? item.iconFocused : item.icon}
                      size={18}
                      color={color}
                    />
                  )}
                  {!narrow && (
                    <Text
                      colorValue={color}
                      numberOfLines={1}
                      style={[
                        styles.linkText,
                        tab.focused && styles.linkFocused,
                      ]}
                    >
                      {item.title}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {profile && profileTab && (
            <Pressable
              {...profileTab.props}
              style={({ pressed }) => [
                styles.cta,
                narrow && styles.ctaNarrow,
                profileTab.lit ? styles.linkLit : { borderColor: tone.edge },
                pressed && styles.pressed,
                spotlight === profile.name && styles.spot,
              ]}
            >
              {!narrow && (
                <Text
                  style={[
                    styles.ctaText,
                    { color: profileTab.lit ? ON_GOLD : tone.text },
                  ]}
                >
                  {profile.title}
                </Text>
              )}
              <View style={styles.avatar}>
                {user?.photoUrl ? (
                  <Image
                    source={{ uri: user.photoUrl }}
                    style={styles.photo}
                    accessibilityIgnoresInvertColors
                  />
                ) : initials ? (
                  <Text style={styles.initials}>{initials}</Text>
                ) : (
                  <Ionicons name="person" size={15} color={NIGHT} />
                )}
              </View>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The web's navigation in the tabs: the site's bar instead of the phone's capsule at the bottom.
 * Over the map it floats; elsewhere it rests on the page's own background. Every tab keeps the
 * "tab" role and its "selected" state, and tells the map tour where it is.
 */
export function WebNavBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  items,
}: BottomTabBarProps & { items: TabItem[] }) {
  const { colors: c } = useTheme();
  const focusedName = state.routes[state.index]?.name ?? null;
  const segments = useSegments();
  const spotlight = useTabSpotlight();
  const buttons = useRef<Record<string, PressableInstance | null>>({});
  const measure = (name: string) =>
    buttons.current[name]?.measureInWindow(
      (x, y, width, height) =>
        width > 0 && setTabSpot(name, { x, y, width, height }),
    );

  // The home page (`index`) draws its own header.
  if (focusedName === "index" || HIDDEN_ON.has(segments.at(-1) ?? ""))
    return null;

  const routeOf = (item: TabItem) =>
    state.routes.find((candidate) => candidate.name === item.name);

  return (
    <SiteNav
      items={items.filter((item) => routeOf(item))}
      active={focusedName}
      floats={FLOATS_ON.has(focusedName ?? "")}
      background={ON_SURFACE.has(focusedName ?? "") ? c.surface : c.background}
      spotlight={spotlight}
      onPress={(item) => {
        const route = routeOf(item);
        if (!route) return;
        const event = emitter.emit({
          type: "tabPress",
          target: route.key,
          canPreventDefault: true,
        });
        if (item.name !== focusedName && !event.defaultPrevented)
          navigateToTab(route.key);
      }}
      itemProps={(item) => {
        const route = routeOf(item);
        return {
          accessibilityLabel:
            (route &&
              descriptors[route.key]?.options.tabBarAccessibilityLabel) ??
            item.title,
          onLayout: () => measure(item.name),
          ref: (node: PressableInstance | null) => {
            buttons.current[item.name] = node;
          },
        };
      }}
    />
  );
}

/**
 * The web's header for a page outside the tabs (Profil's pages): the site's bar, its section in
 * gold, and under it the way back and the page's title, in the pages' own 560 column.
 */
export function WebPageHeader({
  title,
  section,
  back,
}: {
  title: string;
  section: string;
  back: { label: string; href: Href };
}) {
  const m = useMessages();
  const { colors: c } = useTheme();
  const wide = useWideWeb();
  return (
    <View style={{ backgroundColor: c.background }}>
      <SiteNav
        items={siteItems(m)}
        active={section}
        background={c.background}
        onPress={(item) =>
          router.navigate(
            siteItems(m).find((site) => site.name === item.name)!.href,
          )
        }
      />
      <View style={[styles.pageHead, wide && wideColumn]}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={m.web.backTo(back.label)}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace(back.href)
          }
          style={({
            pressed,
            hovered,
          }: {
            pressed: boolean;
            hovered?: boolean;
          }) => [
            styles.back,
            hovered && { backgroundColor: c.surfaceRaised },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={16} color={c.textSecondary} />
          <Text variant="label" color="textSecondary">
            {back.label}
          </Text>
        </Pressable>
        {/* The site's bar names the section and the page says what it is: the title is for screen readers. */}
        <Text headingLevel={1} style={styles.unseen}>
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    paddingHorizontal: spacing.md,
    paddingVertical: EDGE,
    zIndex: 10,
  },
  floating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  bar: {
    height: BAR,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 18,
    paddingRight: 9,
    borderRadius: BAR / 2,
    borderWidth: 1,
  },
  barNarrow: {
    paddingLeft: 12,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NIGHT,
    boxShadow: "inset 0 0 0 1px rgba(231, 194, 106, 0.4)",
  },
  markLetter: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    lineHeight: 21,
    color: LIGHT_GOLD,
  },
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 22,
  },
  /** The links and Profil together at the right, Profil last. */
  end: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    ...webTransition("background-color", "180ms"),
  },
  linkLit: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  linkText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
  },
  linkFocused: {
    fontFamily: fontFamily.sansSemiBold,
  },
  cta: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 18,
    paddingRight: 5,
    borderRadius: 21,
    borderWidth: 1,
    ...webTransition("background-color, border-color", "180ms"),
  },
  ctaNarrow: {
    paddingLeft: 5,
  },
  ctaText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: LIGHT_GOLD,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  initials: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: NIGHT,
  },
  /** The way back and the title, over the page's own column. */
  pageHead: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -spacing.sm,
    paddingVertical: spacing.xxs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    borderRadius: 999,
  },
  unseen: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  pressed: {
    opacity: 0.8,
  },
  spot: {
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: "#F0D48A",
    outlineOffset: 2,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, touchTarget, typography } from "@vagabonds/ui";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * The four main sections. Each tab is its own URL on the web:
 * `/`, `/monuments`, `/route`, `/settings`.
 *
 * Screen readers announce the tab title; the icons only repeat it visually.
 */
const tabs: Array<{ name: string; title: string; icon: IconName; iconFocused: IconName; ownHeader?: boolean }> = [
  { name: "index", title: "Keşfet", icon: "compass-outline", iconFocused: "compass" },
  // Has its own stack (list → detail), which draws the header.
  { name: "monuments", title: "Eserler", icon: "library-outline", iconFocused: "library", ownHeader: true },
  { name: "route", title: "Rota", icon: "navigate-outline", iconFocused: "navigate" },
  { name: "settings", title: "Ayarlar", icon: "settings-outline", iconFocused: "settings" },
];

const TAB_ICON_SIZE = 24;
const TAB_VERTICAL_PADDING = 16;

export default function TabLayout() {
  const c = useColors();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The default bar is a fixed 49pt, which clips our 14pt labels, and clips any label once the
  // user raises the system text size. Grow the bar with the label instead.
  const tabBarHeight =
    TAB_ICON_SIZE + typography.caption.lineHeight * fontScale + TAB_VERTICAL_PADDING + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamily.display },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { height: tabBarHeight },
        tabBarLabelStyle: {
          fontFamily: fontFamily.sansMedium,
          fontSize: typography.caption.fontSize,
          lineHeight: typography.caption.lineHeight,
        },
        tabBarItemStyle: { minHeight: touchTarget.min },
      }}
    >
      {tabs.map(({ name, title, icon, iconFocused, ownHeader }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            headerShown: !ownHeader,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? iconFocused : icon} size={TAB_ICON_SIZE} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

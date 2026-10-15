import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, touchTarget, typography } from "@vagabonds/ui";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";

import { useColors } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * The four main sections. Each tab is its own URL on the web:
 * `/`, `/monuments`, `/route`, `/settings`.
 *
 * Screen readers announce the tab title; the icons only repeat it visually.
 */
const tabs: Array<{ name: string; title: string; icon: IconName; iconFocused: IconName }> = [
  { name: "index", title: "Keşfet", icon: "compass-outline", iconFocused: "compass" },
  { name: "monuments/index", title: "Eserler", icon: "library-outline", iconFocused: "library" },
  { name: "route", title: "Rota", icon: "navigate-outline", iconFocused: "navigate" },
  { name: "settings", title: "Ayarlar", icon: "settings-outline", iconFocused: "settings" },
];

export default function TabLayout() {
  const c = useColors();

  return (
    <Tabs
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamily.display },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarLabelStyle: { fontFamily: fontFamily.sansMedium, fontSize: typography.caption.fontSize },
        tabBarItemStyle: { minHeight: touchTarget.min },
      }}
    >
      {tabs.map(({ name, title, icon, iconFocused }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? iconFocused : icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

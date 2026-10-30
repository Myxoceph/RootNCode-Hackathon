import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, touchTarget, typography, useUi } from "@vagabonds/ui";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * The five sections of the Hayrat design. Each tab is its own URL on the web:
 * `/`, `/route`, `/camera`, `/capsule`, `/settings`. The monument list and
 * card (`/monuments`) live under the tabs too, so the bar stays visible there,
 * but have no tab of their own: the map and the routes lead to them.
 *
 * Screen readers announce the tab title; the icons only repeat it visually.
 */
const tabs: Array<{ name: string; title: string; icon: IconName; iconFocused: IconName; ownHeader?: boolean }> = [
  { name: "index", title: "Harita", icon: "map-outline", iconFocused: "map", ownHeader: true },
  // Has its own stack (planner → food stops), which draws the header.
  { name: "route", title: "Rotalar", icon: "git-branch-outline", iconFocused: "git-branch", ownHeader: true },
  { name: "camera", title: "Kamera", icon: "camera-outline", iconFocused: "camera", ownHeader: true },
  { name: "capsule", title: "Kapsül", icon: "pulse-outline", iconFocused: "pulse", ownHeader: true },
  { name: "settings", title: "Profil", icon: "person-outline", iconFocused: "person", ownHeader: true },
];

const TAB_ICON_SIZE = 24;
const TAB_VERTICAL_PADDING = 16;
/** The camera tab is a raised round button in the middle of the bar. */
const CAMERA_BUTTON_SIZE = 48;

export default function TabLayout() {
  const { theme, textScale } = useUi();
  const c = theme.colors;
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The default bar is a fixed 49pt, which clips our 14pt labels, and clips any label once the
  // user raises the system text size. Grow the bar with the label instead.
  const tabBarHeight =
    TAB_ICON_SIZE + typography.caption.lineHeight * fontScale * textScale + TAB_VERTICAL_PADDING + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerTitleStyle: { fontFamily: fontFamily.display },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { height: tabBarHeight, backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: {
          fontFamily: fontFamily.sansSemiBold,
          fontSize: typography.caption.fontSize * textScale,
          lineHeight: typography.caption.lineHeight * textScale,
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
            tabBarIcon: ({ focused }) =>
              name === "camera" ? (
                <View style={[styles.cameraButton, { backgroundColor: c.primary }]}>
                  <Ionicons name={focused ? iconFocused : icon} size={TAB_ICON_SIZE} color={c.onPrimary} />
                </View>
              ) : (
                <Ionicons name={focused ? iconFocused : icon} size={TAB_ICON_SIZE} color={focused ? c.primary : c.textSecondary} />
              ),
          }}
        />
      ))}
      {/* No tab button, but still a tab: since expo-router 58, `href: null` hides the screen and redirects away from it. */}
      <Tabs.Screen
        name="monuments"
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: "Eserler" }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  cameraButton: {
    width: CAMERA_BUTTON_SIZE,
    height: CAMERA_BUTTON_SIZE,
    borderRadius: CAMERA_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -CAMERA_BUTTON_SIZE / 2,
  },
});

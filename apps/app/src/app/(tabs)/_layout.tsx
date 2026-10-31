import { fontFamily } from "@vagabonds/ui";
import { Tabs } from "expo-router/js-tabs";

import { TabBar, type TabItem } from "@/components/tab-bar";

/**
 * The five sections in the bar. Each tab is its own URL on the web:
 * `/`, `/route`, `/camera`, `/monuments`, `/settings`. The monument list and its
 * cards share the Eserler tab's stack. Kapsül (`/capsule`) has no tab any more but
 * stays a screen under the tabs; asset cards still play their sound capsules.
 *
 * Screen readers announce the tab title; the bar (`TabBar`) shows the open tab's name and the others' icons.
 */
const tabs: Array<TabItem & { ownHeader?: boolean }> = [
  { name: "index", title: "Harita", icon: "map-outline", iconFocused: "map", ownHeader: true },
  // Has its own stack (planner → food stops), which draws the header.
  { name: "route", title: "Rotalar", icon: "git-branch-outline", iconFocused: "git-branch", ownHeader: true },
  { name: "camera", title: "Kamera", icon: "camera-outline", iconFocused: "camera", ownHeader: true },
  // Has its own stack (list → asset card), which draws the header.
  { name: "monuments", title: "Eserler", icon: "library-outline", iconFocused: "library", ownHeader: true },
  { name: "settings", title: "Profil", icon: "person-outline", iconFocused: "person", ownHeader: true },
];

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} items={tabs} />}
      screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}
    >
      {tabs.map(({ name, title, ownHeader }) => (
        <Tabs.Screen key={name} name={name} options={{ title, headerShown: !ownHeader }} />
      ))}
      {/* No tab button, but still a tab: since expo-router 58, `href: null` hides the screen and redirects away from it. */}
      <Tabs.Screen
        name="capsule"
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: "Kapsül" }}
      />
    </Tabs>
  );
}

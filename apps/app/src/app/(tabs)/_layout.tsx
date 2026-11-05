import { fontFamily } from "@vagabonds/ui";
import { Tabs } from "expo-router/js-tabs";
import { Platform } from "react-native";

import { TabBar, type TabItem } from "@/components/tab-bar";
import { WebNavBar } from "@/components/web-nav-bar";

/**
 * The five sections in the bar. Each tab is its own URL on the web:
 * `/map`, `/rehber`, `/camera`, `/monuments`, `/settings`. The app opens on a greeting at `/` that goes on to the map. The monument list and its
 * cards share the Eserler tab's stack. Kapsül (`/capsule`) and Rotalar (`/route`) have
 * no tab any more but stay screens under the tabs: asset cards still play their sound
 * capsules, and the map and the assistant's answers still open the planner.
 *
 * Screen readers announce the tab title; the bar (`TabBar`) shows the open tab's name and the others' icons.
 *
 * The web has no camera (ADR 0001): there is no Kamera tab, and `/camera` goes to the map (`camera.web.tsx`).
 * On the web the tabs sit in a bar across the top of the page (`WebNavBar`), as a website's navigation does.
 */
const WEB = Platform.OS === "web";
const allTabs: Array<TabItem & { ownHeader?: boolean }> = [
  { name: "map", title: "Harita", icon: "map-outline", iconFocused: "map", ownHeader: true },
  // The general conversation of `/assistant`, which draws its own header.
  { name: "rehber", title: "Rehber", icon: "sparkles-outline", iconFocused: "sparkles", ownHeader: true },
  { name: "camera", title: "Kamera", icon: "camera-outline", iconFocused: "camera", ownHeader: true },
  // Has its own stack (list → asset card), which draws the header.
  { name: "monuments", title: "Eserler", icon: "library-outline", iconFocused: "library", ownHeader: true },
  { name: "settings", title: "Profil", icon: "person-outline", iconFocused: "person", ownHeader: true },
];
const tabs = WEB ? allTabs.filter((tab) => tab.name !== "camera") : allTabs;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => (WEB ? <WebNavBar {...props} items={tabs} /> : <TabBar {...props} items={tabs} />)}
      screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display }, tabBarPosition: WEB ? "top" : "bottom" }}
    >
      {tabs.map(({ name, title, ownHeader }) => (
        <Tabs.Screen key={name} name={name} options={{ title, headerShown: !ownHeader }} />
      ))}
      {WEB && <Tabs.Screen name="camera" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: "Kamera" }} />}
      {/* The opening greeting, which goes on to the map. */}
      <Tabs.Screen name="index" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false }} />
      {/* No tab button, but still a tab: since expo-router 58, `href: null` hides the screen and redirects away from it. */}
      <Tabs.Screen name="capsule" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: "Kapsül" }} />
      {/* Has its own stack (planner → food stops), which draws the header. */}
      <Tabs.Screen name="route" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: "Rotalar" }} />
    </Tabs>
  );
}

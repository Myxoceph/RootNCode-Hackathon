import { fontFamily } from "@vagabonds/ui";
import { Tabs } from "expo-router/js-tabs";
import { Platform } from "react-native";

import { TabBar, type TabItem } from "@/components/tab-bar";
import { WebNavBar } from "@/components/web-nav-bar";
import { useMessages } from "@/i18n";

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
type TabName = "map" | "rehber" | "camera" | "monuments" | "settings";
const allTabs: Array<Omit<TabItem, "title"> & { name: TabName; ownHeader?: boolean }> = [
  { name: "map", icon: "map-outline", iconFocused: "map", ownHeader: true },
  // The general conversation of `/assistant`, which draws its own header.
  { name: "rehber", icon: "sparkles-outline", iconFocused: "sparkles", ownHeader: true },
  { name: "camera", icon: "camera-outline", iconFocused: "camera", ownHeader: true },
  // Has its own stack (list → asset card), which draws the header.
  { name: "monuments", icon: "library-outline", iconFocused: "library", ownHeader: true },
  { name: "settings", icon: "person-outline", iconFocused: "person", ownHeader: true },
];

export default function TabLayout() {
  const m = useMessages();
  const titles: Record<TabName, string> = { map: m.tabs.map, rehber: m.tabs.rehber, camera: m.tabs.camera, monuments: m.tabs.monuments, settings: m.tabs.profile };
  const tabs = (WEB ? allTabs.filter((tab) => tab.name !== "camera") : allTabs).map((tab) => ({ ...tab, title: titles[tab.name] }));
  // The site's bar starts with the home page (`index`, the landing page on the web); it is no tab of its own.
  const webLinks: TabItem[] = [{ name: "index", icon: "home-outline", iconFocused: "home", title: m.tabs.home }, ...tabs];
  return (
    <Tabs
      tabBar={(props) => (WEB ? <WebNavBar {...props} items={webLinks} /> : <TabBar {...props} items={tabs} />)}
      screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display }, tabBarPosition: WEB ? "top" : "bottom" }}
    >
      {tabs.map(({ name, title, ownHeader }) => (
        <Tabs.Screen key={name} name={name} options={{ title, headerShown: !ownHeader }} />
      ))}
      {/* An array, not `WEB && …`: a `false` child makes the layout warn that it is not a Screen. */}
      {WEB ? [<Tabs.Screen key="camera" name="camera" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: m.tabs.camera }} />] : []}
      {/* The opening greeting, which goes on to the map. */}
      <Tabs.Screen name="index" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false }} />
      {/* No tab button, but still a tab: since expo-router 58, `href: null` hides the screen and redirects away from it. */}
      <Tabs.Screen name="capsule" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: m.tabs.capsule }} />
      {/* Has its own stack (planner → food stops), which draws the header. */}
      <Tabs.Screen name="route" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" }, headerShown: false, title: m.tabs.routes }} />
    </Tabs>
  );
}

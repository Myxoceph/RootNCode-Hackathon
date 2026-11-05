import { fontFamily } from "@vagabonds/ui";
import { Stack } from "expo-router";

import { useMessages } from "@/i18n";

/** The planner draws its own large title; the food list gets a header with a back button. */
export default function RouteLayout() {
  const m = useMessages();
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}>
      <Stack.Screen name="index" options={{ title: m.screens.planRoute, headerShown: false }} />
      <Stack.Screen name="food" options={{ title: m.screens.foodStops }} />
    </Stack>
  );
}

import { fontFamily } from "@vagabonds/ui";
import { Stack } from "expo-router";

/** The planner draws its own large title; the food list gets a header with a back button. */
export default function RouteLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}>
      <Stack.Screen name="index" options={{ title: "Rota Planla", headerShown: false }} />
      <Stack.Screen name="food" options={{ title: "Lezzet Durakları" }} />
    </Stack>
  );
}

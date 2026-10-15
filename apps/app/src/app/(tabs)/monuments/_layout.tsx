import { fontFamily } from "@vagabonds/ui";
import { Stack } from "expo-router";

/** List and detail share this stack, so the detail screen gets a back button inside the Eserler tab. */
export default function MonumentsLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}>
      <Stack.Screen name="index" options={{ title: "Eserler" }} />
      <Stack.Screen name="[slug]" options={{ title: "" }} />
    </Stack>
  );
}

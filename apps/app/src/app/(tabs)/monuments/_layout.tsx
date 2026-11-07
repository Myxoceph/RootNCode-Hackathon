import { fontFamily } from "@vagabonds/ui";
import { Stack } from "expo-router";

import { useMessages } from "@/i18n";

/** List and detail share this stack, so the detail screen gets a back button inside the Eserler tab. */
export default function MonumentsLayout() {
  const m = useMessages();
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}>
      {/* The gallery draws its own large title. */}
      <Stack.Screen name="index" options={{ title: m.tabs.monuments, headerShown: false }} />
      {/* The card draws its own back button over the photo. */}
      <Stack.Screen name="[id]" options={{ title: "", headerShown: false }} />
    </Stack>
  );
}

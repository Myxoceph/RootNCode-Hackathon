import { fontFamily, palette } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { colors, useColorScheme } from "@/theme";
import { fontFiles } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync();

function navigationTheme(scheme: "dark" | "light"): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const c = colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.border,
      notification: scheme === "dark" ? palette.mercan300 : palette.mercan700,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme();
  // On failure the app still opens with system fonts instead of hanging on the splash screen.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme(scheme)}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: "Sayfa bulunamadı" }} />
      </Stack>
    </ThemeProvider>
  );
}

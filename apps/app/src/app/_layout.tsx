import { fontFamily, useTheme, type Theme as UiTheme } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { A11ySettingsProvider } from "@/settings/a11y-settings";
import { fontFiles } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync();

function navigationTheme(theme: UiTheme): Theme {
  const base = theme.scheme === "dark" ? DarkTheme : DefaultTheme;
  const c = theme.colors;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.border,
      notification: c.warning,
    },
  };
}

export default function RootLayout() {
  // On failure the app still opens with system fonts instead of hanging on the splash screen.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <A11ySettingsProvider>
      <ThemedStack />
    </A11ySettingsProvider>
  );
}

function ThemedStack() {
  const theme = useTheme();
  return (
    <ThemeProvider value={navigationTheme(theme)}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: fontFamily.display } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Camera screens are full screen and always dark; they draw their own back button. */}
        <Stack.Screen name="time-curtain" options={{ headerShown: false, title: "Zaman Perdesi" }} />
        <Stack.Screen name="inscription" options={{ headerShown: false, title: "Taşın Dili" }} />
        <Stack.Screen name="ar-prototype" options={{ headerShown: false, title: "AR prototipi" }} />
        <Stack.Screen name="+not-found" options={{ title: "Sayfa bulunamadı" }} />
      </Stack>
    </ThemeProvider>
  );
}

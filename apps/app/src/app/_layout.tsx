import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, useTheme, type Theme as UiTheme } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type Theme,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";

import { BadgeCelebration } from "@/components/badge-celebration";
import { OfflineBanner } from "@/components/offline-banner";
import { WebPageHeader } from "@/components/web-nav-bar";
import { useAccountGate } from "@/lib/use-account-gate";
import { useBadgeWatch } from "@/lib/use-badge-watch";
import { A11ySettingsProvider } from "@/settings/a11y-settings";
import { useStoredThemePreference } from "@/theme";
import { fontFiles } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync();

/**
 * Profil's pages on the web: the site's bar on top, then the way back and the title (`WebPageHeader`),
 * instead of the phone's plain header. The phone keeps its own.
 */
function profilePage(title: string, back: "Profil" | "Kaydettiklerim") {
  if (Platform.OS !== "web") return { title, headerBackTitle: back };
  return {
    title,
    // The page may name itself later (a trip's own title): the header reads it from the options.
    header: ({ options }: { options: { title?: string } }) => (
      <WebPageHeader
        title={options.title ?? title}
        section="settings"
        back={{
          label: back,
          href: back === "Profil" ? "/settings" : "/profile/routes",
        }}
      />
    ),
  };
}

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
  // The icons' font too: the page rendered ahead of time must draw them as the browser's first render does.
  const [fontsLoaded, fontError] = useFonts({ ...fontFiles, ...Ionicons.font });
  const storedThemePreference = useStoredThemePreference();
  // On the phone the splash screen waits for the saved theme too, so a dark choice never opens light
  // for a moment. Web pages are rendered ahead of time and cannot wait; the saved theme follows.
  const ready =
    (fontsLoaded || fontError !== null) &&
    (storedThemePreference !== undefined || Platform.OS === "web");

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <A11ySettingsProvider storedThemePreference={storedThemePreference}>
      <ThemedStack />
    </A11ySettingsProvider>
  );
}

function ThemedStack() {
  const theme = useTheme();
  // With a server, the app is for accounts: without one, every screen leads to signing in.
  useAccountGate();
  // A badge earned anywhere is celebrated over the screen it was earned on.
  useBadgeWatch();
  return (
    <ThemeProvider value={navigationTheme(theme)}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <OfflineBanner>
        <Stack
          screenOptions={{
            headerTitleStyle: { fontFamily: fontFamily.display },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Camera screens are full screen and always dark; they draw their own back button. */}
          <Stack.Screen
            name="visit-seal"
            options={{ headerShown: false, title: "Ziyaret Mührü" }}
          />
          <Stack.Screen
            name="auth"
            options={{ headerShown: false, title: "Giriş yap" }}
          />
          {/* Profil's sections, each on its own page under a header with a back button. */}
          <Stack.Screen
            name="profile/routes"
            options={profilePage("Kaydettiklerim", "Profil")}
          />
          <Stack.Screen
            name="profile/sealed"
            options={profilePage("Mühürlenen eserler", "Profil")}
          />
          <Stack.Screen
            name="profile/badges"
            options={profilePage("Rozetlerim", "Profil")}
          />
          <Stack.Screen
            name="profile/rewards"
            options={profilePage("Ödüllerim", "Profil")}
          />
          <Stack.Screen
            name="profile/settings"
            options={profilePage("Sistem ayarları", "Profil")}
          />
          <Stack.Screen
            name="profile/notes"
            options={profilePage("Bıraktığım Notlar", "Profil")}
          />
          {/* An eser kartı over the Profil page it was opened from; it draws its own close button. */}
          <Stack.Screen
            name="asset/[id]"
            options={{ headerShown: false, title: "" }}
          />
          {/* A trip Rehber planned, from Kaydettiklerim; the screen sets its own title. */}
          <Stack.Screen
            name="profile/trip"
            options={profilePage("Rota", "Kaydettiklerim")}
          />
          {/* Draws its own header: a system header that floats over the page would cover the sticky tabs. */}
          <Stack.Screen
            name="dossier"
            options={{ headerShown: false, title: "Eserin dosyası" }}
          />
          <Stack.Screen
            name="related"
            options={{ headerShown: false, title: "İlişkili eserler" }}
          />
          <Stack.Screen
            name="note"
            options={{ headerShown: false, title: "Not bırak" }}
          />
          <Stack.Screen
            name="time-journey"
            options={{ headerShown: false, title: "Zamanda Yolculuk" }}
          />
          <Stack.Screen
            name="inscription"
            options={{ headerShown: false, title: "Taşın Dili" }}
          />
          <Stack.Screen
            name="stone-ask"
            options={{ headerShown: false, title: "Taşa Sor" }}
          />
          {/* Draws its own header, with "Temizle" next to the title. */}
          <Stack.Screen
            name="assistant"
            options={{ headerShown: false, title: "Asistan" }}
          />
          <Stack.Screen
            name="assistant-history"
            options={{ title: "Geçmiş konuşmalar", headerBackTitle: "Rehber" }}
          />
          <Stack.Screen
            name="map-prototype"
            options={{ headerShown: false, title: "Harita prototipi" }}
          />
          {/* The admin panel draws its own frame (side bar and pages). */}
          <Stack.Screen
            name="admin"
            options={{ headerShown: false, title: "Yönetim paneli" }}
          />
          <Stack.Screen
            name="+not-found"
            options={{ title: "Sayfa bulunamadı" }}
          />
        </Stack>
        <BadgeCelebration />
      </OfflineBanner>
    </ThemeProvider>
  );
}

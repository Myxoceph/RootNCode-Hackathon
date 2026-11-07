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
import { useCallback, useEffect, useState } from "react";
import { Platform, useColorScheme as useSystemScheme, View } from "react-native";

import { BadgeCelebration } from "@/components/badge-celebration";
import { BrandSplash } from "@/components/brand-splash";
import { OfflineBanner } from "@/components/offline-banner";
import { WebPageHeader } from "@/components/web-nav-bar";
import { useAccountGate } from "@/lib/use-account-gate";
import { useBadgeWatch } from "@/lib/use-badge-watch";
import { A11ySettingsProvider } from "@/settings/a11y-settings";
import { DEFAULT_THEME_PREFERENCE, resolveColorScheme, useStoredThemePreference } from "@/theme";
import { fontFiles } from "@/theme/fonts";
import { useLang, useLangSettled, useMessages } from "@/i18n";

SplashScreen.preventAutoHideAsync();

/** The page's name for a screen reader only: nothing is written at the head of Profil's pages, as on the web. */
function UnseenHeaderTitle({ children }: { children: string }) {
  return <View accessible accessibilityRole="header" accessibilityLabel={children} style={{ width: 1, height: 1 }} />;
}

/**
 * Profil's pages on the web: the site's bar on top, then the way back and the title (`WebPageHeader`),
 * instead of the phone's plain header. The phone keeps its own.
 */
function profilePage(title: string, back: string, fromSaved = false) {
  if (Platform.OS !== "web") return { title, headerBackTitle: back, headerTitle: UnseenHeaderTitle };
  return {
    title,
    // The page may name itself later (a trip's own title): the header reads it from the options.
    header: ({ options }: { options: { title?: string } }) => (
      <WebPageHeader
        title={options.title ?? title}
        section="settings"
        back={{
          label: back,
          href: fromSaved ? "/profile/routes" : "/settings",
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
  // The chosen language too, so a phone set to Turkish never opens in Turkish for one chosen English.
  const langSettled = useLangSettled();
  // On the phone the splash screen waits for the saved theme too, so a dark choice never opens light
  // for a moment. Web pages are rendered ahead of time and cannot wait; the saved theme follows.
  const ready =
    (fontsLoaded || fontError !== null) &&
    ((storedThemePreference !== undefined && langSettled) || Platform.OS === "web");

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // On the phone the app opens with its logo (BrandSplash), over the launch screen's place; the web
  // page is rendered ahead of time and opens on its content.
  const phone = Platform.OS !== "web";
  const [logoGone, setLogoGone] = useState(!phone);
  const onLogoGone = useCallback(() => setLogoGone(true), []);
  // In the app's theme: the saved choice, the light one it opens in until that is read.
  const system = useSystemScheme() === "dark" ? "dark" : "light";
  const logoScheme = resolveColorScheme(storedThemePreference ?? DEFAULT_THEME_PREFERENCE, system);

  if (!ready) return phone ? <BrandSplash scheme={logoScheme} /> : null;

  return (
    <>
      <A11ySettingsProvider storedThemePreference={storedThemePreference}>
        <ThemedStack />
      </A11ySettingsProvider>
      {!logoGone && <BrandSplash scheme={logoScheme} leaving onGone={onLogoGone} />}
    </>
  );
}

function ThemedStack() {
  const theme = useTheme();
  const m = useMessages();
  const lang = useLang();
  // The web page's language follows the app's, so screen readers pronounce it right.
  useEffect(() => {
    if (Platform.OS === "web") document.documentElement.lang = lang;
  }, [lang]);
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
          {/* No slide into the tabs: from the welcome page the map is already made (prefetched) and simply shows. */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "none" }} />
          {/* Camera screens are full screen and always dark; they draw their own back button. */}
          <Stack.Screen
            name="visit-seal"
            options={{ headerShown: false, title: m.screens.visitSeal }}
          />
          <Stack.Screen
            name="seal-sequence"
            options={{ headerShown: false, title: m.screens.visitSeal }}
          />
          <Stack.Screen
            name="auth"
            options={{ headerShown: false, title: m.screens.signIn }}
          />
          {/* The page the app opens on; it draws its own way on, with no back to anywhere. */}
          <Stack.Screen
            name="welcome"
            options={{ headerShown: false, title: m.welcome.title, gestureEnabled: false }}
          />
          {/* Profil's sections, each on its own page under a header with a back button. */}
          <Stack.Screen
            name="profile/routes"
            options={profilePage(m.screens.saved, m.tabs.profile)}
          />
          <Stack.Screen
            name="profile/sealed"
            options={profilePage(m.screens.sealed, m.tabs.profile)}
          />
          <Stack.Screen
            name="profile/badges"
            options={profilePage(m.screens.badges, m.tabs.profile)}
          />
          <Stack.Screen
            name="profile/rewards"
            options={profilePage(m.screens.rewards, m.tabs.profile)}
          />
          <Stack.Screen
            name="profile/settings"
            options={profilePage(m.settings.title, m.tabs.profile)}
          />
          <Stack.Screen
            name="profile/notes"
            options={profilePage(m.screens.notes, m.tabs.profile)}
          />
          <Stack.Screen
            name="profile/journal"
            options={profilePage(m.screens.journal, m.tabs.profile)}
          />
          {/* An eser kartı over the Profil page it was opened from; it draws its own close button. */}
          <Stack.Screen
            name="asset/[id]"
            options={{ headerShown: false, title: "" }}
          />
          {/* A trip Rehber planned, from Kaydettiklerim; the screen sets its own title. */}
          <Stack.Screen
            name="profile/trip"
            options={profilePage(m.screens.trip, m.screens.saved, true)}
          />
          {/* Draws its own header: a system header that floats over the page would cover the sticky tabs. */}
          <Stack.Screen
            name="dossier"
            options={{ headerShown: false, title: m.screens.dossier }}
          />
          <Stack.Screen
            name="related"
            options={{ headerShown: false, title: m.screens.related }}
          />
          <Stack.Screen
            name="note"
            options={{ headerShown: false, title: m.screens.note }}
          />
          <Stack.Screen
            name="time-journey"
            options={{ headerShown: false, title: m.screens.timeJourney }}
          />
          <Stack.Screen
            name="inscription"
            options={{ headerShown: false, title: m.screens.inscription }}
          />
          <Stack.Screen
            name="stone-ask"
            options={{ headerShown: false, title: m.screens.stoneAsk }}
          />
          {/* Draws its own header, with "Temizle" next to the title. */}
          <Stack.Screen
            name="assistant"
            options={{ headerShown: false, title: m.screens.assistant }}
          />
          <Stack.Screen
            name="assistant-history"
            options={{ title: m.screens.history, headerBackTitle: m.tabs.rehber }}
          />
          {/* The admin panel draws its own frame (side bar and pages). */}
          <Stack.Screen
            name="admin"
            options={{ headerShown: false, title: m.screens.admin }}
          />
          <Stack.Screen
            name="+not-found"
            options={{ title: m.screens.notFound }}
          />
        </Stack>
        <BadgeCelebration />
      </OfflineBanner>
    </ThemeProvider>
  );
}

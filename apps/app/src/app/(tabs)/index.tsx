import { fontFamily, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { communityAvailable, useCommunity } from "@/data";
import { isAccount } from "@/lib/account-gate";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** How long the greeting stays before the map opens. */
const HOLD_MS = 2800;

/**
 * `/`: the app opens on a greeting, "Merhaba, <ad>", centred on the app's plain background
 * (night blue in the dark theme, white in the light one), and
 * goes on to the map by itself. "Atla" skips the wait. Without an account it waits instead: the
 * account gate takes the visitor to sign in (without a server, where none can be opened, the
 * visitor is greeted as "gezgin").
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useCommunity();
  const { scheme, colors: c } = useTheme();
  // The dark theme's page blue; in the light one white, not the page grey.
  const background = scheme === "dark" ? c.background : c.surface;
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const left = useRef(false);

  const name = user?.nickname ?? null;
  // The stored session is in, and it is an account (or there is no server to need one).
  const ready = user !== undefined && (isAccount(user) || !communityAvailable);

  const goToMap = () => {
    if (left.current) return;
    left.current = true;
    router.replace("/map");
  };

  useEffect(() => {
    // Waits for the stored session, so the name is there when the greeting shows.
    if (!ready) return;
    announce(`Merhaba${name ? `, ${name}` : ""}. Hoş geldin, haritana yönlendiriliyorsun.`);
    Animated.timing(fade, { toValue: 1, duration: reduced ? 0 : 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(goToMap, HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 24, 0] });

  return (
    <View style={[styles.screen, { backgroundColor: background }]}>
      <Head>
        <title>Hoş geldin · Vagabonds</title>
      </Head>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      {/* Only once there is somewhere to go: without an account the gate leads to signing in. */}
      {ready && (
        <Pressable
          onPress={goToMap}
          accessibilityRole="button"
          accessibilityLabel="Atla, haritaya geç"
          hitSlop={8}
          style={[styles.skip, { top: insets.top + spacing.md, backgroundColor: c.surfaceRaised, borderColor: c.border }]}
        >
          <Text variant="caption" colorValue={c.text} style={styles.skipLabel}>
            Atla
          </Text>
        </Pressable>
      )}

      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: rise }] }]}>
        <Text colorValue={c.textSecondary} style={styles.hello}>
          Hoş geldin
        </Text>
        <Text headingLevel={1} colorValue={c.text} style={styles.title} numberOfLines={2}>
          Merhaba,{"\n"}
          {name ?? "gezgin"}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  skip: {
    position: "absolute",
    right: spacing.lg,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  skipLabel: {
    fontFamily: fontFamily.sansSemiBold,
  },
  content: {
    paddingHorizontal: spacing.lg,
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
  },
  hello: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.5,
    textAlign: "center",
  },
});

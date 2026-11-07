import { palette } from "@vagabonds/ui";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, useColorScheme } from "react-native";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/** The same as the launch screen's (app.json, expo-splash-screen): the logo at this width, on white or night blue. */
const LOGO_WIDTH = 280;
const LOGO_SHAPE = 1200 / 302;
const LOOKS = {
  light: { background: palette.white, logo: require("../../assets/images/splash-icon.png") },
  dark: { background: palette.gece950, logo: require("../../assets/images/splash-icon-dark.png") },
} as const;
/** Once the app is ready, the logo stays this long, then fades. */
const HOLD_MS = 1100;
const FADE_MS = 450;

/**
 * The app opens with its logo. While it loads the logo stands where the launch screen left it (the
 * phone's own theme picks white or night blue, as the launch screen does), so the hand-over is not
 * seen; Expo Go, which shows no launch screen image, opens with it too. Once `leaving`, it holds
 * a moment and fades as it draws a little nearer, then `onGone`. With reduced motion it simply goes.
 * Only seen: a screen reader goes on to the app.
 */
export function BrandSplash({ leaving = false, onGone }: { leaving?: boolean; onGone?: () => void }) {
  const look = LOOKS[useColorScheme() === "dark" ? "dark" : "light"];
  const reduceMotion = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!leaving) return;
    const animation = Animated.sequence([
      Animated.delay(HOLD_MS),
      Animated.timing(fade, { toValue: 0, duration: reduceMotion ? 0 : FADE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onGone?.();
    });
    return () => animation.stop();
  }, [leaving, reduceMotion, fade, onGone]);

  const scale = reduceMotion ? 1 : fade.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.screen, { backgroundColor: look.background, opacity: fade }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={look.logo} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_WIDTH / LOGO_SHAPE,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { MyContributions } from "@/components/my-contributions";
import { timeCurtain } from "@/content/camera";
import { useCommunity } from "@/data";
import { speak } from "@/lib/speak";
import { useA11ySettings, type A11ySettings } from "@/settings/a11y-settings";
import { resolveColorScheme, themePreferenceOptions, useColorScheme, type ColorScheme } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const GLOW_HEIGHT = 380;
const AVATAR = 96;
/** The chosen tiles: a gold wash and a gold edge, the same on night blue and on white. */
const goldWash = "rgba(221, 181, 92, 0.14)";
const goldEdge = "rgba(190, 150, 60, 0.6)";

const schemeOptions = themePreferenceOptions.filter((option): option is { value: ColorScheme; label: string } => option.value !== "system");

/** The four smaller switches, as tiles; the audio description has its own wide tile above them. */
const tiles: Array<{ key: keyof A11ySettings; icon: IconName; title: string; detail: string }> = [
  { key: "captions", icon: "chatbox-ellipses-outline", title: "Altyazılar", detail: "Ses kapsüllerini metne dök" },
  { key: "largeText", icon: "text-outline", title: "Büyük metin", detail: "Her yerde %14 daha büyük" },
  { key: "highContrast", icon: "contrast-outline", title: "Yüksek kontrast", detail: "Metin ve çizgiler koyulaşır" },
  { key: "strongFocusRing", icon: "scan-outline", title: "Odak halkası", detail: "Klavye ve anahtar erişimi" },
];

/**
 * Profil: Tema, Erişilebilirlik (module 8; every switch applies to all screens at once) and Notlarım (module 6).
 * Night blue with soft light in dark mode, paper white with the same light, paler, in light mode.
 */
export default function SettingsScreen() {
  const { colors: c, scheme: shown } = useTheme();
  const dark = shown === "dark";
  const { settings, setSetting, themePreference, setThemePreference } = useA11ySettings();
  const { user } = useCommunity();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  // Two choices here, light and dark; a stored "system" shows as the scheme it resolves to.
  const scheme = resolveColorScheme(themePreference, useColorScheme());

  const name = user?.nickname ?? "Gezgin";

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Head>
        <title>Profil · Vagabonds</title>
      </Head>

      <Glow top={insets.top} dark={dark} page={c.background} />

      <View style={[styles.column, { paddingTop: insets.top + HALO_CENTER - AVATAR / 2 - 6 }]}>
        <View style={styles.hero}>
          <View style={[styles.ring, { borderColor: c.highlightMark, backgroundColor: c.background }]}>
            <View style={[styles.avatar, { backgroundColor: c.surfaceRaised }]}>
              {user ? (
                <Text colorValue={c.highlightMark} style={styles.initial} aria-hidden>
                  {name.charAt(0).toLocaleUpperCase("tr")}
                </Text>
              ) : (
                <Ionicons name="person" size={38} color={c.highlightMark} aria-hidden />
              )}
            </View>
          </View>
          <Text variant="overline" colorValue={c.highlight}>
            VAKIF MİRASI GEZGİNİ
          </Text>
          <Text headingLevel={1} style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>

        <Section title="Görünüm">
          <View accessibilityRole="radiogroup" accessibilityLabel="Tema" style={styles.themes}>
            {schemeOptions.map((option) => (
              <ThemeCard key={option.value} value={option.value} label={option.label} on={option.value === scheme} onPress={() => setThemePreference(option.value)} />
            ))}
          </View>
        </Section>

        <Section title="Erişilebilirlik" note="Tüm ekranlara anında uygulanır">
          {/* The switch and the sample are side by side, not one inside the other. */}
          <View style={[styles.wide, tileLook(settings.audioDescription, c.surface, dark ? "transparent" : c.border)]}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.audioDescription }}
              accessibilityLabel="Sesli mimari betimleme"
              accessibilityHint="Kamera açmadan dün ile bugünü dinle"
              onPress={() => setSetting("audioDescription", !settings.audioDescription)}
              style={({ pressed }) => [styles.wideSwitch, pressed && styles.pressed]}
            >
              <View style={styles.tileTop}>
                <TileIcon name="volume-high-outline" on={settings.audioDescription} />
                <Check on={settings.audioDescription} />
              </View>
              <View style={settings.audioDescription && styles.wideText}>
                <Text variant="label" style={styles.tileTitle}>
                  Sesli mimari betimleme
                </Text>
                <Text variant="caption" color="textSecondary">
                  Kamera açmadan dün ile bugünü dinle
                </Text>
              </View>
            </Pressable>
            {settings.audioDescription && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Örnek betimlemeyi dinle"
                onPress={() => speak(timeCurtain.audioDescription)}
                style={({ pressed }) => [styles.play, { backgroundColor: c.highlightMark }, pressed && styles.pressed]}
              >
                <Ionicons name="play" size={16} color={c.onPrimary} style={styles.playIcon} />
                <Text variant="label" colorValue={c.onPrimary}>
                  Dinle
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.grid}>
            {tiles.map(({ key, icon, title, detail }) => {
              const on = settings[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={title}
                  accessibilityHint={detail}
                  onPress={() => setSetting(key, !on)}
                  style={({ pressed }) => [styles.tile, tileLook(on, c.surface, dark ? "transparent" : c.border), pressed && styles.pressed]}
                >
                  <View style={styles.tileTop}>
                    <TileIcon name={icon} on={on} />
                    <Check on={on} />
                  </View>
                  <View>
                    <Text variant="label" style={styles.tileTitle}>
                      {title}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={2}>
                      {detail}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <View style={[styles.notes, { backgroundColor: c.surface }]}>
          <MyContributions />
        </View>

        {Platform.OS === "web" && (
          <Text variant="caption" color="textSecondary" style={styles.center}>
            Harici klavye ya da anahtar erişimi: <Kbd>Tab</Kbd> sıradaki öğeye geçer, <Kbd>Enter</Kbd> seçer,{" "}
            <Kbd>←</Kbd> <Kbd>→</Kbd> perdeyi ve kaydırıcıları oynatır.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const tileLook = (on: boolean, surface: string, border: string) =>
  on ? { backgroundColor: goldWash, borderColor: goldEdge } : { backgroundColor: surface, borderColor: border };

/** Where the avatar's center sits, below the safe area. */
const HALO_CENTER = 120;

/**
 * The head of the page: soft light on the night blue instead of a picture. A gold glow behind
 * the avatar, cool blue and turquoise further off.
 */
function Glow({ top, dark, page }: { top: number; dark: boolean; page: string }) {
  const cy = top + HALO_CENTER;
  // On white the light is paler and warmer, and the blue gives way to a lighter one.
  const blue = dark ? palette.kobalt700 : palette.kobalt300;
  const sea = dark ? palette.firuze700 : palette.firuze300;
  return (
    <View aria-hidden pointerEvents="none" style={[styles.glow, { height: GLOW_HEIGHT + top }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow-gold" cx="50%" cy={cy} r="58%" gradientUnits="userSpaceOnUse" fx="50%" fy={cy}>
            <Stop offset="0" stopColor={palette.altin300} stopOpacity={dark ? 0.32 : 0.4} />
            <Stop offset="1" stopColor={palette.altin300} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glow-blue" cx="8%" cy={top + 10} r="70%" gradientUnits="userSpaceOnUse" fx="8%" fy={top + 10}>
            <Stop offset="0" stopColor={blue} stopOpacity={dark ? 0.55 : 0.3} />
            <Stop offset="1" stopColor={blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glow-sea" cx="100%" cy={cy + 90} r="55%" gradientUnits="userSpaceOnUse" fx="100%" fy={cy + 90}>
            <Stop offset="0" stopColor={sea} stopOpacity={dark ? 0.35 : 0.25} />
            <Stop offset="1" stopColor={sea} stopOpacity={0} />
          </RadialGradient>
          {/* The light ends in the page's own color, never on an edge. */}
          <LinearGradient id="glow-end" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.55" stopColor={page} stopOpacity={0} />
            <Stop offset="1" stopColor={page} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow-blue)" />
        <Rect width="100%" height="100%" fill="url(#glow-sea)" />
        <Rect width="100%" height="100%" fill="url(#glow-gold)" />
        <Rect width="100%" height="100%" fill="url(#glow-end)" />
      </Svg>
    </View>
  );
}

/** A theme as a small picture of a screen in it. */
function ThemeCard({ value, label, on, onPress }: { value: ColorScheme; label: string; on: boolean; onPress: () => void }) {
  const { colors: c } = useTheme();
  const light = value === "light";
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.themeCard, pressed && styles.pressed]}
    >
      <View style={[styles.preview, { borderColor: on ? c.highlightMark : c.border, borderWidth: on ? 2 : StyleSheet.hairlineWidth }]}>
        <View style={[styles.previewHalf, { backgroundColor: light ? palette.gece50 : palette.gece950 }]}>
          <View style={[styles.previewBar, styles.previewBarLong, { backgroundColor: light ? palette.gece300 : palette.gece700 }]} />
          <View style={[styles.previewBar, { backgroundColor: light ? palette.gece200 : palette.gece800 }]} />
          <View style={[styles.previewDot, { backgroundColor: c.highlightMark }]} />
        </View>
      </View>
      <View style={styles.themeLabel}>
        {on && <Ionicons name="checkmark-circle" size={16} color={c.highlightMark} />}
        <Text variant="label" colorValue={on ? c.text : c.textSecondary}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function TileIcon({ name, on }: { name: IconName; on: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.tileIcon, { backgroundColor: on ? c.highlightMark : c.surfaceRaised }]}>
      <Ionicons name={name} size={20} color={on ? c.onPrimary : c.highlightMark} accessibilityElementsHidden importantForAccessibility="no" />
    </View>
  );
}

/** The tile's state, drawn: a gold tick when on, an empty ring when off. */
function Check({ on }: { on: boolean }) {
  const { colors: c } = useTheme();
  return on ? (
    <Ionicons name="checkmark-circle" size={22} color={c.highlightMark} aria-hidden />
  ) : (
    <View style={[styles.empty, { borderColor: c.border }]} aria-hidden />
  );
}

/** A small caps title over a group, with an optional note beside it. */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="caption" color="textSecondary" headingLevel={2} style={styles.sectionTitle}>
          {title.toLocaleUpperCase("tr")}
        </Text>
        {note && (
          <Text variant="caption" color="textSecondary">
            {note}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Kbd({ children }: { children: string }) {
  const { colors: c } = useTheme();
  return (
    <Text variant="caption" style={[styles.kbd, { borderColor: c.border, backgroundColor: c.surface }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  ring: {
    padding: 4,
    marginBottom: spacing.md,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 52,
  },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 48,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xxs,
  },
  sectionTitle: {
    fontFamily: fontFamily.sansSemiBold,
    letterSpacing: 1.5,
  },
  themes: {
    flexDirection: "row",
    gap: spacing.md,
  },
  themeCard: {
    flex: 1,
    gap: spacing.sm,
  },
  preview: {
    flexDirection: "row",
    height: 84,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  previewHalf: {
    flex: 1,
    padding: spacing.sm,
    gap: 6,
  },
  previewBar: {
    width: "55%",
    height: 6,
    borderRadius: 3,
  },
  previewBarLong: {
    width: "80%",
  },
  previewDot: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  themeLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 22,
  },
  wide: {
    borderRadius: radius.xl + spacing.xs,
    borderWidth: 1,
  },
  wideSwitch: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  // Leaves room for the "Dinle" button at the bottom right.
  wideText: {
    paddingRight: 96,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  tile: {
    flexBasis: "40%",
    flexGrow: 1,
    minHeight: 140,
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl + spacing.xs,
    borderWidth: 1,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 16,
  },
  empty: {
    width: 20,
    height: 20,
    margin: 1,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  play: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  playIcon: {
    marginLeft: 1,
  },
  notes: {
    padding: spacing.lg,
    borderRadius: radius.xl + spacing.xs,
  },
  kbd: {
    fontFamily: fontFamily.monoMedium,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
});

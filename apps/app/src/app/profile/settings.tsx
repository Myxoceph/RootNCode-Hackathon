import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sampleDescription } from "@/content/camera";
import { bottomInset } from "@/lib/bottom-inset";
import { speak } from "@/lib/speak";
import { useA11ySettings, type A11ySettings } from "@/settings/a11y-settings";
import { resolveColorScheme, themePreferenceOptions, useColorScheme, type ColorScheme } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

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
 * Profil · Sistem ayarları: Tema and Erişilebilirlik (module 8). Every switch applies to all
 * screens at once.
 */
export default function SystemSettingsScreen() {
  const { colors: c, scheme: shown } = useTheme();
  const dark = shown === "dark";
  const { settings, setSetting, themePreference, setThemePreference } = useA11ySettings();
  const insets = useSafeAreaInsets();
  // Two choices here, light and dark; a stored "system" shows as the scheme it resolves to.
  const scheme = resolveColorScheme(themePreference, useColorScheme());

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: bottomInset(insets.bottom) + spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Head>
        <title>Sistem ayarları · Vagabonds</title>
      </Head>
      <View style={styles.column}>
        <Section title="Görünüm">
          <View accessibilityRole="radiogroup" accessibilityLabel="Tema" style={styles.themes}>
            {schemeOptions.map((option) => (
              <ThemeCard
                key={option.value}
                value={option.value}
                label={option.label}
                on={option.value === scheme}
                onPress={() => setThemePreference(option.value)}
              />
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
              accessibilityHint="Mekânın mimarisini sesli dinle"
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
                  Mekânı gözünü kapatıp dün ile bugünü dinle
                </Text>
              </View>
            </Pressable>
            {settings.audioDescription && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Örnek betimlemeyi dinle"
                onPress={() => speak(sampleDescription.audioDescription)}
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

        {Platform.OS === "web" && (
          <Text variant="caption" color="textSecondary" style={styles.center}>
            Harici klavye ya da anahtar erişimi: <Kbd>Tab</Kbd> sıradaki öğeye geçer, <Kbd>Enter</Kbd> seçer, <Kbd>←</Kbd> <Kbd>→</Kbd> perdeyi ve kaydırıcıları
            oynatır.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const tileLook = (on: boolean, surface: string, border: string) =>
  on ? { backgroundColor: goldWash, borderColor: goldEdge } : { backgroundColor: surface, borderColor: border };

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
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
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
  kbd: {
    fontFamily: fontFamily.monoMedium,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
});

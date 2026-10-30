import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, Card, fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import type { ComponentProps } from "react";
import { Platform, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MyContributions } from "@/components/my-contributions";
import { Segmented } from "@/components/segmented";
import { timeCurtain } from "@/content/camera";
import { speak } from "@/lib/speak";
import { useA11ySettings, type A11ySettings } from "@/settings/a11y-settings";
import { themePreferenceOptions } from "@/theme";

const switches: Array<{ key: keyof A11ySettings; icon: ComponentProps<typeof Ionicons>["name"]; title: string; detail: string }> = [
  { key: "audioDescription", icon: "volume-high-outline", title: "Sesli mimari betimleme", detail: "Kamera açmadan dün ile bugünü dinle" },
  { key: "captions", icon: "chatbox-ellipses-outline", title: "Ambiyans altyazıları", detail: "Ses kapsüllerini metne dök" },
  { key: "largeText", icon: "text-outline", title: "Büyük metin", detail: "Tüm ekranlarda %14 daha büyük" },
  { key: "highContrast", icon: "contrast-outline", title: "Yüksek kontrast", detail: "İkincil metinleri ve çizgileri koyulaştır" },
  { key: "strongFocusRing", icon: "scan-outline", title: "Belirgin odak halkası", detail: "Klavye ve anahtar erişimi için" },
];

/** Profil: Tema, Erişilebilirlik (module 8; every switch applies to all screens at once) and Notlarım (module 6). */
export default function SettingsScreen() {
  const { colors: c } = useTheme();
  const { settings, setSetting, themePreference, setThemePreference } = useA11ySettings();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Head>
        <title>Profil · Vagabonds</title>
      </Head>
      <Text variant="title" headingLevel={1}>
        Erişilebilirlik
      </Text>
      <Text color="textSecondary">Buradaki ayarlar uygulamadaki tüm ekranlara uygulanır.</Text>

      <View style={styles.section}>
        {/* The radio group below carries the name for screen readers; this is its visible label. */}
        <Text variant="label" accessibilityElementsHidden importantForAccessibility="no">
          Tema
        </Text>
        <Segmented
          label="Tema"
          look="track"
          options={themePreferenceOptions}
          value={themePreference}
          onChange={setThemePreference}
        />
      </View>

      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
        {switches.map(({ key, icon, title, detail }, i) => (
          <View
            key={key}
            style={[styles.row, i < switches.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
              <Ionicons name={icon} size={18} color={c.primary} accessibilityElementsHidden importantForAccessibility="no" />
            </View>
            <View style={styles.flex}>
              <Text variant="label">{title}</Text>
              <Text variant="caption" color="textSecondary">
                {detail}
              </Text>
            </View>
            <Switch
              accessibilityLabel={title}
              accessibilityHint={detail}
              value={settings[key]}
              onValueChange={(value) => setSetting(key, value)}
              trackColor={{ false: c.surfaceRaised, true: c.success }}
              thumbColor={settings[key] ? c.onPrimary : c.textSecondary}
              ios_backgroundColor={c.surfaceRaised}
            />
          </View>
        ))}
      </View>

      <Card>
        <Text variant="overline" color="textSecondary">
          SESLİ MİMARİ BETİMLEME · ÖRNEK
        </Text>
        <Text variant="caption">{timeCurtain.audioDescription}</Text>
        <Button
          label="Betimlemeyi dinle"
          icon={<Ionicons name="volume-high-outline" size={18} color={c.onPrimary} />}
          onPress={() => speak(timeCurtain.audioDescription)}
          disabled={!settings.audioDescription}
        />
      </Card>

      <MyContributions />

      {Platform.OS === "web" && (
        <Text variant="caption" color="textSecondary">
          Harici klavye ya da anahtar erişimi: <Kbd>Tab</Kbd> sıradaki öğeye geçer, <Kbd>Enter</Kbd> seçer,{" "}
          <Kbd>←</Kbd> <Kbd>→</Kbd> perdeyi ve kaydırıcıları oynatır.
        </Text>
      )}
    </ScrollView>
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  flex: {
    flex: 1,
  },
  section: {
    gap: spacing.sm,
  },
  group: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget.min + spacing.lg,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  kbd: {
    fontFamily: fontFamily.monoMedium,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, fontFamily, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inscription, inscriptionReadAloud } from "@/content/camera";
import { speak } from "@/lib/speak";
import { useA11ySettings } from "@/settings/a11y-settings";

/**
 * Taşın Dili without the camera (K7): the inscription as a page to read or
 * listen to. Used on the web, when a screen reader is on, and whenever the
 * visitor asks for it on a phone.
 *
 * The visual order is the reading order (WCAG 1.3.2), and it puts what most
 * people can follow first: the Turkish meaning and the waqf's condition come
 * before the transliteration and the Arabic original.
 */
export function InscriptionReading({ onUseCamera }: { onUseCamera: (() => void) | null }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useA11ySettings();

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={() => (router.canGoBack() ? router.back() : router.navigate("/camera"))}
        style={[styles.back, { backgroundColor: c.surface, borderColor: c.border }]}
      >
        <Ionicons name="chevron-back" size={20} color={c.text} />
      </Pressable>

      <View style={styles.intro}>
        <Text variant="title" headingLevel={1}>
          Taşın Dili
        </Text>
        <Text color="textSecondary">{inscription.place}</Text>
      </View>

      <View style={styles.actions}>
        {settings.audioDescription && (
          <Button
            label="Sesli oku"
            icon={<Ionicons name="volume-high-outline" size={18} color={c.onPrimary} />}
            onPress={() => speak(inscriptionReadAloud)}
            style={styles.flex}
          />
        )}
        {onUseCamera && <Button label="Kamerayla tara" variant="ghost" onPress={onUseCamera} style={styles.flex} />}
      </View>

      <Block title="Sadeleştirilmiş meal">
        <Text variant="bodyLarge">{inscription.meaning}</Text>
      </Block>

      <Block title="Vakfiyenin şartı">
        <View style={[styles.quote, { borderLeftColor: c.highlightMark }]}>
          <Text variant="bodyLarge" style={styles.quoteText}>
            {`“${inscription.waqfCondition}”`}
          </Text>
        </View>
      </Block>

      <Block title="Okunuşu">
        <Text style={styles.mono}>{inscription.transcription}</Text>
      </Block>

      <Block title="Orijinal hat · Arapça">
        <Text variant="inscription" color="highlight" language="ar" style={styles.arabic}>
          {inscription.lines.join("\n")}
        </Text>
      </Block>
    </ScrollView>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text variant="overline" color="textSecondary" headingLevel={2}>
        {title.toLocaleUpperCase("tr-TR")}
      </Text>
      {children}
    </View>
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
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  intro: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  block: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: spacing.md,
  },
  quoteText: {
    fontFamily: fontFamily.display,
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
  arabic: {
    textAlign: "right",
  },
});

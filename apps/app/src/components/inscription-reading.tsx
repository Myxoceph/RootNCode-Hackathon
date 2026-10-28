import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, fontFamily, radius, SourceNote, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { InscriptionText } from "@/ar/use-inscription";
import { DataErrorView } from "@/components/resource-view";
import type { ResourceWithRetry } from "@/data";
import { announce } from "@/lib/announce";
import { speak } from "@/lib/speak";
import { useA11ySettings } from "@/settings/a11y-settings";

interface InscriptionReadingProps {
  inscription: ResourceWithRetry<InscriptionText>;
  /** Why the camera is not in use, when it failed to start. */
  notice: string | null;
  onUseCamera: (() => void) | null;
}

/**
 * Taşın Dili without the camera (K7): the inscription as a page to read or
 * listen to. Used on the web, when a screen reader is on, when the camera
 * cannot start, and whenever the visitor asks for it on a phone.
 *
 * The visual order is the reading order (WCAG 1.3.2), and it puts what most
 * people can follow first: today's Turkish and the waqf come before the
 * transliteration.
 */
export function InscriptionReading({ inscription, notice, onUseCamera }: InscriptionReadingProps) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useA11ySettings();

  useEffect(() => {
    if (notice) announce(notice);
  }, [notice]);

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
        {inscription.status === "success" && <Text color="textSecondary">{inscription.data.place}</Text>}
        {inscription.status === "success" && inscription.data.date && (
          <Text variant="data" color="textSecondary">
            {inscription.data.date}
          </Text>
        )}
      </View>

      {notice && (
        <View style={[styles.block, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="alert">
          <Text>{notice}</Text>
        </View>
      )}

      {inscription.status === "loading" && <ActivityIndicator color={c.primary} size="large" accessibilityLabel="Yükleniyor" />}
      {inscription.status === "error" && <DataErrorView error={inscription.error} onRetry={inscription.retry} />}
      {inscription.status === "success" && (
        <>
          <View style={styles.actions}>
            {settings.audioDescription && (
              <Button
                label="Sesli oku"
                icon={<Ionicons name="volume-high-outline" size={18} color={c.onPrimary} />}
                onPress={() => speak(inscription.data.readAloud)}
                style={styles.flex}
              />
            )}
            {onUseCamera && <Button label="Kamerayla tara" variant="ghost" onPress={onUseCamera} style={styles.flex} />}
          </View>
          <InscriptionBlocks text={inscription.data} />
        </>
      )}
      {inscription.status !== "success" && onUseCamera && <Button label="Kamerayla tara" variant="ghost" onPress={onUseCamera} />}
    </ScrollView>
  );
}

function InscriptionBlocks({ text }: { text: InscriptionText }) {
  const { colors: c } = useTheme();
  return (
    <>
      {text.translation && (
        <Block title="Günümüz Türkçesi">
          <Text variant="bodyLarge">{text.translation}</Text>
        </Block>
      )}

      {(text.waqfConditions || text.waqfName) && (
        <Block title={text.waqfConditions ? "Vakfiyenin şartı" : "Vakıf"}>
          {text.waqfConditions ? (
            <View style={[styles.quote, { borderLeftColor: c.highlightMark }]}>
              <Text variant="bodyLarge" style={styles.quoteText}>
                {`“${text.waqfConditions}”`}
              </Text>
            </View>
          ) : (
            <Text variant="bodyLarge">{text.waqfName}</Text>
          )}
        </Block>
      )}

      {text.transliteration && (
        <Block title="Okunuşu">
          <Text style={styles.mono} language={text.transliterationLanguage}>
            {text.transliteration}
          </Text>
        </Block>
      )}

      <SourceNote sources={text.sources} />
    </>
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
});

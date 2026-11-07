import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, fontFamily, SourceNote, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isInscriptionReading, readAloudKey, type InscriptionText } from "@/ar/use-inscription";
import { DataErrorView } from "@/components/resource-view";
import type { ResourceWithRetry } from "@/data";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { speakAnswer, stopAnswer, stopAnswerOf, useSpeaking } from "@/lib/voice";
import { useA11ySettings } from "@/settings/a11y-settings";

interface InscriptionReadingProps {
  inscription: ResourceWithRetry<InscriptionText>;
  /** Why the camera is not in use, when it failed to start. */
  notice: string | null;
  onUseCamera: (() => void) | null;
  /** Asks the assistant about what the camera shows; null where there is no camera (the web). */
  onAsk?: (() => void) | null;
}

/** Width of the reading column, as the asset's dossier. */
const COLUMN = 640;

/**
 * Taşın Dili without the camera (K7): the inscription as a page to read or
 * listen to. Used on the web, when a screen reader is on, when the camera
 * cannot start, and whenever the visitor asks for it on a phone.
 *
 * Set as the asset's dossier: a top bar, an opening with the place, and numbered bands.
 * The visual order is the reading order (WCAG 1.3.2), and it puts what most
 * people can follow first: today's Turkish and the waqf come before the
 * transliteration.
 */
export function InscriptionReading({ inscription, notice, onUseCamera, onAsk = null }: InscriptionReadingProps) {
  const m = useMessages();
  const w = m.reading;
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (notice) announce(notice);
  }, [notice]);

  // Leaving the page (or turning to the camera) ends its own reading, not another screen's.
  useEffect(() => () => stopAnswerOf(isInscriptionReading), []);

  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.common.back}
          hitSlop={6}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/camera"))}
          style={[styles.back, { backgroundColor: c.surfaceRaised }]}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <Text variant="label" numberOfLines={1} style={styles.flex}>
          {m.screens.inscription}
        </Text>
      </View>

      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}>
        <View style={styles.intro}>
          <View style={styles.column}>
            <Text variant="overline" color="textSecondary">
              {[w.inscription, inscription.status === "success" ? inscription.data.date : null].filter(Boolean).join(" · ")}
            </Text>
            <Text variant="display" headingLevel={1}>
              {inscription.status === "success" ? inscription.data.name : m.screens.inscription}
            </Text>
            {inscription.status === "success" && inscription.data.location && (
              <Text variant="caption" color="textSecondary" style={styles.semibold}>
                {inscription.data.location}
              </Text>
            )}

            {notice && (
              <Text color="textSecondary" accessibilityRole="alert">
                {notice}
              </Text>
            )}

            {inscription.status === "success" && <Actions text={inscription.data} onUseCamera={onUseCamera} />}
            {inscription.status !== "success" && onUseCamera && <Button label={w.scanWithCamera} variant="ghost" onPress={onUseCamera} />}
            {onAsk && <Button label={w.askAssistant} accessibilityHint={w.askAssistantHint} variant="ghost" onPress={onAsk} />}
          </View>
        </View>

        {inscription.status === "loading" && <ActivityIndicator color={c.primary} size="large" accessibilityLabel={m.common.loading} />}
        {inscription.status === "error" && (
          <View style={styles.band}>
            <View style={styles.column}>
              <DataErrorView error={inscription.error} onRetry={inscription.retry} />
            </View>
          </View>
        )}
        {inscription.status === "success" && <Bands text={inscription.data} />}
      </ScrollView>
    </View>
  );
}

/** "Sesli oku" in EVREN's voice (the phone's when it cannot be reached), with a Durdur; and the camera. */
function Actions({ text, onUseCamera }: { text: InscriptionText; onUseCamera: (() => void) | null }) {
  const w = useMessages().reading;
  const { colors: c } = useTheme();
  const { settings } = useA11ySettings();
  const reading = useSpeaking() === readAloudKey(text);
  return (
    <View style={styles.actions}>
      {settings.audioDescription && (
        <Button
          label={reading ? w.stop : w.readAloud}
          accessibilityLabel={reading ? w.stopLabel : w.readAloudLabel}
          icon={<Ionicons name={reading ? "stop" : "volume-high-outline"} size={18} color={c.onPrimary} />}
          onPress={() => (reading ? stopAnswer() : void speakAnswer(readAloudKey(text), text.readAloud))}
          style={styles.flex}
        />
      )}
      {onUseCamera && (
        <Button
          label={w.scanWithCamera}
          variant="ghost"
          icon={<Ionicons name="scan-outline" size={18} color={c.text} />}
          onPress={onUseCamera}
          style={styles.flex}
        />
      )}
    </View>
  );
}

function Bands({ text }: { text: InscriptionText }) {
  const w = useMessages().reading;
  const { colors: c } = useTheme();
  const prose = { fontSize: 17, lineHeight: 28 };
  const bands: Array<{ key: string; title: string; body: ReactNode }> = [];
  if (text.translation) {
    bands.push({ key: "translation", title: w.translationBand, body: <Text style={prose}>{text.translation}</Text> });
  }
  if (text.waqfConditions) {
    bands.push({
      key: "waqf",
      title: w.waqfTermBand,
      body: (
        <View style={[styles.quote, { borderLeftColor: c.highlightMark }]}>
          <Text variant="title" style={styles.quoteText}>{`“${text.waqfConditions}”`}</Text>
        </View>
      ),
    });
  } else if (text.waqfName) {
    bands.push({ key: "waqf", title: w.waqfBand, body: <Text style={prose}>{text.waqfName}</Text> });
  }
  if (text.transliteration) {
    bands.push({
      key: "reading",
      title: w.transliterationBand,
      body: (
        <Text style={[styles.mono, { fontSize: 15, lineHeight: 26 }]} language={text.transliterationLanguage}>
          {text.transliteration}
        </Text>
      ),
    });
  }

  return (
    <>
      {bands.map((band, index) => (
        <View key={band.key} style={[styles.band, { backgroundColor: index % 2 === 0 ? c.surface : c.background }]}>
          <View style={styles.column}>
            <View style={styles.blockHead}>
              <View style={styles.blockMark} aria-hidden>
                <Text variant="caption" color="textSecondary" style={styles.blockNumber}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <View style={[styles.blockRule, { backgroundColor: c.highlightMark }]} />
              </View>
              <Text variant="title" headingLevel={2}>
                {band.title}
              </Text>
            </View>
            {band.body}
          </View>
        </View>
      ))}
      <View style={styles.sources}>
        <View style={styles.column}>
          <SourceNote sources={text.sources} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  semibold: {
    fontFamily: fontFamily.sansSemiBold,
  },
  intro: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  column: {
    gap: spacing.md,
    maxWidth: COLUMN,
    width: "100%",
    alignSelf: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  band: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  blockHead: {
    gap: spacing.sm,
  },
  blockMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  blockNumber: {
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1,
  },
  blockRule: {
    width: 32,
    height: 3,
    borderRadius: 2,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
  },
  quoteText: {
    fontFamily: fontFamily.display,
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
  sources: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
});

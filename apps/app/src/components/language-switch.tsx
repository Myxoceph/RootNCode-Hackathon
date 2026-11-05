import type { Lang } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { Pressable, StyleSheet, View } from "react-native";

import { setLang, useLang, useMessages } from "@/i18n";
import { announce } from "@/lib/announce";

const OPTIONS: Lang[] = ["tr", "en"];

interface LanguageSwitchProps {
  /** The chosen language's fill and its text on it. */
  on: { fill: string; text: string };
  /** The other language's text, and the switch's edge. */
  off: { text: string; edge: string };
}

/**
 * "Türkçe | English": the app's language, chosen at once for every screen and the sites' content.
 * Each name is written in its own language, so it can be found whichever is shown.
 */
export function LanguageSwitch({ on, off }: LanguageSwitchProps) {
  const lang = useLang();
  const m = useMessages();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={m.language.title} style={[styles.switch, { borderColor: off.edge }]}>
      {OPTIONS.map((option) => {
        const chosen = option === lang;
        const name = option === "tr" ? m.language.tr : m.language.en;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            accessibilityLabel={name}
            // Read in its own language, as it is written.
            accessibilityLanguage={option === "tr" ? "tr-TR" : "en-US"}
            onPress={() => {
              if (chosen) return;
              setLang(option);
              announce(option === "tr" ? "Türkçe seçildi." : "English selected.");
            }}
            hitSlop={4}
            style={({ pressed }) => [styles.option, chosen && { backgroundColor: on.fill }, pressed && styles.pressed]}
          >
            <Text variant="label" colorValue={chosen ? on.text : off.text} style={styles.text} language={option}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 3,
    gap: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  option: {
    minHeight: touchTarget.min - 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: fontFamily.sansSemiBold,
  },
  pressed: {
    opacity: 0.75,
  },
});

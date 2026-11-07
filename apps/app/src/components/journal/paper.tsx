import { Caveat_400Regular } from "@expo-google-fonts/caveat/400Regular";
import { Caveat_700Bold } from "@expo-google-fonts/caveat/700Bold";
import { fontFamily, useUi } from "@vagabonds/ui";
import { useFonts } from "expo-font";
import { memo } from "react";
import { PixelRatio, StyleSheet, View } from "react-native";

import { useA11ySettings } from "@/settings/a11y-settings";

/** The book is the same in both themes, as the passport is: a real object on the page. */
export const book = {
  paper: "#FBF9F4",
  paperEdge: "#E8E5DD",
  ink: "#2A2320",
  inkSoft: "#5C4E42",
  rule: "rgba(52, 66, 58, 0.17)",
  margin: "rgba(31, 74, 58, 0.34)",
  /** Buttons and marks on the page: the cover's green. */
  leather: "#1F4A3A",
  /** The cover's hide. */
  hideLight: "#245240",
  hide: "#1B4032",
  hideDark: "#0E2A20",
  gold: "#E9CC85",
  /** The gilt on the pages' edge and the ribbon. */
  gilt: "#C9A654",
  ribbon: "#A9863A",
  print: "#FFFEFA",
  tape: "rgba(226, 203, 140, 0.72)",
  labelEdge: "#A58E6C",
  danger: "#8E2A1F",
} as const;

/** What the page lies on while it is arranged: the cover's green, so the page stands out as paper. */
export const desk = {
  back: "#143428",
  raised: "rgba(255, 255, 255, 0.1)",
  ink: "#F5F1E6",
  inkSoft: "#BCCBC1",
} as const;

/** Text sits on the page's lines, so the lines are as far apart as the text is tall. */
export const LINE = 32;
export const MARGIN_LEFT = 44;

const hand = { regular: "Caveat_400Regular", bold: "Caveat_700Bold" };

/**
 * The look of the page in this mode: handwriting and ruled paper, or with "Yüksek kontrast" plain
 * type on a clean page. The font comes only with this screen, not with the app's start; until it
 * arrives the system's is shown.
 */
export function usePageStyle() {
  const { settings } = useA11ySettings();
  const { textScale } = useUi();
  const [loaded] = useFonts({ Caveat_400Regular, Caveat_700Bold });
  const plain = settings.highContrast;
  const handwriting = loaded && !plain;
  return {
    plain,
    line: LINE * textScale * Math.min(PixelRatio.getFontScale(), 2),
    /** For a text field, which `Text`'s own scaling does not reach. */
    input: handwriting
      ? { fontFamily: hand.regular, fontSize: 25 * textScale, lineHeight: LINE * textScale }
      : { fontFamily: fontFamily.sans, fontSize: 18 * textScale, lineHeight: LINE * textScale },
    body: handwriting ? { fontFamily: hand.regular, fontSize: 25, lineHeight: LINE } : { fontFamily: fontFamily.sans, fontSize: 18, lineHeight: LINE },
    date: handwriting ? { fontFamily: hand.bold, fontSize: 25, lineHeight: LINE } : { fontFamily: fontFamily.sansSemiBold, fontSize: 18, lineHeight: LINE },
    ink: plain ? "#000000" : book.ink,
    inkSoft: plain ? "#000000" : book.inkSoft,
  };
}

/** The foot of a page, under its lines: its number and what can be done with it. */
export const PAGE_FOOT = 52;
/** Room above the first line, as a real page has: nothing touches the top edge. */
export const PAGE_HEAD = 12;

/** The writing area of a page this tall, in whole lines: text is never cut through the middle at its foot. */
export function linesArea(height: number, line: number) {
  return Math.max(line, Math.floor((height - PAGE_FOOT - PAGE_HEAD) / line) * line);
}

/** The page's lines and red margin, behind what is written. */
export const RuledLines = memo(function RuledLines({ height, line, plain }: { height: number; line: number; plain: boolean }) {
  if (plain || height <= 0) return null;
  const count = Math.ceil(height / line);
  return (
    <View aria-hidden pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.rule, { top: (index + 1) * line - 1 }]} />
      ))}
      <View style={styles.margin} />
    </View>
  );
});

const styles = StyleSheet.create({
  rule: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: book.rule,
  },
  margin: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: MARGIN_LEFT - 10,
    width: 1,
    backgroundColor: book.margin,
  },
});

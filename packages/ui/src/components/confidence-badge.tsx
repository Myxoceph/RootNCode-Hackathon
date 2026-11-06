import { Linking, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { ThemeRole } from "../themes";
import { radius, spacing, touchTarget } from "../tokens/spacing";
import { fontFamily } from "../tokens/typography";
import { Text } from "./text";
import { useTheme, useUiWords, type UiWords } from "./theme-context";

/** The confidence codes of the `/assets` contract (`ConfidenceCodeSchema`). */
export type ConfidenceCode = "certain" | "probable" | "disputed" | "legend";

export interface Confidence {
  code: ConfidenceCode;
  /** The label the API sends, already in the user's language ("Tahmini", "Tartışmalı"…). */
  label: string;
}

interface BadgeLook {
  color: Extract<ThemeRole, "success" | "primary" | "warning" | "highlight">;
  /** Each level differs in shape too, so it never depends on color alone (WCAG 1.4.1). */
  border: "none" | "dashed" | "solid" | "filled";
  /** Read before the label, so "Tahmini" is heard as a confidence level, not loose text. */
  spoken: "confidence" | "infoKind";
}

const looks: Record<ConfidenceCode, BadgeLook> = {
  certain: { color: "success", border: "none", spoken: "confidence" },
  probable: { color: "primary", border: "dashed", spoken: "confidence" },
  disputed: { color: "warning", border: "solid", spoken: "confidence" },
  legend: { color: "highlight", border: "filled", spoken: "infoKind" },
};

function BadgeIcon({ code, color }: { code: ConfidenceCode; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  // Hidden on a wrapping View: react-native-svg passes accessibility props on to the DOM on the web.
  return (
    <View aria-hidden>
      <Svg width={14} height={14} viewBox="0 0 16 16">
        {code === "certain" && (
          <>
            <Circle cx={8} cy={8} r={6.5} {...stroke} />
            <Path d="M5 8.2l2 2 4-4.2" {...stroke} />
          </>
        )}
        {/* "About": two waves, as in ≈ */}
        {code === "probable" && <Path d="M2.5 6c1.8-1.6 3.7-1.6 5.5 0s3.7 1.6 5.5 0M2.5 10.5c1.8-1.6 3.7-1.6 5.5 0s3.7 1.6 5.5 0" {...stroke} />}
        {/* Two views pointing at each other */}
        {code === "disputed" && <Path d="M2 5.5h10M9.5 3l2.5 2.5L9.5 8M14 10.5H4M6.5 8L4 10.5 6.5 13" {...stroke} />}
        {/* Quotation marks: something told, not recorded */}
        {code === "legend" && (
          <Path d="M3 10.5c0-2.6 1-4.3 3-5.2M3 10.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M9 10.5c0-2.6 1-4.3 3-5.2M9 10.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0" {...stroke} />
        )}
      </Svg>
    </View>
  );
}

export interface ConfidenceBadgeProps {
  confidence: Confidence;
  /**
   * `certain` is the default state of a sourced fact, so it is hidden unless
   * asked for. `probable`, `disputed` and `legend` always show: the contract
   * forbids presenting them as plain fact.
   */
  showCertain?: boolean;
}

/** Confidence of one piece of content: an icon, the API's label and a border style per level. */
export function ConfidenceBadge({ confidence, showCertain = false }: ConfidenceBadgeProps) {
  const { colors: c } = useTheme();
  const words = useUiWords();
  if (confidence.code === "certain" && !showCertain) return null;

  const look = looks[confidence.code];
  const color = c[look.color];

  return (
    <View
      accessible
      accessibilityLabel={`${words[look.spoken]}: ${confidence.label}`}
      style={[
        styles.badge,
        look.border === "filled" && { backgroundColor: c.surfaceRaised },
        look.border !== "none" && look.border !== "filled" && { borderWidth: 1, borderColor: color, borderStyle: look.border },
      ]}
    >
      <BadgeIcon code={confidence.code} color={color} />
      <Text variant="caption" colorValue={color} style={styles.label}>
        {confidence.label}
      </Text>
    </View>
  );
}

/** Verdicts of the `/assets` legends (`LegendVerdictSchema`). */
export type LegendVerdict = "folk_belief" | "refuted_by_source" | "unverified";

export const legendVerdictLabel: Record<LegendVerdict, string> = {
  folk_belief: "Halk inancı",
  refuted_by_source: "Kaynak bu anlatıyı doğrulamıyor",
  unverified: "Kaynakla doğrulanmadı",
};

/** Where a piece of content comes from (`SourceRefSchema`). */
export interface SourceRef {
  sourceId: string;
  title: string;
  pages: string | null;
  url: string | null;
}

function formatPages(pages: string, words: UiWords): string {
  return `${words.pagesShort} ${pages.replace("-", "–")}`;
}

const sourceText = (source: SourceRef, words: UiWords) => (source.pages ? `${source.title}, ${formatPages(source.pages, words)}` : source.title);
const sourceSpoken = (source: SourceRef, words: UiWords) => (source.pages ? `${source.title}, ${words.pageSpoken} ${source.pages}` : source.title);

export interface SourceNoteProps {
  sources: SourceRef[];
  /**
   * One line of plain text without links, for long lists (facts, timeline) where a
   * 44pt link target on every row would crowd the page; link the same books once elsewhere.
   */
  compact?: boolean;
}

/**
 * "Kaynak: Bursa Vakıf Eserleri – I. Cilt, s. 52–55". Each source with a
 * link opens it; screen readers hear "sayfa" instead of "s.".
 */
export function SourceNote({ sources, compact = false }: SourceNoteProps) {
  const { colors: c } = useTheme();
  const words = useUiWords();
  if (sources.length === 0) {
    return (
      <Text variant="caption" color="warning">
        {words.noSource}
      </Text>
    );
  }

  const prefix = sources.length === 1 ? words.source : words.sources;
  if (compact) {
    return (
      <Text variant="caption" color="textSecondary" accessibilityLabel={`${prefix} ${sources.map((source) => sourceSpoken(source, words)).join("; ")}`}>
        {`${prefix} ${sources.map((source) => sourceText(source, words)).join("; ")}`}
      </Text>
    );
  }

  return (
    <View style={styles.sources}>
      <Text variant="caption" color="textSecondary">
        {prefix}
      </Text>
      {/* The same book can be cited twice with different pages, so the id alone is not a key. */}
      {sources.map((source, index) => {
        const key = `${source.sourceId}-${index}`;
        const text = sourceText(source, words);
        const spoken = sourceSpoken(source, words);
        if (!source.url) {
          return (
            <Text key={key} variant="caption" color="textSecondary" accessibilityLabel={spoken}>
              {text}
            </Text>
          );
        }
        const url = source.url;
        return (
          <Pressable
            key={key}
            accessibilityRole="link"
            accessibilityLabel={spoken}
            onPress={() => Linking.openURL(url)}
            style={styles.sourceLink}
          >
            <Text variant="caption" colorValue={c.primary} style={styles.underline}>
              {text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  label: {
    fontFamily: fontFamily.sansSemiBold,
  },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.xs,
  },
  sourceLink: {
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
  underline: {
    textDecorationLine: "underline",
  },
});

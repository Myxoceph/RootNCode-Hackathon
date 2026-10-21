import Ionicons from "@expo/vector-icons/Ionicons";
import type { Confidence, ConfidenceCode, LegendVerdict, SourceRef } from "@vagabonds/contracts";
import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors, type ColorRole } from "@/theme";

/*
 * How sure the data is, and where it comes from. Interim design until K6:
 * every badge carries an icon and a word, never color alone, and every color is a
 * pair checked by `npm run ui:contrast`.
 */

type IconName = ComponentProps<typeof Ionicons>["name"];

const badgeStyle: Record<Exclude<ConfidenceCode, "certain">, { icon: IconName; color: ColorRole }> = {
  probable: { icon: "help-circle-outline", color: "textSecondary" },
  disputed: { icon: "alert-circle-outline", color: "warning" },
  legend: { icon: "book-outline", color: "highlight" },
};

/**
 * Marks content the sources do not state as fact. `certain` gets no badge: it is the
 * default, and a badge on every paragraph would hide the ones that matter.
 */
export function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  if (confidence === null || confidence.code === "certain") return null;
  const { icon, color } = badgeStyle[confidence.code];
  return <Badge icon={icon} color={color} label={confidence.label} />;
}

const verdictLabel: Record<LegendVerdict, string> = {
  folk_belief: "Halk inancı",
  refuted_by_source: "Kaynak doğrulamıyor",
  unverified: "Doğrulanmadı",
};

/** A legend is always marked as one, together with what the sources say about it. */
export function LegendBadge({ verdict }: { verdict: LegendVerdict }) {
  return <Badge icon="book-outline" color="highlight" label={`Rivayet · ${verdictLabel[verdict]}`} />;
}

function Badge({ icon, color, label }: { icon: IconName; color: ColorRole; label: string }) {
  const c = useColors();
  return (
    <View
      style={[styles.badge, { borderColor: c[color] }]}
      accessible
      accessibilityLabel={`Güven düzeyi: ${label}`}
    >
      <Ionicons name={icon} size={16} color={c[color]} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={[typography.caption, { color: c[color] }]}>{label}</Text>
    </View>
  );
}

/** "Bursa Vakıf Eserleri – I. Cilt, s. 38-41" */
export function formatSource(source: SourceRef): string {
  return source.pages ? `${source.title}, s. ${source.pages}` : source.title;
}

/**
 * "Kaynak: Bursa Vakıf Eserleri – I. Cilt, s. 38-41", one line per source.
 * Sources with a URL open it (the inventory books are public PDFs).
 *
 * `compact` is for long lists (facts, timeline): plain text without the 44pt link
 * target on every row. The same books are linked in the page's Kaynakça.
 */
export function SourceNote({ sources, compact = false }: { sources: SourceRef[]; compact?: boolean }) {
  if (sources.length === 0) return null;
  return (
    <View style={styles.sources}>
      {sources.map((source, index) => (
        <SourceLine
          key={`${source.sourceId}-${source.pages ?? index}`}
          source={source}
          prefix="Kaynak: "
          linked={!compact}
        />
      ))}
    </View>
  );
}

export function SourceLine({ source, prefix = "", linked = true }: { source: SourceRef; prefix?: string; linked?: boolean }) {
  const c = useColors();
  const text = `${prefix}${formatSource(source)}`;

  if (source.url === null || !linked) {
    return <Text style={[typography.caption, { color: c.textSecondary }]}>{text}</Text>;
  }
  return (
    <Link
      // The contract validates it with z.url(), so it always has a scheme.
      href={source.url as `${string}:${string}`}
      target="_blank"
      rel="noopener noreferrer"
      accessibilityRole="link"
      accessibilityHint="Kaynağı yeni pencerede açar"
      style={[typography.caption, styles.sourceLink, { color: c.textSecondary }]}
    >
      {text}
    </Link>
  );
}

/** A heading with the badge beside it, wrapping under it on narrow screens. */
export function HeadingWithBadge({ title, confidence }: { title: string; confidence: Confidence | null }) {
  const c = useColors();
  return (
    <View style={styles.headingRow}>
      <Text accessibilityRole="header" style={[typography.heading, { color: c.text }]}>
        {title}
      </Text>
      <ConfidenceBadge confidence={confidence} />
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
    borderWidth: 1,
  },
  sources: {
    gap: spacing.xxs,
  },
  sourceLink: {
    minHeight: touchTarget.min,
    paddingVertical: spacing.sm,
    textDecorationLine: "underline",
  },
  headingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
});

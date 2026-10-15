import type { Monument } from "@vagabonds/contracts";
import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { monumentTypeLabel } from "@/lib/labels";
import { useColors } from "@/theme";

/**
 * One monument in the list. A real link (an `<a href>` on the web), so it can be
 * opened in a new tab or shared. Moves to the design system's `Card` once K5 lands.
 */
export function MonumentCard({ monument }: { monument: Monument }) {
  const c = useColors();
  const meta = `${monumentTypeLabel[monument.monumentType]} · ${monument.city}`;

  return (
    <Link href={{ pathname: "/monuments/[slug]", params: { slug: monument.slug } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${monument.name}, ${meta}, ${monument.period}`}
        // `Link asChild` needs one flat style object: it rejects arrays and drops function styles.
        style={StyleSheet.flatten([styles.card, { backgroundColor: c.surface, borderColor: c.border }])}
      >
        <Text style={[typography.heading, { color: c.text }]}>{monument.name}</Text>
        <Text style={[typography.label, { color: c.primary }]}>{meta}</Text>
        <Text style={[typography.body, { color: c.textSecondary }]}>{monument.period}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: touchTarget.min,
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

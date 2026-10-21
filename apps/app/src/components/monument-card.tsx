import type { Monument } from "@vagabonds/contracts";
import { Card, fontFamily, spacing, Text, touchTarget } from "@vagabonds/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { monumentTypeLabel } from "@/lib/labels";

/**
 * One monument in the list. A real link (an `<a href>` on the web), so it can be
 * opened in a new tab or shared.
 */
export function MonumentCard({ monument }: { monument: Monument }) {
  const meta = `${monumentTypeLabel[monument.monumentType]} · ${monument.city}`;

  return (
    <Link href={{ pathname: "/monuments/[slug]", params: { slug: monument.slug } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${monument.name}, ${meta}, ${monument.period}`}
        style={styles.pressable}
      >
        <Card>
          <Text variant="heading">{monument.name}</Text>
          <Text variant="label" color="primary">
            {meta}
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.mono}>
            {monument.period}
          </Text>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: touchTarget.min,
  },
  mono: {
    fontFamily: fontFamily.mono,
    marginTop: spacing.xxs,
  },
});

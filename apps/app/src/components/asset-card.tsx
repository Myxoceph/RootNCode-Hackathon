import type { AssetSummary } from "@vagabonds/contracts";
import { radius, spacing, touchTarget, typography } from "@vagabonds/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { useColors } from "@/theme";

/**
 * One asset in the list. A real link (an `<a href>` on the web), so it can be
 * opened in a new tab or shared. Moves to the design system's `Card` once K5 lands.
 */
export function AssetCard({ asset }: { asset: AssetSummary }) {
  const c = useColors();
  const meta = `${asset.type.label} · ${asset.district}, ${asset.city.label}`;
  const label = [asset.name, meta, asset.datingDisplay].filter(Boolean).join(", ");

  return (
    <Link href={{ pathname: "/monuments/[id]", params: { id: asset.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        // `Link asChild` needs one flat style object: it rejects arrays and drops function styles.
        style={StyleSheet.flatten([styles.card, { backgroundColor: c.surface, borderColor: c.border }])}
      >
        {asset.cover && <AssetImage media={asset.cover} decorative style={styles.cover} />}
        <View style={styles.body}>
          <Text style={[typography.heading, { color: c.text }]}>{asset.name}</Text>
          <Text style={[typography.label, { color: c.primary }]}>{meta}</Text>
          {asset.datingDisplay && (
            <Text style={[typography.caption, { color: c.textSecondary }]}>{asset.datingDisplay}</Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: touchTarget.min,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cover: {
    // Photos come in every shape; the list keeps one height so it scans evenly.
    aspectRatio: 16 / 9,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
});

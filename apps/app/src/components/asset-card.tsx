import type { AssetSummary } from "@vagabonds/contracts";
import { Card, fontFamily, spacing, Text, touchTarget } from "@vagabonds/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { AssetImage } from "@/components/asset-image";

/**
 * One asset in the list. A real link (an `<a href>` on the web), so it can be
 * opened in a new tab or shared; announced once, as one link.
 */
export function AssetCard({ asset }: { asset: AssetSummary }) {
  const meta = `${asset.type.label} · ${asset.district}, ${asset.city.label}`;
  const label = [asset.name, meta, asset.datingDisplay].filter(Boolean).join(", ");

  return (
    <Link href={{ pathname: "/monuments/[id]", params: { id: asset.id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={label} style={styles.pressable}>
        <Card style={styles.card}>
          {asset.cover && <AssetImage media={asset.cover} decorative style={styles.cover} />}
          <View style={styles.body}>
            <Text variant="heading">{asset.name}</Text>
            <Text variant="label" color="primary">
              {meta}
            </Text>
            {asset.datingDisplay && (
              <Text variant="caption" color="textSecondary" style={styles.mono}>
                {asset.datingDisplay}
              </Text>
            )}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: touchTarget.min,
  },
  card: {
    // The photo runs edge to edge; the text keeps the card's padding.
    padding: 0,
    gap: 0,
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
  mono: {
    fontFamily: fontFamily.mono,
  },
});

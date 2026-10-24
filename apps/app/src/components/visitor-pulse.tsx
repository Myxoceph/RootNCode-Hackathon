import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, PulseItem } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Pressable, StyleSheet, View } from "react-native";

import { ContributionForm } from "@/components/contribution-form";
import { pulseItemsFromTips, usePulse } from "@/data";
import { formatDate } from "@/lib/format-date";

const origins: Record<PulseItem["origin"], string> = {
  field_visit: "Saha ziyareti",
  visitor_reviews_summary: "Ziyaretçi yorumlarından özet",
  official: "Resmî bilgi",
  community: "Ziyaretçi",
};

const accents = ["warning", "highlight", "primary", "success"] as const;

/**
 * Ziyaretçi Notları (module 6): the dataset's field tips first, then notes visitors sent and a
 * moderator approved; memories apart, as they are recollections, not advice. The dataset tips
 * show at once and stay when the pulse cannot be fetched.
 */
export function VisitorPulse({ asset }: { asset: AssetDetail }) {
  const pulse = usePulse(asset.id);
  const items = pulse.status === "success" && pulse.data ? pulse.data.items : pulseItemsFromTips(asset.visitorTips);
  const tips = items.filter((item) => item.kind === "tip");
  const memories = items.filter((item) => item.kind === "memory");
  const shownCommunity = items.filter((item) => item.origin === "community").length;
  const moreCommunity = pulse.status === "success" && pulse.data ? pulse.data.communityTotal - shownCommunity : 0;

  return (
    <View style={styles.pulse}>
      {tips.length === 0 ? (
        <Text color="textSecondary">Bu eser için henüz ziyaretçi notu yok. İlk notu sen bırakabilirsin.</Text>
      ) : (
        <PulseList items={tips} icon="chatbubble-ellipses-outline" />
      )}

      {memories.length > 0 && (
        <View style={styles.pulse}>
          <Text variant="overline" color="textSecondary" headingLevel={2}>
            ANILAR
          </Text>
          <PulseList items={memories} icon="time-outline" />
        </View>
      )}

      {moreCommunity > 0 && (
        <Text variant="caption" color="textSecondary">
          {`En yeni notlar gösteriliyor; ${moreCommunity} not daha var.`}
        </Text>
      )}
      {pulse.status === "error" && <PulseError onRetry={pulse.retry} />}

      <ContributionForm assetId={asset.id} />
    </View>
  );
}

function PulseList({ items, icon }: { items: PulseItem[]; icon: "chatbubble-ellipses-outline" | "time-outline" }) {
  const { colors: c } = useTheme();
  return (
    <View accessibilityRole="list" style={styles.list}>
      {items.map((item, i) => {
        const accent = c[accents[i % accents.length] ?? "primary"];
        const meta = [item.author ?? origins[item.origin], item.date && formatDate(item.date)].filter(Boolean).join(" · ");
        return (
          <View key={item.id} style={[styles.item, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
              <Ionicons name={icon} size={16} color={accent} accessibilityElementsHidden importantForAccessibility="no" />
            </View>
            <View style={styles.flex}>
              <Text>{item.text}</Text>
              <Text variant="caption" color="textSecondary">
                {meta}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PulseError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorRow}>
      <Text variant="caption" color="textSecondary" style={styles.flex}>
        Ziyaretçilerin son notları şu an yüklenemedi.
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <Text variant="label" color="primary">
          Tekrar dene
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pulse: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  retry: {
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
});

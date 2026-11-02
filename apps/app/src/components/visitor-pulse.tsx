import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, PulseItem } from "@vagabonds/contracts";
import { cameraColors, spacing, Text, touchTarget } from "@vagabonds/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { pulseItemsFromTips, usePulse } from "@/data";
import { formatDate } from "@/lib/format-date";

const origins: Record<PulseItem["origin"], string> = {
  field_visit: "Saha ziyareti",
  visitor_reviews_summary: "Ziyaretçi yorumlarından özet",
  official: "Resmî bilgi",
  community: "Ziyaretçi",
};

const EDGE = "rgba(255, 255, 255, 0.16)";

/**
 * Ziyaretçi Notları (module 6) on the eser kartı's last page, over its photo: the dataset's field tips
 * first, then notes visitors sent and a moderator approved; memories apart, as they are recollections,
 * not advice. The dataset tips show at once and stay when the pulse cannot be fetched. Notes are
 * written on the Not bırak page.
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
      <Text variant="overline" colorValue={cameraColors.gold} headingLevel={2}>
        ZİYARETÇİ NOTLARI
      </Text>
      {items.length === 0 && <Text colorValue={cameraColors.textSecondary}>Bu eser için henüz ziyaretçi notu yok. İlk notu sen bırakabilirsin.</Text>}
      {tips.length > 0 && <PulseList items={tips} />}

      {memories.length > 0 && (
        <View style={styles.pulse}>
          <Text variant="overline" colorValue={cameraColors.textSecondary} headingLevel={3}>
            ANILAR
          </Text>
          <PulseList items={memories} />
        </View>
      )}

      {moreCommunity > 0 && (
        <Text variant="caption" colorValue={cameraColors.textSecondary}>
          {`En yeni notlar gösteriliyor; ${moreCommunity} not daha var.`}
        </Text>
      )}
      {pulse.status === "error" && <PulseError onRetry={pulse.retry} />}

      <Link href={{ pathname: "/note", params: { asset: asset.id } }} asChild>
        {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
        <Pressable accessibilityRole="link" accessibilityLabel={`${asset.name} için not bırak`} style={styles.leave}>
          <Ionicons name="create-outline" size={22} color={cameraColors.gold} />
          <Text variant="label" colorValue={cameraColors.text} style={styles.flex}>
            Not bırak
          </Text>
          <Ionicons name="chevron-forward" size={18} color={cameraColors.textSecondary} />
        </Pressable>
      </Link>
    </View>
  );
}

function PulseList({ items }: { items: PulseItem[] }) {
  return (
    <View accessibilityRole="list" style={styles.list}>
      {items.map((item) => (
        <View key={item.id} style={styles.item}>
          <Text colorValue={cameraColors.text}>{item.text}</Text>
          <Text variant="caption" colorValue={cameraColors.textSecondary}>
            {[item.author ?? origins[item.origin], item.date && formatDate(item.date)].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PulseError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorRow}>
      <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.flex}>
        Ziyaretçilerin son notları şu an yüklenemedi.
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <Text variant="label" colorValue={cameraColors.gold}>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: EDGE,
  },
  item: {
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: EDGE,
  },
  leave: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: touchTarget.min,
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

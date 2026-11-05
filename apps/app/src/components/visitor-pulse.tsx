import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, PulseItem } from "@vagabonds/contracts";
import { cameraColors, spacing, Text, touchTarget } from "@vagabonds/ui";
import { Pressable, StyleSheet, View } from "react-native";

import { pulseItemsFromTips, usePulse } from "@/data";
import { formatDate } from "@/lib/format-date";
import { FrameLink } from "@/lib/in-frame";

const origins: Record<PulseItem["origin"], string> = {
  field_visit: "Saha ziyareti",
  visitor_reviews_summary: "Ziyaretçi yorumlarından özet",
  official: "Resmî bilgi",
  community: "Ziyaretçi",
};

const EDGE = "rgba(255, 255, 255, 0.16)";

/** The colours the notes take: over the dark story by default, the web article's by theme there. */
export interface PulseLook {
  text: string;
  soft: string;
  gold: string;
  edge: string;
}
const STORY_LOOK: PulseLook = {
  text: cameraColors.text,
  soft: cameraColors.textSecondary,
  gold: cameraColors.gold,
  edge: EDGE,
};

/**
 * Ziyaretçi Notları (module 6) on the eser kartı's last page, over its photo: the dataset's field tips
 * first, then notes visitors sent and a moderator approved; memories apart, as they are recollections,
 * not advice. The dataset tips show at once and stay when the pulse cannot be fetched. Notes are
 * written on the Not bırak page.
 */
export function VisitorPulse({
  asset,
  look = STORY_LOOK,
}: {
  asset: AssetDetail;
  look?: PulseLook;
}) {
  const pulse = usePulse(asset.id);
  const items =
    pulse.status === "success" && pulse.data
      ? pulse.data.items
      : pulseItemsFromTips(asset.visitorTips);
  const tips = items.filter((item) => item.kind === "tip");
  const memories = items.filter((item) => item.kind === "memory");
  const shownCommunity = items.filter(
    (item) => item.origin === "community",
  ).length;
  const moreCommunity =
    pulse.status === "success" && pulse.data
      ? pulse.data.communityTotal - shownCommunity
      : 0;

  return (
    <View style={styles.pulse}>
      <Text variant="overline" colorValue={look.gold} headingLevel={2}>
        ZİYARETÇİ NOTLARI
      </Text>
      {items.length === 0 && (
        <Text colorValue={look.soft}>
          Bu eser için henüz ziyaretçi notu yok. İlk notu sen bırakabilirsin.
        </Text>
      )}
      {tips.length > 0 && <PulseList items={tips} look={look} />}

      {memories.length > 0 && (
        <View style={styles.pulse}>
          <Text variant="overline" colorValue={look.soft} headingLevel={3}>
            ANILAR
          </Text>
          <PulseList items={memories} look={look} />
        </View>
      )}

      {moreCommunity > 0 && (
        <Text variant="caption" colorValue={look.soft}>
          {`En yeni notlar gösteriliyor; ${moreCommunity} not daha var.`}
        </Text>
      )}
      {pulse.status === "error" && (
        <PulseError onRetry={pulse.retry} look={look} />
      )}

      <FrameLink href={{ pathname: "/note", params: { asset: asset.id } }}>
        {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${asset.name} için not bırak`}
          style={styles.leave}
        >
          <Ionicons name="create-outline" size={22} color={look.gold} />
          <Text variant="label" colorValue={look.text} style={styles.flex}>
            Not bırak
          </Text>
          <Ionicons name="chevron-forward" size={18} color={look.soft} />
        </Pressable>
      </FrameLink>
    </View>
  );
}

function PulseList({ items, look }: { items: PulseItem[]; look: PulseLook }) {
  return (
    <View
      accessibilityRole="list"
      style={[styles.list, { borderTopColor: look.edge }]}
    >
      {items.map((item) => (
        <View
          key={item.id}
          style={[styles.item, { borderBottomColor: look.edge }]}
        >
          <Text colorValue={look.text}>{item.text}</Text>
          <Text variant="caption" colorValue={look.soft}>
            {[
              item.author ?? origins[item.origin],
              item.date && formatDate(item.date),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PulseError({
  onRetry,
  look,
}: {
  onRetry: () => void;
  look: PulseLook;
}) {
  return (
    <View style={styles.errorRow}>
      <Text variant="caption" colorValue={look.soft} style={styles.flex}>
        Ziyaretçilerin son notları şu an yüklenemedi.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retry}
      >
        <Text variant="label" colorValue={look.gold}>
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

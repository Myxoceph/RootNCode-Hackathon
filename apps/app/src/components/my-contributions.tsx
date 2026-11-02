import type { Contribution, ContributionStatus } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget, useTheme, type ThemeRole } from "@vagabonds/ui";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { useCommunity, useMyContributions } from "@/data";
import { formatDate } from "@/lib/format-date";

const statuses: Record<ContributionStatus, { label: string; color: ThemeRole }> = {
  pending: { label: "İncelemede", color: "highlight" },
  approved: { label: "Yayında", color: "success" },
  rejected: { label: "Yayınlanmadı", color: "warning" },
};

const kinds: Record<Contribution["kind"], string> = {
  tip: "İpucu",
  memory: "Anı",
  correction: "Düzeltme",
  photo: "Fotoğraf",
};

/**
 * Profil · Bıraktığım Notlar (module 6): the notes the visitor sent and what the moderators
 * decided. `title` null leaves the heading to the page's own header.
 */
export function MyContributions({ title = "Notlarım" }: { title?: string | null }) {
  const { colors: c } = useTheme();
  const { user, assetNames } = useCommunity();
  const mine = useMyContributions();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.flex}>
          {title && (
            <Text variant="heading" headingLevel={2}>
              {title}
            </Text>
          )}
        </View>
        {user && (
          <Pressable accessibilityRole="button" accessibilityLabel="Notlarımı yenile" onPress={mine.retry} style={styles.refresh}>
            <Text variant="label" color="primary">
              Yenile
            </Text>
          </Pressable>
        )}
      </View>
      {user && (
        <Text variant="caption" color="textSecondary">
          {`${user.nickname} takma adıyla`}
        </Text>
      )}

      {mine.status === "loading" && <ActivityIndicator color={c.textSecondary} accessibilityLabel="Notların yükleniyor" />}
      {mine.status === "error" && (
        <Text variant="caption" color="textSecondary">
          {mine.error.message}
        </Text>
      )}
      {mine.status === "success" && (mine.data === null || mine.data.length === 0) && (
        <Text color="textSecondary">Eser sayfalarındaki Ziyaretçi Notları sekmesinden not bırakınca durumunu burada görürsün.</Text>
      )}
      {mine.status === "success" && mine.data && mine.data.length > 0 && (
        <View accessibilityRole="list" style={styles.list}>
          {mine.data.map((item) => (
            <ContributionRow key={item.id} item={item} name={assetNames[item.assetId] ?? "Eser"} />
          ))}
        </View>
      )}
    </View>
  );
}

function ContributionRow({ item, name }: { item: Contribution; name: string }) {
  const { colors: c } = useTheme();
  const status = statuses[item.status];

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.rowHeader}>
        <Link href={{ pathname: "/asset/[id]", params: { id: item.assetId } }} style={styles.flex}>
          <Text variant="label" color="primary">
            {name}
          </Text>
        </Link>
        <Text variant="caption" color={status.color}>
          {status.label}
        </Text>
      </View>
      <Text numberOfLines={4}>{item.body}</Text>
      <Text variant="caption" color="textSecondary">
        {`${kinds[item.kind]} · ${formatDate(item.createdAt)}`}
      </Text>
      {item.status === "rejected" && item.rejectReason && (
        <Text variant="caption" color="textSecondary">
          {`Moderatör notu: ${item.rejectReason}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  section: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  refresh: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});

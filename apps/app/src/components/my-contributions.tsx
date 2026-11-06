import type { Contribution, ContributionStatus } from "@vagabonds/contracts";
import { radius, spacing, Text, touchTarget, useTheme, type ThemeRole } from "@vagabonds/ui";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { useCommunity, useMyContributions } from "@/data";
import { useLang, useMessages } from "@/i18n";
import { formatDate } from "@/lib/format-date";

const statusColors: Record<ContributionStatus, ThemeRole> = {
  pending: "highlight",
  approved: "success",
  rejected: "warning",
};

/**
 * Profil · Bıraktığım Notlar (module 6): the notes the visitor sent and what the moderators
 * decided. `title` null leaves the heading to the page's own header.
 */
export function MyContributions({ title }: { title?: string | null }) {
  const w = useMessages().notes;
  const heading = title === undefined ? w.title : title;
  const { colors: c } = useTheme();
  const { user, assetNames } = useCommunity();
  const mine = useMyContributions();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.flex}>
          {heading && (
            <Text variant="heading" headingLevel={2}>
              {heading}
            </Text>
          )}
        </View>
        {user && (
          <Pressable accessibilityRole="button" accessibilityLabel={w.refreshLabel} onPress={mine.retry} style={styles.refresh}>
            <Text variant="label" color="primary">
              {w.refresh}
            </Text>
          </Pressable>
        )}
      </View>
      {user && (
        <Text variant="caption" color="textSecondary">
          {w.nickname(user.nickname)}
        </Text>
      )}

      {mine.status === "loading" && <ActivityIndicator color={c.textSecondary} accessibilityLabel={w.loading} />}
      {mine.status === "error" && (
        <Text variant="caption" color="textSecondary">
          {mine.error.message}
        </Text>
      )}
      {mine.status === "success" && (mine.data === null || mine.data.length === 0) && (
        <Text color="textSecondary">{w.empty}</Text>
      )}
      {mine.status === "success" && mine.data && mine.data.length > 0 && (
        <View accessibilityRole="list" style={styles.list}>
          {mine.data.map((item) => (
            <ContributionRow key={item.id} item={item} name={assetNames[item.assetId] ?? w.site} />
          ))}
        </View>
      )}
    </View>
  );
}

function ContributionRow({ item, name }: { item: Contribution; name: string }) {
  const { colors: c } = useTheme();
  const w = useMessages().notes;
  // The date follows the language: `formatDate` reads it outside React.
  const lang = useLang();

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.rowHeader}>
        <Link href={{ pathname: "/asset/[id]", params: { id: item.assetId } }} style={styles.flex}>
          <Text variant="label" color="primary">
            {name}
          </Text>
        </Link>
        <Text variant="caption" color={statusColors[item.status]}>
          {w.statuses[item.status]}
        </Text>
      </View>
      <Text numberOfLines={4}>{item.body}</Text>
      <Text variant="caption" color="textSecondary">
        {`${w.kinds[item.kind]} · ${formatDate(item.createdAt, lang)}`}
      </Text>
      {item.status === "rejected" && item.rejectReason && (
        <Text variant="caption" color="textSecondary">
          {w.moderatorNote(item.rejectReason)}
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

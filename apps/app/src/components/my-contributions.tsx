import Ionicons from "@expo/vector-icons/Ionicons";
import type { Contribution, ContributionKind, ContributionStatus } from "@vagabonds/contracts";
import { fontFamily, radius, spacing, Text, touchTarget, useTheme, type ThemeRole } from "@vagabonds/ui";
import { Link } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { useCommunity, useMyContributions, useSearchableAssets } from "@/data";
import { useLang, useMessages } from "@/i18n";
import { formatDate } from "@/lib/format-date";

type IconName = ComponentProps<typeof Ionicons>["name"];

const statusColors: Record<ContributionStatus, ThemeRole> = {
  pending: "highlight",
  approved: "success",
  rejected: "warning",
};

const kindIcons: Record<ContributionKind, IconName> = {
  tip: "bulb-outline",
  memory: "heart-outline",
  correction: "create-outline",
  photo: "camera-outline",
};

/**
 * Profil · Bıraktığım Notlar (module 6): the notes the visitor sent and what the moderators
 * decided, each a card of its own: the site, where the note stands, the note, its kind and day.
 * `title` null leaves the heading to the page's own header.
 */
export function MyContributions({ title }: { title?: string | null }) {
  const w = useMessages().notes;
  const heading = title === undefined ? w.title : title;
  const { colors: c } = useTheme();
  const { user, assetNames } = useCommunity();
  const mine = useMyContributions();
  const items = mine.status === "success" ? (mine.data ?? []) : [];
  // Notes sent from another device have no name kept here: the sites' list names them.
  const unnamed = items.some((item) => assetNames[item.assetId] === undefined);
  const assets = useSearchableAssets(unnamed);
  const nameOf = (id: string) =>
    assetNames[id] ?? (assets.status === "success" ? assets.data?.find((asset) => asset.id === id)?.name : undefined) ?? w.site;
  const pending = items.filter((item) => item.status === "pending").length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.flex}>
          {heading && (
            <Text variant="title" headingLevel={1}>
              {heading}
            </Text>
          )}
          {items.length > 0 && (
            <Text variant="caption" color="textSecondary">
              {w.count(items.length, pending)}
            </Text>
          )}
        </View>
        {user && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={w.refreshLabel}
            onPress={mine.retry}
            hitSlop={4}
            style={({ pressed }) => [styles.refresh, { borderColor: c.border }, pressed && { backgroundColor: c.surfaceRaised }]}
          >
            <Ionicons name="refresh" size={16} color={c.primary} aria-hidden />
            <Text variant="label" color="primary" style={styles.refreshText}>
              {w.refresh}
            </Text>
          </Pressable>
        )}
      </View>

      {mine.status === "loading" && <ActivityIndicator color={c.textSecondary} accessibilityLabel={w.loading} style={styles.loading} />}
      {mine.status === "error" && (
        <Text variant="caption" color="textSecondary">
          {mine.error.message}
        </Text>
      )}
      {mine.status === "success" && items.length === 0 && (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={28} color={c.highlightMark} aria-hidden />
          <Text color="textSecondary" style={styles.emptyText}>
            {w.empty}
          </Text>
        </View>
      )}
      {items.length > 0 && (
        <View accessibilityRole="list" style={styles.list}>
          {items.map((item) => (
            <ContributionRow key={item.id} item={item} name={nameOf(item.assetId)} />
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
  const tone = c[statusColors[item.status]];

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.rowHeader}>
        <View style={styles.site}>
          <Link href={{ pathname: "/asset/[id]", params: { id: item.assetId } }}>
            <Text variant="label" color="primary" numberOfLines={2}>
              {name}
            </Text>
          </Link>
        </View>
        <View style={[styles.status, { borderColor: tone }]}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text variant="caption" colorValue={tone} style={styles.statusText}>
            {w.statuses[item.status]}
          </Text>
        </View>
      </View>
      <Text numberOfLines={4}>{item.body}</Text>
      <View style={[styles.foot, { borderTopColor: c.border }]}>
        <Ionicons name={kindIcons[item.kind]} size={14} color={c.textSecondary} aria-hidden />
        <Text variant="caption" color="textSecondary">
          {`${w.kinds[item.kind]} · ${formatDate(item.createdAt, lang)}`}
        </Text>
      </View>
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
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  refresh: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  refreshText: {
    fontSize: 14,
  },
  loading: {
    marginTop: spacing.lg,
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    textAlign: "center",
  },
  list: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  site: {
    flex: 1,
    minWidth: 0,
  },
  status: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

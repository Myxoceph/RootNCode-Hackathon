import Ionicons from "@expo/vector-icons/Ionicons";
import type { MyAchievementsResponse } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCommunity, useMyAchievements } from "@/data";

type Badge = MyAchievementsResponse["items"][number];

/**
 * Profil · Rozetlerim: the points earned and every badge, earned ones first in gold, the rest
 * dimmed with how far along they are. Without a session they all wait to be earned.
 */
export default function MyBadgesScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useCommunity();
  const badges = useMyAchievements();
  const data = badges.status === "success" ? badges.data : null;
  const items = data ? [...data.items].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt))) : [];
  const earned = items.filter((item) => item.earnedAt).length;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Head>
        <title>Rozetlerim · Vagabonds</title>
      </Head>

      {/* Night blue and gold in both themes, as the seal it is earned with. */}
      <View style={styles.summary} accessible accessibilityLabel={`${data?.totalPoints ?? 0} puan, ${earned} rozet, ${data?.visits ?? 0} ziyaret`}>
        <Stat value={data?.totalPoints ?? 0} label="Puan" big />
        <View style={styles.divider} />
        <Stat value={earned} label="Rozet" />
        <View style={styles.divider} />
        <Stat value={data?.visits ?? 0} label="Ziyaret" />
      </View>
      {!user && (
        <Text variant="caption" color="textSecondary" style={styles.centered}>
          Ziyaret Mührü ya da not bırakınca rozet kazanmaya başlarsın.
        </Text>
      )}

      {badges.status === "loading" && <ActivityIndicator color={c.textSecondary} accessibilityLabel="Rozetler yükleniyor" />}
      {badges.status === "error" && (
        <Pressable accessibilityRole="button" onPress={badges.retry} style={styles.error}>
          <Text variant="caption" color="textSecondary" style={styles.centered}>
            {`${badges.error.message} Tekrar denemek için dokun.`}
          </Text>
        </Pressable>
      )}
      {badges.status === "success" && data === null && (
        <Text color="textSecondary" style={styles.centered}>
          Rozetler için sunucu gerekiyor; bu sürüm örnek veriyle çalışıyor.
        </Text>
      )}

      <View accessibilityRole="list" style={styles.grid}>
        {items.map((item) => (
          <BadgeCard key={item.code} item={item} />
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ value, label, big = false }: { value: number; label: string; big?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text colorValue={big ? palette.altin200 : palette.gece50} style={big ? styles.statBig : styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" colorValue={palette.gece300}>
        {label}
      </Text>
    </View>
  );
}

function BadgeCard({ item }: { item: Badge }) {
  const { colors: c } = useTheme();
  const earned = item.earnedAt !== null;
  const share = Math.min(1, item.progress.current / item.progress.target);
  const state = earned ? "kazanıldı" : item.progress.current > 0 ? `${item.progress.current}/${item.progress.target}` : "henüz kazanılmadı";
  return (
    <View
      style={[styles.badge, { backgroundColor: c.surface, borderColor: earned ? c.highlightMark : "transparent" }]}
      accessible
      accessibilityLabel={`${item.title}, ${item.points} puan, ${state}. ${item.description}`}
    >
      <View style={[styles.medal, { backgroundColor: earned ? "rgba(221, 181, 92, 0.18)" : c.surfaceRaised }]}>
        <Text style={[styles.emoji, !earned && styles.locked]}>{item.badge}</Text>
        {!earned && (
          <View style={[styles.lock, { backgroundColor: c.surface }]}>
            <Ionicons name="lock-closed" size={11} color={c.textSecondary} />
          </View>
        )}
      </View>
      <Text variant="label" numberOfLines={2} style={styles.badgeTitle}>
        {item.title}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={3} style={styles.badgeText}>
        {item.description}
      </Text>
      {earned ? (
        <Text variant="caption" colorValue={c.highlight} style={styles.points}>
          {`+${item.points} puan`}
        </Text>
      ) : (
        <View style={styles.progressRow}>
          <View style={[styles.track, { backgroundColor: c.surfaceRaised }]}>
            <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: c.highlightMark }]} />
          </View>
          <Text variant="caption" color="textSecondary">
            {item.progress.current > 0 ? `${item.progress.current}/${item.progress.target}` : `${item.points} p`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    borderRadius: radius.xl + spacing.xs,
    backgroundColor: palette.gece925,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
  },
  // Sans figures: the display face draws its zero as a ring.
  statBig: {
    fontFamily: fontFamily.sansBold,
    fontSize: 32,
    lineHeight: 40,
  },
  statValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 24,
    lineHeight: 40,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  error: {
    padding: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  badge: {
    flexBasis: "40%",
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
  },
  medal: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  locked: {
    opacity: 0.35,
  },
  lock: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTitle: {
    fontFamily: fontFamily.sansSemiBold,
  },
  badgeText: {
    flexGrow: 1,
  },
  points: {
    fontFamily: fontFamily.sansSemiBold,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});

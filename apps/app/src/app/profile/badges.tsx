import Ionicons from "@expo/vector-icons/Ionicons";
import type { MyAchievementsResponse } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { BadgeArt, hasBadgeArt } from "@/components/badge-art";
import { useCommunity, useMyAchievements } from "@/data";
import { bottomInset } from "@/lib/bottom-inset";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Badge = MyAchievementsResponse["items"][number];

const MEDAL = 84;
const goldFaint = "rgba(231, 194, 106, 0.28)";

/**
 * Profil · Rozetlerim as a medal collection: the share earned as a gold ring on the passport's
 * green leather, then every badge as a medal, earned ones struck in gold, the rest matte with a
 * ring for how far along they are. A medal opens its story and progress in a sheet.
 */
export default function MyBadgesScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useCommunity();
  const badges = useMyAchievements();
  const data = badges.status === "success" ? badges.data : null;
  const items = data ? [...data.items].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt))) : [];
  const earnedItems = items.filter((item) => item.earnedAt);
  const lockedItems = items.filter((item) => !item.earnedAt);
  const [open, setOpen] = useState<Badge | null>(null);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset(insets.bottom) + spacing.xl }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Head>
        <title>Rozetlerim · Vagabonds</title>
      </Head>

      <Collection earned={earnedItems.length} total={items.length} points={data?.totalPoints ?? 0} visits={data?.visits ?? 0} />
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

      {earnedItems.length > 0 && <Shelf title="Kazandıkların" items={earnedItems} onOpen={setOpen} />}
      {lockedItems.length > 0 && <Shelf title="Seni bekleyenler" items={lockedItems} onOpen={setOpen} offset={earnedItems.length} />}

      <BadgeSheet badge={open} onClose={() => setOpen(null)} />
    </ScrollView>
  );
}

/**
 * The head of the page on the passport's green leather: the share of badges earned as a gold
 * ring, and the points and visits beside it.
 */
function Collection({ earned, total, points, visits }: { earned: number; total: number; points: number; visits: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ring = 112;
  const r = ring / 2 - 6;
  const length = 2 * Math.PI * r;
  const share = total > 0 ? earned / total : 0;

  return (
    <View
      style={styles.collection}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      accessible
      accessibilityLabel={`${total} rozetten ${earned} tanesi kazanıldı. ${points} puan, ${visits} ziyaret`}
    >
      {size.width > 0 && (
        <Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height} style={StyleSheet.absoluteFill} aria-hidden>
          <Defs>
            <LinearGradient id="col-leather" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#08433F" />
              <Stop offset="0.55" stopColor="#063632" />
              <Stop offset="1" stopColor="#031F1D" />
            </LinearGradient>
            <RadialGradient id="col-light" cx="20%" cy="0%" r="80%">
              <Stop offset="0" stopColor={palette.firuze300} stopOpacity={0.16} />
              <Stop offset="1" stopColor={palette.firuze300} stopOpacity={0} />
            </RadialGradient>
            <Pattern id="col-grain" width={11} height={13} patternUnits="userSpaceOnUse">
              <Circle cx={1.2} cy={2.1} r={0.5} fill="#FFFFFF" fillOpacity={0.028} />
              <Circle cx={6.7} cy={0.8} r={0.6} fill="#000000" fillOpacity={0.12} />
              <Circle cx={3.8} cy={7.6} r={0.65} fill="#000000" fillOpacity={0.1} />
              <Circle cx={8.1} cy={10.9} r={0.5} fill="#FFFFFF" fillOpacity={0.025} />
            </Pattern>
          </Defs>
          <Rect width={size.width} height={size.height} fill="url(#col-leather)" />
          <Rect width={size.width} height={size.height} fill="url(#col-light)" />
          <Rect width={size.width} height={size.height} fill="url(#col-grain)" />
          <Rect x={7} y={7} width={size.width - 14} height={size.height - 14} rx={19} stroke="#FFFFFF" strokeOpacity={0.16} strokeDasharray="5 4" fill="none" />
        </Svg>
      )}

      <View style={{ width: ring, height: ring }}>
        <Svg width={ring} height={ring} aria-hidden>
          <Defs>
            <Foil id="col-foil" />
          </Defs>
          <Circle cx={ring / 2} cy={ring / 2} r={r} stroke="#FFFFFF" strokeOpacity={0.1} strokeWidth={8} fill="none" />
          {share > 0 && (
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              stroke="url(#col-foil)"
              strokeWidth={8}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${share * length} ${length}`}
              transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
            />
          )}
        </Svg>
        <View style={styles.ringCenter}>
          <Text colorValue={palette.altin200} style={styles.ringValue}>
            {earned}
          </Text>
          <Text colorValue={palette.gece300} style={styles.ringTotal}>
            {`/ ${total}`}
          </Text>
        </View>
      </View>

      <View style={styles.collectionText}>
        <Text colorValue={palette.altin200} style={styles.overline}>
          ROZET KOLEKSİYONU
        </Text>
        <View style={styles.collectionStats}>
          <View>
            <Text colorValue={palette.gece50} style={styles.collectionValue}>
              {points}
            </Text>
            <Text colorValue={palette.gece300} style={styles.collectionLabel}>
              puan
            </Text>
          </View>
          <View>
            <Text colorValue={palette.gece50} style={styles.collectionValue}>
              {visits}
            </Text>
            <Text colorValue={palette.gece300} style={styles.collectionLabel}>
              ziyaret
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** A titled row of medals; `offset` staggers their entrance after the shelf above. */
function Shelf({ title, items, onOpen, offset = 0 }: { title: string; items: Badge[]; onOpen: (badge: Badge) => void; offset?: number }) {
  return (
    <View style={styles.shelf}>
      <Text variant="overline" color="textSecondary" style={styles.shelfTitle}>
        {`${title.toLocaleUpperCase("tr")} · ${items.length}`}
      </Text>
      <View accessibilityRole="list" style={styles.grid}>
        {items.map((item, i) => (
          <MedalCell key={item.code} badge={item} index={offset + i} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
}

/** One medal with its name; it pops in a moment after the one before it. */
function MedalCell({ badge, index, onOpen }: { badge: Badge; index: number; onOpen: (badge: Badge) => void }) {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const earned = badge.earnedAt !== null;

  useEffect(() => {
    if (reduced) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, { toValue: 1, delay: Math.min(index, 18) * 45, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [index, pop, reduced]);

  const state = earned ? "kazanıldı" : `${badge.progress.current}/${badge.progress.target}`;
  return (
    <Animated.View style={[styles.cell, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${badge.title}, ${state}`}
        accessibilityHint="Rozetin ayrıntısını açar"
        onPress={() => onOpen(badge)}
        style={({ pressed }) => [styles.cellInner, pressed && styles.pressed]}
      >
        <Medal badge={badge} size={MEDAL} />
        <Text variant="caption" style={styles.cellTitle} numberOfLines={2}>
          {badge.title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Gold foil, light to deep and back, as on the passport. */
function Foil({ id }: { id: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor="#F6DE9C" />
      <Stop offset="0.45" stopColor={palette.altin600} />
      <Stop offset="0.7" stopColor={palette.altin200} />
      <Stop offset="1" stopColor={palette.altin700} />
    </LinearGradient>
  );
}

/**
 * A badge as a medal. With illustrated art (assets/badges): the drawing inside a foil rim when
 * earned; when not yet, the drawing in grey, a lock, and a thin gold arc for the progress.
 * Without art: a gold coin with the emoji struck in it, or a matte disc with the emoji faded.
 */
function Medal({ badge, size }: { badge: Badge; size: number }) {
  const { colors: c, scheme } = useTheme();
  const dark = scheme === "dark";
  const earned = badge.earnedAt !== null;
  const share = Math.min(1, badge.progress.current / badge.progress.target);
  const mid = size / 2;
  const arc = mid - 2;
  const disc = mid - 9;
  const length = 2 * Math.PI * arc;
  const id = `m-${badge.code}-${size}`;
  const art = hasBadgeArt(badge.code);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} aria-hidden>
        <Defs>
          <Foil id={`${id}-foil`} />
          <RadialGradient id={`${id}-coin`} cx="35%" cy="30%" r="75%">
            <Stop offset="0" stopColor="#FBE7B0" />
            <Stop offset="0.55" stopColor={palette.altin200} />
            <Stop offset="1" stopColor={palette.altin600} />
          </RadialGradient>
        </Defs>
        {earned ? (
          <>
            <Circle cx={mid} cy={mid} r={arc} stroke={`url(#${id}-foil)`} strokeWidth={2} fill="none" />
            {!art && (
              <>
                <Circle cx={mid} cy={mid} r={disc} fill={`url(#${id}-coin)`} />
                <Circle cx={mid} cy={mid} r={disc - 4} stroke={palette.altin700} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="1.5 2.5" fill="none" />
              </>
            )}
          </>
        ) : (
          <>
            <Circle cx={mid} cy={mid} r={arc} stroke={c.border} strokeWidth={2} fill="none" />
            {share > 0 && (
              <Circle
                cx={mid}
                cy={mid}
                r={arc}
                stroke={`url(#${id}-foil)`}
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${share * length} ${length}`}
                transform={`rotate(-90 ${mid} ${mid})`}
              />
            )}
            {!art && (
              <>
                <Circle cx={mid} cy={mid} r={disc} fill={dark ? palette.gece800 : palette.white} />
                <Circle cx={mid} cy={mid} r={disc} fill={palette.altin200} fillOpacity={dark ? 0.06 : 0.14} />
                <Circle cx={mid} cy={mid} r={disc - 4} stroke={c.textSecondary} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="1.5 2.5" fill="none" />
              </>
            )}
          </>
        )}
      </Svg>
      <View style={styles.medalFace}>
        {art ? (
          // Up to the rim: the arc is drawn at `mid - 2` with a 2 px stroke, so its inside is `mid - 3`.
          <BadgeArt code={badge.code} emoji={badge.badge} size={size - 6} earned={earned} />
        ) : (
          <Text style={[{ fontSize: size * 0.36, lineHeight: size * 0.44 }, !earned && styles.faded]}>{badge.badge}</Text>
        )}
      </View>
      {!earned && (
        <View style={[styles.lock, { backgroundColor: c.surface, borderColor: c.background }]}>
          <Ionicons name="lock-closed" size={11} color={c.textSecondary} />
        </View>
      )}
    </View>
  );
}

/** A medal's story: the big medal, its name, what it asks, and the points or how far along. */
function BadgeSheet({ badge, onClose }: { badge: Badge | null; onClose: () => void }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  // Kept while the sheet slides away, so it does not empty before it is gone.
  const [shown, setShown] = useState<Badge | null>(badge);
  useEffect(() => {
    if (badge) setShown(badge);
  }, [badge]);
  if (!shown) return null;

  const earned = shown.earnedAt !== null;
  const { current, target } = shown.progress;
  return (
    <Modal visible={badge !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <Medal badge={shown} size={136} />
        <Text variant="heading" headingLevel={2} style={styles.sheetTitle}>
          {shown.title}
        </Text>
        <Text color="textSecondary" style={styles.centered}>
          {shown.description}
        </Text>
        {earned ? (
          <View style={styles.earnedChip}>
            <Ionicons name="sparkles" size={14} color={palette.white} />
            <Text variant="label" colorValue={palette.white} style={styles.chipText}>
              {`Kazanıldı · +${shown.points} puan`}
            </Text>
          </View>
        ) : (
          <View style={styles.sheetProgress}>
            <View style={[styles.track, { backgroundColor: c.surfaceRaised }]}>
              <View style={[styles.fill, { width: `${Math.min(1, current / target) * 100}%` }]} />
            </View>
            <Text variant="caption" color="textSecondary">
              {`${current}/${target} · kazanınca +${shown.points} puan`}
            </Text>
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.close, { borderColor: c.border }, pressed && styles.pressed]}>
          <Text variant="label" style={styles.chipText}>
            Tamam
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.75,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  error: {
    padding: spacing.md,
  },
  collection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    padding: spacing.xl,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: goldFaint,
    backgroundColor: "#063632",
    overflow: "hidden",
  },
  ringCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  // Sans figures: the display face draws its zero as a ring.
  ringValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 34,
    lineHeight: 38,
  },
  ringTotal: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  collectionText: {
    flex: 1,
    gap: spacing.md,
  },
  overline: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2.5,
  },
  collectionStats: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  collectionValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 24,
    lineHeight: 30,
  },
  collectionLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  shelf: {
    gap: spacing.md,
  },
  shelfTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.lg,
  },
  cell: {
    width: "33.33%",
  },
  cellInner: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  cellTitle: {
    fontFamily: fontFamily.sansSemiBold,
    textAlign: "center",
  },
  medalFace: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  faded: {
    opacity: 0.4,
  },
  lock: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(6, 8, 13, 0.45)",
  },
  sheet: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fontFamily.display,
    textAlign: "center",
  },
  earnedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: palette.altin700,
  },
  chipText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  sheetProgress: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.sm,
  },
  track: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: palette.altin600,
  },
  close: {
    alignSelf: "stretch",
    height: 48,
    marginTop: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

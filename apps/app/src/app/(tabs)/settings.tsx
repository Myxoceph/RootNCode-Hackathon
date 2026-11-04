import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { avatarUri, logout, refreshMe, useCommunity, useMyAchievements, useMyContributions } from "@/data";
import { announce } from "@/lib/announce";
import { useSavedRoutes } from "@/lib/saved-routes";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type IconName = ComponentProps<typeof Ionicons>["name"];

const goldFaint = "rgba(231, 194, 106, 0.28)";
/** The portrait on the back of the passport. */
const PHOTO_W = 104;
const PHOTO_H = 132;
/** The eight-pointed Seljuk star: two squares, one turned 45°, on a 100 × 100 box. */
const STAR_SQUARE = "M22 22 H78 V78 H22 Z";

/**
 * Profil: the visitor's passport (name, account, points, badges and visits) and five sections as
 * one list, each row to its own page: Kaydettiklerim, Mühürlenen eserler, Rozetlerim, Bıraktığım Notlar and Sistem ayarları
 * (module 8). The passport is firuze green and gold in both themes.
 */
export default function SettingsScreen() {
  const { colors: c, scheme } = useTheme();
  const { user } = useCommunity();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const signedIn = Boolean(user?.username);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Head>
        <title>Profil · Vagabonds</title>
      </Head>

      <View style={[styles.column, { paddingTop: insets.top + spacing.md }]}>
        <Text headingLevel={1} style={styles.pageTitle}>
          Profil
        </Text>

        {user !== undefined && !signedIn && <Join />}
        <Passport />
        <Sections />

        {signedIn && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Bu cihazdaki oturumu kapatır"
            onPress={() => {
              void logout().then(() => announce("Çıkış yapıldı."));
            }}
            style={({ pressed }) => [styles.signOut, pressed && { backgroundColor: c.surfaceRaised }]}
          >
            <Ionicons name="log-out-outline" size={18} color={c.warning} />
            <Text variant="label" color="warning">
              Çıkış yap
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

/**
 * The visitor's passport as its cover: firuze-green leather, stitched at the edge, a gold-foil
 * frame and emblem, the Seljuk star blind-stamped large, and only the name and three numbers.
 */
/** Whether the passport has shown it can be turned this run (see `Passport`). */
let peeked = false;

function Passport() {
  const { user } = useCommunity();
  // The photo's path is signed for a day: a fresh one each time the card is shown.
  const accountId = user?.username ? user.id : null;
  useEffect(() => {
    if (accountId) refreshMe().catch(() => undefined);
  }, [accountId]);
  const badges = useMyAchievements();
  const data = badges.status === "success" ? badges.data : null;
  const signedIn = Boolean(user?.username);
  const name = user?.nickname ?? "Gezgin";
  const points = data?.totalPoints ?? 0;
  const earned = data ? data.items.filter((item) => item.earnedAt).length : 0;
  const visits = data?.visits ?? 0;
  const account = signedIn ? `@${user!.username}` : "Misafir gezgin";
  // The visitor's own photo and full name; without them the back shows the initial and the nickname.
  const holder = { photoUrl: avatarUri(user), fullName: user?.fullName ?? null };
  const fullName = holder.fullName ?? name;

  // The cover is drawn at the card's measured size.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;

  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    if (reduced) turn.setValue(next ? 1 : 0);
    else Animated.spring(turn, { toValue: next ? 1 : 0, friction: 9, tension: 40, useNativeDriver: true }).start();
  };

  // Once per app run, the card turns a little and back, so it shows it can be turned.
  useEffect(() => {
    if (reduced || peeked) return;
    peeked = true;
    Animated.sequence([
      Animated.delay(900),
      Animated.timing(turn, { toValue: 0.12, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(turn, { toValue: 0, friction: 5, tension: 60, useNativeDriver: true }),
    ]).start();
  }, [reduced, turn]);

  const front = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const back = turn.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  const lift = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.96, 1] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        flipped
          ? `Gezgin pasaportunun arkası. ${fullName}, ${account}`
          : `Gezgin pasaportu. ${name}, ${account}. ${points} puan, ${earned} rozet, ${visits} ziyaret`
      }
      accessibilityHint="Kartı çevirir"
      onPress={flip}
    >
      <Animated.View style={[styles.passportShadow, { transform: [{ scale: lift }] }]}>
        <Animated.View
          style={[styles.passport, styles.face, { transform: [{ perspective: 1200 }, { rotateY: front }] }]}
          onLayout={(e) => setSize(e.nativeEvent.layout)}
          pointerEvents={flipped ? "none" : "auto"}
        >
          <Cover width={size.width} height={size.height} />
          <Sheen width={size.width} height={size.height} />

          <View style={styles.coverHead}>
            <Emblem size={34} />
            <View style={styles.flex}>
              <Text colorValue={palette.altin200} style={styles.coverTitle}>
                GEZGİN PASAPORTU
              </Text>
              <Text colorValue={palette.gece300} style={styles.coverIssuer}>
                Vakıf Mirası
              </Text>
            </View>
            <FlipHint />
          </View>

          <View style={styles.holder}>
            <Text colorValue={palette.gece50} style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
              {name}
            </Text>
            <Text colorValue={palette.gece300} style={styles.account} numberOfLines={1}>
              {account}
            </Text>
          </View>

          <View style={styles.stats}>
            <Stat value={points} label="puan" gold />
            <Stat value={earned} label="rozet" />
            <Stat value={visits} label="ziyaret" />
          </View>
        </Animated.View>

        <Animated.View
          style={[styles.passport, styles.face, styles.backFace, { transform: [{ perspective: 1200 }, { rotateY: back }] }]}
          pointerEvents={flipped ? "auto" : "none"}
        >
          <Cover width={size.width} height={size.height} />
          <View style={styles.backBody}>
            <View style={styles.photo}>
              <Svg width={PHOTO_W} height={PHOTO_H} style={StyleSheet.absoluteFill} aria-hidden>
                <Defs>
                  <FoilGradient id="photo-foil" />
                </Defs>
                <Rect x={0.75} y={0.75} width={PHOTO_W - 1.5} height={PHOTO_H - 1.5} rx={14} stroke="url(#photo-foil)" strokeWidth={1.5} fill="none" />
              </Svg>
              {holder.photoUrl ? (
                <Image source={{ uri: holder.photoUrl }} style={styles.photoImage} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : user ? (
                <Text colorValue={palette.altin200} style={styles.photoInitial} aria-hidden>
                  {fullName.charAt(0).toLocaleUpperCase("tr")}
                </Text>
              ) : (
                <Ionicons name="person" size={44} color={palette.altin200} aria-hidden />
              )}
            </View>
            <View style={[styles.flex, styles.backFields]}>
              <View>
                <Text colorValue={palette.altin200} style={styles.backLabel}>
                  AD SOYAD
                </Text>
                <Text colorValue={palette.gece50} style={styles.backName} numberOfLines={2} adjustsFontSizeToFit>
                  {fullName}
                </Text>
              </View>
              <View>
                <Text colorValue={palette.altin200} style={styles.backLabel}>
                  KULLANICI
                </Text>
                <Text colorValue={palette.gece100} style={styles.account} numberOfLines={1}>
                  {account}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.backTurn}>
            <FlipHint />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** The "Çevir" tag on both faces: the card is something to tap. */
function FlipHint() {
  return (
    <View style={styles.flipHint} aria-hidden>
      <Ionicons name="sync-outline" size={13} color={palette.altin200} />
      <Text colorValue={palette.altin200} style={styles.flipHintText}>
        Çevir
      </Text>
    </View>
  );
}

function Stat({ value, label, gold = false }: { value: number; label: string; gold?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text colorValue={gold ? palette.altin200 : palette.gece50} style={styles.statValue}>
        {value}
      </Text>
      <Text colorValue={palette.gece300} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

/** Gold foil: light, deep and light again across the stroke. */
function FoilGradient({ id }: { id: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor="#F6DE9C" />
      <Stop offset="0.45" stopColor={palette.altin600} />
      <Stop offset="0.7" stopColor={palette.altin200} />
      <Stop offset="1" stopColor={palette.altin700} />
    </LinearGradient>
  );
}

/** The emblem in gold foil: the Seljuk star in a ring. */
function Emblem({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <Defs>
        <FoilGradient id="emblem-foil" />
      </Defs>
      <Circle cx={50} cy={50} r={47} stroke="url(#emblem-foil)" strokeWidth={3} fill="none" />
      <G stroke="url(#emblem-foil)" strokeWidth={3.5} fill="none">
        <Path d={STAR_SQUARE} />
        <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
      </G>
      <Circle cx={50} cy={50} r={9} fill="url(#emblem-foil)" />
    </Svg>
  );
}

/**
 * The cover: leather (a deep gradient under a fine grain), stitching along the edge, a thin
 * gold-foil frame inside it, and the star blind-stamped large off the right edge.
 */
function Cover({ width, height }: { width: number; height: number }) {
  if (width === 0) return null;
  const star = height * 0.92;
  return (
    <View aria-hidden pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Keyed by size: on iOS a gradient keeps the size it was first drawn at. */}
      <Svg key={`${width}x${height}`} width={width} height={height}>
        <Defs>
          <LinearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
            {/* Deep firuze: light enough to read as green, dark enough for the light text on it. */}
            <Stop offset="0" stopColor="#08433F" />
            <Stop offset="0.55" stopColor="#063632" />
            <Stop offset="1" stopColor="#031F1D" />
          </LinearGradient>
          <RadialGradient id="leather-light" cx="18%" cy="0%" r="80%">
            <Stop offset="0" stopColor={palette.firuze300} stopOpacity={0.16} />
            <Stop offset="1" stopColor={palette.firuze300} stopOpacity={0} />
          </RadialGradient>
          {/* Scattered, not on a grid, so it reads as leather and not as dotted paper. */}
          <Pattern id="grain" width={11} height={13} patternUnits="userSpaceOnUse">
            <Circle cx={1.2} cy={2.1} r={0.5} fill="#FFFFFF" fillOpacity={0.028} />
            <Circle cx={6.7} cy={0.8} r={0.6} fill="#000000" fillOpacity={0.12} />
            <Circle cx={9.4} cy={5.3} r={0.45} fill="#FFFFFF" fillOpacity={0.022} />
            <Circle cx={3.8} cy={7.6} r={0.65} fill="#000000" fillOpacity={0.1} />
            <Circle cx={8.1} cy={10.9} r={0.5} fill="#FFFFFF" fillOpacity={0.025} />
            <Circle cx={0.6} cy={11.7} r={0.55} fill="#000000" fillOpacity={0.12} />
            <Circle cx={5.2} cy={4.4} r={0.4} fill="#000000" fillOpacity={0.08} />
          </Pattern>
          <FoilGradient id="frame-foil" />
        </Defs>
        <Rect width={width} height={height} fill="url(#leather)" />
        <Rect width={width} height={height} fill="url(#leather-light)" />
        <Rect width={width} height={height} fill="url(#grain)" />
        {/* Blind stamp: a shade darker below, a hair lighter above, like pressed leather. */}
        <G transform={`translate(${width - star * 0.68} ${(height - star) / 2}) scale(${star / 100})`} fill="none" strokeWidth={0.45}>
          <G stroke="#000000" strokeOpacity={0.4} transform="translate(0 0.35)">
            <Circle cx={50} cy={50} r={47} />
            <Path d={STAR_SQUARE} />
            <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
          </G>
          <G stroke={palette.altin200} strokeOpacity={0.14}>
            <Circle cx={50} cy={50} r={47} />
            <Circle cx={50} cy={50} r={40} strokeDasharray="1 2.5" />
            <Path d={STAR_SQUARE} />
            <Path d={STAR_SQUARE} transform="rotate(45 50 50)" />
            <Circle cx={50} cy={50} r={11} />
          </G>
        </G>
        <Rect x={7} y={7} width={width - 14} height={height - 14} rx={19} stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={1} strokeDasharray="5 4" fill="none" />
        <Rect x={14} y={14} width={width - 28} height={height - 28} rx={13} stroke="url(#frame-foil)" strokeOpacity={0.55} strokeWidth={0.8} fill="none" />
      </Svg>
    </View>
  );
}

/** Light catching the cover: a soft band that crosses it now and then. Still with reduced motion. */
function Sheen({ width, height }: { width: number; height: number }) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || width === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(x, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(4800),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, width, x]);

  if (reduced || width === 0) return null;
  const band = 140;
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-band * 2, width + band] });
  return (
    <Animated.View
      aria-hidden
      pointerEvents="none"
      style={[styles.sheen, { width: band, height: height * 2, top: -height / 2, transform: [{ translateX }, { rotate: "18deg" }] }]}
    >
      <Svg width={band} height="100%">
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#FFF4D6" stopOpacity={0.18} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={band} height="100%" fill="url(#sheen)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * For a visitor without an account, at the top of the page: one card with what an account keeps
 * and the way to sign up or in (`/auth`).
 */
function Join() {
  const { colors: c, scheme } = useTheme();
  const dark = scheme === "dark";
  const router = useRouter();
  return (
    <View style={[styles.join, { backgroundColor: c.surface, borderColor: dark ? goldFaint : c.border }]}>
      <View style={styles.joinHead}>
        <View style={[styles.joinIcon, { backgroundColor: dark ? "rgba(231, 194, 106, 0.16)" : "rgba(231, 194, 106, 0.24)" }]}>
          <Ionicons name="person-add" size={18} color={c.highlightMark} />
        </View>
        <View style={styles.flex}>
          <Text variant="label" style={styles.joinTitle}>
            Hesabını oluştur
          </Text>
          <Text variant="caption" color="textSecondary">
            Pasaportun, mühürlerin ve notların her cihazda seninle olsun.
          </Text>
        </View>
      </View>
      <View style={styles.joinActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/auth", params: { mode: "register" } })}
          style={({ pressed }) => [styles.joinButton, { backgroundColor: palette.altin700 }, pressed && styles.pressed]}
        >
          {/* Bronze in both themes; white on it is 5.8:1 (altin600 would fall short of 4.5:1). */}
          <Text variant="label" colorValue={palette.white} style={styles.joinButtonText}>
            Kayıt ol
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/auth", params: { mode: "login" } })}
          style={({ pressed }) => [styles.joinButton, { borderWidth: 1, borderColor: c.border }, pressed && styles.pressed]}
        >
          <Text variant="label" style={styles.joinButtonText}>
            Giriş yap
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const ROW_ICON = 32;

/**
 * The five sections as one grouped list: a gold icon in a gold-foil frame, the title, and how many
 * routes, sealed assets, badges or notes there are when that is known.
 */
function Sections() {
  const { colors: c, scheme } = useTheme();
  const dark = scheme === "dark";
  const router = useRouter();
  const routes = useSavedRoutes();
  const sealed = useUnlockedAssets();
  const badges = useMyAchievements();
  const notes = useMyContributions();
  const { user } = useCommunity();
  const badgeData = badges.status === "success" ? badges.data : null;
  const noteCount = notes.status === "success" && notes.data ? notes.data.length : null;

  const rows: Array<{ href: Href; icon: IconName; title: string; value: string | null }> = [
    { href: "/profile/routes", icon: "bookmark-outline", title: "Kaydettiklerim", value: routes.length > 0 ? String(routes.length) : null },
    { href: "/profile/sealed", icon: "shield-checkmark-outline", title: "Mühürlenen eserler", value: sealed.size > 0 ? String(sealed.size) : null },
    {
      href: "/profile/badges",
      icon: "ribbon-outline",
      title: "Rozetlerim",
      value: badgeData ? `${badgeData.items.filter((b) => b.earnedAt).length}/${badgeData.items.length}` : null,
    },
    { href: "/profile/notes", icon: "chatbubble-ellipses-outline", title: "Bıraktığım Notlar", value: noteCount ? String(noteCount) : null },
    { href: "/profile/settings", icon: "settings-outline", title: "Sistem ayarları", value: null },
    // Only moderators and admins: the panel the API lets them use.
    ...(user?.role === "admin" || user?.role === "moderator"
      ? [{ href: "/admin" as Href, icon: "shield-half-outline" as IconName, title: "Yönetim paneli", value: null }]
      : []),
  ];

  return (
    <View style={[styles.list, { backgroundColor: c.surface, borderColor: dark ? "transparent" : c.border }]}>
      {rows.map((row, i) => (
        <Pressable
          key={row.title}
          accessibilityRole="link"
          accessibilityLabel={row.value ? `${row.title}, ${row.value}` : row.title}
          onPress={() => router.push(row.href)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceRaised }]}
        >
          <View style={styles.rowIcon}>
            <Svg width={ROW_ICON} height={ROW_ICON} style={StyleSheet.absoluteFill} aria-hidden>
              <Defs>
                <FoilGradient id="row-foil" />
              </Defs>
              <Rect x={0.6} y={0.6} width={ROW_ICON - 1.2} height={ROW_ICON - 1.2} rx={8} stroke="url(#row-foil)" strokeWidth={1.2} fill="none" />
            </Svg>
            <Ionicons name={row.icon} size={17} color={c.highlightMark} />
          </View>
          <View style={[styles.rowBody, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {row.title}
            </Text>
            {row.value && (
              <Text color="textSecondary" style={styles.rowValue}>
                {row.value}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={17} color={c.textSecondary} aria-hidden />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  pageTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 42,
  },
  passportShadow: {
    borderRadius: 26,
    shadowColor: palette.gece1000,
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
  },
  passport: {
    justifyContent: "space-between",
    gap: spacing.xl,
    minHeight: 236,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: goldFaint,
    backgroundColor: "#063632",
    overflow: "hidden",
  },
  face: {
    backfaceVisibility: "hidden",
  },
  backFace: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
  },
  backBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  photo: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  photoImage: {
    width: PHOTO_W - 6,
    height: PHOTO_H - 6,
    borderRadius: 11,
  },
  photoInitial: {
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 60,
  },
  backFields: {
    gap: spacing.md,
  },
  backLabel: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 2,
  },
  backName: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
  },
  backTurn: {
    position: "absolute",
    top: spacing.xl,
    right: spacing.xl,
  },
  flipHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: goldFaint,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  flipHintText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  sheen: {
    position: "absolute",
    left: 0,
  },
  coverHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  coverTitle: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 3,
  },
  coverIssuer: {
    fontFamily: fontFamily.display,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1,
  },
  holder: {
    gap: 2,
  },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 38,
    lineHeight: 46,
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  account: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  stat: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
  },
  statValue: {
    fontFamily: fontFamily.sansBold,
    fontSize: 22,
    lineHeight: 28,
  },
  statLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  join: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  joinHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  joinIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  joinTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 16,
  },
  joinActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  joinButton: {
    flex: 1,
    height: touchTarget.min,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  joinButtonText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  list: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.lg,
  },
  rowIcon: {
    width: ROW_ICON,
    height: ROW_ICON,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingRight: spacing.lg,
  },
  rowTitle: {
    flex: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  rowValue: {
    fontSize: 15,
    lineHeight: 20,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min + 8,
    borderRadius: radius.xl,
  },
});

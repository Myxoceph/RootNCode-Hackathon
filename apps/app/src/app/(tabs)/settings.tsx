import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme } from "@vagabonds/ui";
import { useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { logout, useCommunity, useMyAchievements, useMyContributions } from "@/data";
import { announce } from "@/lib/announce";
import { useSavedRoutes } from "@/lib/saved-routes";

type IconName = ComponentProps<typeof Ionicons>["name"];

const GLOW_HEIGHT = 380;
const AVATAR = 96;
/** Gold, washed and as an edge: the same on night blue and on white. */
const goldWash = "rgba(221, 181, 92, 0.14)";
const goldEdge = "rgba(190, 150, 60, 0.6)";

/**
 * Profil: the visitor (or the way to an account) and four sections, each on its own page:
 * Rotalarım, Rozetlerim, Sistem ayarları (module 8) and Bıraktığım Notlar (module 6).
 * Night blue with soft light in dark mode, paper white with the same light, paler, in light mode.
 */
export default function SettingsScreen() {
  const { colors: c, scheme: shown } = useTheme();
  const dark = shown === "dark";
  const { user } = useCommunity();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const name = user?.nickname ?? "Gezgin";
  const signedIn = Boolean(user?.username);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Head>
        <title>Profil · Vagabonds</title>
      </Head>

      <Glow top={insets.top} dark={dark} page={c.background} />

      <View style={[styles.column, { paddingTop: insets.top + HALO_CENTER - AVATAR / 2 - 6 }]}>
        <View style={styles.hero}>
          <View style={[styles.ring, { borderColor: c.highlightMark, backgroundColor: c.background }]}>
            <View style={[styles.avatar, { backgroundColor: c.surfaceRaised }]}>
              {user ? (
                <Text colorValue={c.highlightMark} style={styles.initial} aria-hidden>
                  {name.charAt(0).toLocaleUpperCase("tr")}
                </Text>
              ) : (
                <Ionicons name="person" size={38} color={c.highlightMark} aria-hidden />
              )}
            </View>
          </View>
          <Text variant="overline" colorValue={c.highlight}>
            VAKIF MİRASI GEZGİNİ
          </Text>
          <Text headingLevel={1} style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {signedIn && (
            <Text variant="caption" color="textSecondary">
              @{user!.username}
            </Text>
          )}
        </View>

        {user !== undefined && !signedIn && <JoinCard dark={dark} />}

        <Menu />

        {signedIn && (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Bu cihazdaki oturumu kapatır"
            onPress={() => {
              void logout().then(() => announce("Çıkış yapıldı."));
            }}
            style={({ pressed }) => [styles.signOut, { backgroundColor: c.surface, borderColor: dark ? "transparent" : c.border }, pressed && styles.pressed]}
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
 * Profil's four sections as one card of rows, each opening its own page: Rotalarım, Rozetlerim,
 * Sistem ayarları and Bıraktığım Notlar. A row says what is in it at a glance (how many routes,
 * badges or notes) when that is known.
 */
function Menu() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const routes = useSavedRoutes();
  const badges = useMyAchievements();
  const notes = useMyContributions();
  const earned = badges.status === "success" && badges.data ? `${badges.data.items.filter((b) => b.earnedAt).length}/${badges.data.items.length}` : null;
  const noteCount = notes.status === "success" && notes.data ? String(notes.data.length) : null;

  const rows: Array<{ href: Href; icon: IconName; title: string; detail: string; value: string | null }> = [
    {
      href: "/profile/routes",
      icon: "map-outline",
      title: "Rotalarım",
      detail: "Kaydettiğin gezi rotaları",
      value: routes.length > 0 ? String(routes.length) : null,
    },
    { href: "/profile/badges", icon: "ribbon-outline", title: "Rozetlerim", detail: "Puanların ve rozetlerin", value: earned },
    { href: "/profile/settings", icon: "settings-outline", title: "Sistem ayarları", detail: "Tema ve erişilebilirlik", value: null },
    { href: "/profile/notes", icon: "chatbubble-ellipses-outline", title: "Bıraktığım Notlar", detail: "Notların ve onay durumları", value: noteCount },
  ];

  return (
    <View style={[styles.menu, { backgroundColor: c.surface }]}>
      {rows.map((row, i) => (
        <View key={row.title}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: c.border }]} />}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={row.value ? `${row.title}, ${row.value}` : row.title}
            accessibilityHint={row.detail}
            onPress={() => router.push(row.href)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceRaised }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: goldWash }]}>
              <Ionicons name={row.icon} size={20} color={c.highlightMark} />
            </View>
            <View style={styles.flex}>
              <Text variant="label" style={styles.rowTitle}>
                {row.title}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {row.detail}
              </Text>
            </View>
            {row.value && (
              <Text variant="label" color="textSecondary" style={styles.rowValue}>
                {row.value}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * For a visitor without an account: what one keeps, and the way to sign up or in (`/auth`). Gold
 * on the night blue in both themes, as the sign-in screen it opens.
 */
function JoinCard({ dark }: { dark: boolean }) {
  const router = useRouter();
  return (
    <View style={[styles.join, { borderColor: dark ? goldEdge : "transparent" }]}>
      <View style={styles.joinHead}>
        <View style={styles.joinIcon}>
          <Ionicons name="sparkles" size={18} color={palette.altin950} />
        </View>
        <View style={styles.flex}>
          <Text variant="label" colorValue={palette.gece50} style={styles.joinTitle}>
            Hesabını oluştur
          </Text>
          <Text variant="caption" colorValue={palette.gece300}>
            Mühürlerin, notların ve rozetlerin her cihazda seninle.
          </Text>
        </View>
      </View>
      <View style={styles.joinActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/auth", params: { mode: "register" } })}
          style={({ pressed }) => [styles.joinButton, { backgroundColor: palette.altin200 }, pressed && styles.pressed]}
        >
          <Text variant="label" colorValue={palette.altin950} style={styles.joinButtonText}>
            Kayıt ol
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/auth", params: { mode: "login" } })}
          style={({ pressed }) => [styles.joinButton, styles.joinOutline, pressed && styles.pressed]}
        >
          <Text variant="label" colorValue={palette.gece50} style={styles.joinButtonText}>
            Giriş yap
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Where the avatar's center sits, below the safe area. */
const HALO_CENTER = 120;

/**
 * The head of the page: soft light on the night blue instead of a picture. A gold glow behind
 * the avatar, cool blue and turquoise further off.
 */
function Glow({ top, dark, page }: { top: number; dark: boolean; page: string }) {
  const cy = top + HALO_CENTER;
  // On white the light is paler and warmer, and the blue gives way to a lighter one.
  const blue = dark ? palette.kobalt700 : palette.kobalt300;
  const sea = dark ? palette.firuze700 : palette.firuze300;
  return (
    <View aria-hidden pointerEvents="none" style={[styles.glow, { height: GLOW_HEIGHT + top }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow-gold" cx="50%" cy={cy} r="58%" gradientUnits="userSpaceOnUse" fx="50%" fy={cy}>
            <Stop offset="0" stopColor={palette.altin300} stopOpacity={dark ? 0.32 : 0.4} />
            <Stop offset="1" stopColor={palette.altin300} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glow-blue" cx="8%" cy={top + 10} r="70%" gradientUnits="userSpaceOnUse" fx="8%" fy={top + 10}>
            <Stop offset="0" stopColor={blue} stopOpacity={dark ? 0.55 : 0.3} />
            <Stop offset="1" stopColor={blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glow-sea" cx="100%" cy={cy + 90} r="55%" gradientUnits="userSpaceOnUse" fx="100%" fy={cy + 90}>
            <Stop offset="0" stopColor={sea} stopOpacity={dark ? 0.35 : 0.25} />
            <Stop offset="1" stopColor={sea} stopOpacity={0} />
          </RadialGradient>
          {/* The light ends in the page's own color, never on an edge. */}
          <LinearGradient id="glow-end" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.55" stopColor={page} stopOpacity={0} />
            <Stop offset="1" stopColor={page} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow-blue)" />
        <Rect width="100%" height="100%" fill="url(#glow-sea)" />
        <Rect width="100%" height="100%" fill="url(#glow-gold)" />
        <Rect width="100%" height="100%" fill="url(#glow-end)" />
      </Svg>
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
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  ring: {
    padding: 4,
    marginBottom: spacing.md,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 52,
  },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 48,
  },
  join: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl + spacing.xs,
    backgroundColor: palette.gece925,
    borderWidth: 1,
  },
  joinHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  joinIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.altin200,
  },
  joinTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
  },
  joinActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  joinButton: {
    flex: 1,
    height: touchTarget.min + 4,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  joinOutline: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  joinButtonText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: touchTarget.min + 8,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  menu: {
    borderRadius: radius.xl + spacing.xs,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 16,
  },
  rowValue: {
    fontFamily: fontFamily.sansSemiBold,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 42 + spacing.md,
  },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { usePathname, useRouter, type Href } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { fetchAdminSummary } from "@/data/admin";
import { login, logout, useCommunity } from "@/data";
import { useA11ySettings } from "@/settings/a11y-settings";

import { Avatar, Button, Empty, errorText, Field, useAdminColors, type IconName } from "./kit";
import { Panel, usePanel, type PanelContext, type PanelRole } from "./panel";

export { usePanel, type PanelRole };

/**
 * The admin panel's frame: one big rounded white frame on a soft backdrop, with the side bar (the
 * sections as pills, the signed-in person and the theme switch) and the page inside it. The side
 * bar folds to a rail of icons for more room, and stays so on this browser. Narrow screens get the
 * sections as a strip along the top instead.
 * Only moderators and admins get in; anyone else gets the sign-in screen.
 */

const SECTIONS: Array<{ href: Href; path: string; icon: IconName; label: string; adminOnly?: boolean; counted?: boolean }> = [
  { href: "/admin", path: "/admin", icon: "grid-outline", label: "Genel bakış" },
  { href: "/admin/review", path: "/admin/review", icon: "checkmark-done-outline", label: "İnceleme", counted: true },
  { href: "/admin/ranking", path: "/admin/ranking", icon: "trophy-outline", label: "Popüler eserler" },
  { href: "/admin/users", path: "/admin/users", icon: "people-outline", label: "Kullanıcılar" },
  { href: "/admin/assets", path: "/admin/assets", icon: "business-outline", label: "Eserler", adminOnly: true },
  { href: "/admin/achievements", path: "/admin/achievements", icon: "ribbon-outline", label: "Başarımlar", adminOnly: true },
  { href: "/admin/rewards", path: "/admin/rewards", icon: "gift-outline", label: "Ödüller", adminOnly: true },
];

const GOLD = palette.altin300;
const FOLDED_KEY = "vagabonds-admin-menu-folded";

/** Whether the side bar is folded, remembered on this browser when it can be. */
function useFolded() {
  const [folded, setFolded] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(FOLDED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setFolded((was) => {
      try {
        globalThis.localStorage?.setItem(FOLDED_KEY, was ? "0" : "1");
      } catch {}
      return !was;
    });
  return [folded, toggle] as const;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useCommunity();
  const a = useAdminColors();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [pending, setPending] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [folded, toggleFolded] = useFolded();
  const role = user?.role === "admin" || user?.role === "moderator" ? user.role : null;

  useEffect(() => {
    if (!role) return;
    let active = true;
    fetchAdminSummary().then(
      (summary) => active && setPending(summary.pending.notes + summary.pending.photos),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [role, round]);

  if (user === undefined) return <View style={[styles.fill, { backgroundColor: a.page }]} />;
  if (!user?.username || !role) return <SignIn signedInAs={user?.username ? user.nickname : null} />;

  const context: PanelContext = { role, pending, refreshPending: () => setRound((n) => n + 1) };
  return (
    <Panel.Provider value={context}>
      <View style={[styles.fill, { backgroundColor: wide ? a.page : a.frame, padding: wide ? 16 : 0 }]}>
        <View style={[styles.fill, wide && styles.frame, { flexDirection: wide ? "row" : "column", backgroundColor: a.frame }]}>
          {wide ? <SideBar name={user.nickname} username={user.username} role={role} pending={pending} folded={folded} onFold={toggleFolded} /> : <TopStrip role={role} pending={pending} />}
          <View style={styles.fill}>{children}</View>
        </View>
      </View>
    </Panel.Provider>
  );
}

function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="star" size={size * 0.46} color={palette.gece950} aria-hidden />
    </View>
  );
}

function useActive() {
  const pathname = usePathname();
  return (path: string) => (path === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(path));
}

function SideBar({ name, username, role, pending, folded, onFold }: { name: string; username: string; role: PanelRole; pending: number | null; folded: boolean; onFold: () => void }) {
  const router = useRouter();
  const active = useActive();
  const a = useAdminColors();
  const fold = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={folded ? "Menüyü aç" : "Menüyü gizle"}
      onPress={onFold}
      style={(state) => [styles.iconButton, (state as { hovered?: boolean }).hovered && { backgroundColor: a.hover }]}
    >
      <Ionicons name={folded ? "chevron-forward" : "chevron-back"} size={17} color={a.textSecondary} aria-hidden />
    </Pressable>
  );
  if (folded) {
    return (
      <View style={[styles.side, styles.rail]}>
        <BrandMark />
        {fold}
        <ScrollView style={{ flex: 1, alignSelf: "stretch" }} contentContainerStyle={{ gap: 4, paddingTop: 10, alignItems: "center" }}>
          {SECTIONS.filter((section) => role === "admin" || !section.adminOnly).map((section) => (
            <SideLink
              key={section.path}
              icon={section.icon}
              label={section.label}
              active={active(section.path)}
              count={section.counted ? pending : null}
              onPress={() => router.push(section.href)}
              folded
            />
          ))}
        </ScrollView>
        <Avatar name={name} size={40} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Çıkış yap"
          onPress={() => void logout()}
          style={(state) => [styles.iconButton, (state as { hovered?: boolean }).hovered && { backgroundColor: a.hover }]}
        >
          <Ionicons name="log-out-outline" size={18} color={a.textSecondary} aria-hidden />
        </Pressable>
        <ThemeSwitch folded />
      </View>
    );
  }
  return (
    <View style={styles.side}>
      <View style={styles.brand}>
        <BrandMark />
        <Text style={[styles.brandName, { flex: 1 }]}>Vakıfname</Text>
        {fold}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingTop: 22 }}>
        {SECTIONS.filter((section) => role === "admin" || !section.adminOnly).map((section) => (
          <SideLink
            key={section.path}
            icon={section.icon}
            label={section.label}
            active={active(section.path)}
            count={section.counted ? pending : null}
            onPress={() => router.push(section.href)}
          />
        ))}
      </ScrollView>
      <View style={{ gap: 14 }}>
        <View style={styles.me}>
          <Avatar name={name} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.meName} numberOfLines={1}>
              {name}
            </Text>
            <Text color="textSecondary" style={styles.meRole} numberOfLines={1}>
              @{username} · {role === "admin" ? "Admin" : "Moderatör"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Çıkış yap"
            onPress={() => void logout()}
            style={(state) => [styles.iconButton, (state as { hovered?: boolean }).hovered && { backgroundColor: a.hover }]}
          >
            <Ionicons name="log-out-outline" size={18} color={a.textSecondary} aria-hidden />
          </Pressable>
        </View>
        <ThemeSwitch />
      </View>
    </View>
  );
}

/** Light and Dark, as two halves of a pill; the picked half is dark. */
function ThemeSwitch({ folded }: { folded?: boolean }) {
  const a = useAdminColors();
  const { setThemePreference } = useA11ySettings();
  if (folded) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a.dark ? "Açık temaya geç" : "Koyu temaya geç"}
        onPress={() => setThemePreference(a.dark ? "light" : "dark")}
        style={[styles.themeOne, { backgroundColor: a.card }]}
      >
        <Ionicons name={a.dark ? "moon-outline" : "sunny-outline"} size={16} color={a.text} aria-hidden />
      </Pressable>
    );
  }
  const options = [
    { scheme: "light" as const, label: "Açık", icon: "sunny-outline" as IconName },
    { scheme: "dark" as const, label: "Koyu", icon: "moon-outline" as IconName },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Tema" style={[styles.theme, { backgroundColor: a.card }]}>
      {options.map((option) => {
        const on = (option.scheme === "dark") === a.dark;
        return (
          <Pressable
            key={option.scheme}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => setThemePreference(option.scheme)}
            style={[styles.themeHalf, on && { backgroundColor: a.ink }]}
          >
            <Ionicons name={option.icon} size={14} color={on ? a.onInk : a.textSecondary} aria-hidden />
            <Text colorValue={on ? a.onInk : a.textSecondary} style={styles.themeText}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SideLink({ icon, label, active, count, onPress, folded }: { icon: IconName; label: string; active: boolean; count?: number | null; onPress: () => void; folded?: boolean }) {
  const a = useAdminColors();
  if (folded) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        accessibilityLabel={count ? `${label}, ${count} bekleyen` : label}
        onPress={onPress}
        // @ts-expect-error: react-native-web shows the name on hover.
        title={label}
        style={(state) => [styles.railLink, active && { backgroundColor: a.accent }, !active && (state as { hovered?: boolean }).hovered && { backgroundColor: a.hover }]}
      >
        <Ionicons name={active ? (icon.replace("-outline", "") as IconName) : icon} size={19} color={active ? a.onAccent : a.text} aria-hidden />
        {!!count && <View style={[styles.railDot, { backgroundColor: active ? a.onAccent : a.accent, borderColor: a.frame }]} />}
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count ? `${label}, ${count} bekleyen` : label}
      onPress={onPress}
      style={(state) => [styles.link, active && { backgroundColor: a.accent }, !active && (state as { hovered?: boolean }).hovered && { backgroundColor: a.hover }]}
    >
      <Ionicons name={active ? (icon.replace("-outline", "") as IconName) : icon} size={18} color={active ? a.onAccent : a.text} aria-hidden />
      <Text colorValue={active ? a.onAccent : a.text} style={[styles.linkText, active && { fontFamily: fontFamily.sansSemiBold }]}>
        {label}
      </Text>
      {!!count && (
        <View style={[styles.count, { backgroundColor: active ? a.onAccent : a.accent }]}>
          <Text colorValue={active ? a.accent : a.onAccent} style={styles.countText}>
            {count}
          </Text>
        </View>
      )}
      {active && !count && <Ionicons name="chevron-forward" size={15} color={a.onAccent} aria-hidden />}
    </Pressable>
  );
}

function TopStrip({ role, pending }: { role: PanelRole; pending: number | null }) {
  const router = useRouter();
  const active = useActive();
  const a = useAdminColors();
  return (
    <View style={[styles.strip, { borderBottomColor: a.line }]}>
      <View style={styles.stripHead}>
        <View style={[styles.brand, { paddingVertical: 12 }]}>
          <BrandMark size={26} />
          <Text style={styles.brandName}>Vakıfname</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Çıkış yap" onPress={() => void logout()} style={styles.iconButton}>
          <Ionicons name="log-out-outline" size={19} color={a.textSecondary} aria-hidden />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 12, paddingBottom: 10 }}>
        {SECTIONS.filter((section) => role === "admin" || !section.adminOnly).map((section) => (
          <SideLink
            key={section.path}
            icon={section.icon}
            label={section.label}
            active={active(section.path)}
            count={section.counted ? pending : null}
            onPress={() => router.push(section.href)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The sign-in screen, split in two: the brand on a navy panel with a gold glow, and a plain form.
 * Someone signed in without the panel's role is told so and can sign in with another account.
 */
function SignIn({ signedInAs }: { signedInAs: string | null }) {
  const a = useAdminColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const split = width >= 900;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setError(null);
    setBusy(true);
    try {
      const user = await login({ username: username.trim(), password });
      if (user.role !== "admin" && user.role !== "moderator") setError("Bu hesabın yönetim paneline erişimi yok.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: split ? a.page : a.frame, padding: split ? 16 : 0 }]}>
    <View style={[styles.fill, split && styles.frame, { flexDirection: "row", backgroundColor: a.frame }]}>
      {split && (
        <View style={styles.hero}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
            <Defs>
              <RadialGradient id="glow" cx="78%" cy="18%" r="70%">
                <Stop offset="0" stopColor={GOLD} stopOpacity={0.32} />
                <Stop offset="0.5" stopColor={GOLD} stopOpacity={0.06} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="blue" cx="10%" cy="100%" r="60%">
                <Stop offset="0" stopColor={palette.kobalt300} stopOpacity={0.18} />
                <Stop offset="1" stopColor={palette.kobalt300} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={palette.gece950} />
            <Rect width="100%" height="100%" fill="url(#glow)" />
            <Rect width="100%" height="100%" fill="url(#blue)" />
          </Svg>
          <View style={styles.brand}>
            <BrandMark size={34} />
            <Text colorValue={palette.gece50} style={[styles.brandName, { fontSize: 22 }]}>
              Vakıfname
            </Text>
          </View>
          <View style={{ gap: 16, maxWidth: 460 }}>
            <Text colorValue={GOLD} style={styles.heroKicker}>
              YÖNETİM PANELİ
            </Text>
            <Text colorValue={palette.gece50} style={styles.heroTitle}>
              Vakıf eserlerinin topluluğunu ve içeriğini tek yerden yönet.
            </Text>
            <Text colorValue={palette.gece300} style={styles.heroBody}>
              Ziyaretçi notlarını incele, kullanıcıları yönet, yeni eserler, başarımlar ve ödüller ekle.
            </Text>
          </View>
          <Text colorValue={palette.gece400} style={{ fontSize: 13 }}>
            KÖK&KOD · Vakıfname
          </Text>
        </View>
      )}
      <View style={[styles.fill, styles.formSide]}>
        <View style={styles.form}>
          {!split && <BrandMark size={40} />}
          <View style={{ gap: 6 }}>
            <Text headingLevel={1} style={styles.formTitle}>
              Giriş yap
            </Text>
            <Text color="textSecondary" style={{ fontSize: 14, lineHeight: 21 }}>
              {signedInAs ? `${signedInAs} hesabının panel yetkisi yok. Moderatör ya da admin hesabınla giriş yap.` : "Moderatör ya da admin hesabınla devam et."}
            </Text>
          </View>
          <Field label="Kullanıcı adı" value={username} onChangeText={setUsername} autoCapitalize="none" autoComplete="username" placeholder="kullanici.adi" />
          <Field
            label="Parola"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Parolan"
            onSubmitEditing={() => void submit()}
          />
          {error && (
            <View style={[styles.error, { backgroundColor: a.redSoft }]}>
              <Ionicons name="alert-circle-outline" size={16} color={a.warning} aria-hidden />
              <Text colorValue={a.warning} style={{ fontSize: 13, flex: 1 }}>
                {error}
              </Text>
            </View>
          )}
          <Button label="Giriş yap" kind="primary" busy={busy} disabled={!username.trim() || !password} onPress={() => void submit()} />
          <Pressable accessibilityRole="link" onPress={() => router.replace("/map")} style={{ alignSelf: "center", padding: 6 }}>
            <Text color="textSecondary" style={{ fontSize: 13 }}>
              ← Uygulamaya dön
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
    </View>
  );
}

/** A page's scrolling body, centred and capped in width. */
export function PageBody({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return (
    <ScrollView style={styles.fill} contentContainerStyle={[styles.body, { padding: width >= 960 ? 28 : 16 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.bodyInner}>{children}</View>
    </ScrollView>
  );
}

/** Shown on admin-only pages to a moderator. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { role } = usePanel();
  if (role === "admin") return <>{children}</>;
  return (
    <PageBody>
      <Empty icon="lock-closed-outline" title="Bu bölüm yalnızca adminler için" body="Moderatör olarak inceleme kuyruğunu ve kullanıcıları yönetebilirsin." />
    </PageBody>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  mark: { backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, paddingVertical: 6 },
  brandName: { fontFamily: fontFamily.sansBold, fontSize: 19, lineHeight: 24, letterSpacing: -0.4 },
  frame: { borderRadius: 28, overflow: "hidden" },
  side: { width: 236, paddingHorizontal: 18, paddingVertical: 24 },
  rail: { width: 76, paddingHorizontal: 0, alignItems: "center", gap: 10 },
  railLink: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  railDot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  themeOne: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 12, height: 44, paddingHorizontal: 16, borderRadius: 999 },
  linkText: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: 14 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  countText: { fontFamily: fontFamily.sansBold, fontSize: 11 },
  me: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  meName: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  meRole: { fontFamily: fontFamily.sans, fontSize: 12 },
  theme: { flexDirection: "row", padding: 4, borderRadius: 999 },
  themeHalf: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: 999 },
  themeText: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  strip: { borderBottomWidth: 1 },
  stripHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  hero: { flex: 1, maxWidth: 640, overflow: "hidden", margin: 12, borderRadius: 22, padding: 44, justifyContent: "space-between" },
  heroKicker: { fontFamily: fontFamily.monoMedium, fontSize: 12, letterSpacing: 2 },
  heroTitle: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 50 },
  heroBody: { fontSize: 16, lineHeight: 25 },
  formSide: { alignItems: "center", justifyContent: "center", padding: 24 },
  form: { width: 360, maxWidth: "100%", gap: 18 },
  formTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 28, lineHeight: 36, letterSpacing: -0.6 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  body: { flexGrow: 1 },
  bodyInner: { width: "100%", maxWidth: 1320, alignSelf: "center" },
});

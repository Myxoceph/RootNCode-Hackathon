import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, Text } from "@vagabonds/ui";
import { usePathname, useRouter, type Href } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { fetchAdminSummary, fetchChats, fetchDrafts } from "@/data/admin";
import { logout, useCommunity } from "@/data";
import { useA11ySettings } from "@/settings/a11y-settings";

import { Avatar, Empty, useAdminColors, type IconName } from "./kit";
import { Panel, usePanel, type PanelContext, type PanelRole } from "./panel";

export { usePanel, type PanelRole };

/**
 * The admin panel's frame: one big rounded white frame on a soft backdrop, with the side bar (the
 * sections as pills, the signed-in person and the theme switch) and the page inside it. The side
 * bar folds to a rail of icons for more room, and stays so on this browser. Narrow screens get the
 * sections as a strip along the top instead.
 * Only moderators and admins get in; anyone else gets the sign-in screen.
 */

const SECTIONS: Array<{ href: Href; path: string; icon: IconName; label: string; adminOnly?: boolean; counted?: boolean; intake?: boolean }> = [
  { href: "/admin", path: "/admin", icon: "grid-outline", label: "Genel bakış" },
  { href: "/admin/review", path: "/admin/review", icon: "checkmark-done-outline", label: "İnceleme", counted: true },
  { href: "/admin/intake", path: "/admin/intake", icon: "chatbubbles-outline", label: "Sohbetten Kabul", intake: true },
  { href: "/admin/ranking", path: "/admin/ranking", icon: "trophy-outline", label: "Popüler eserler" },
  { href: "/admin/users", path: "/admin/users", icon: "people-outline", label: "Kullanıcılar" },
  { href: "/admin/assets", path: "/admin/assets", icon: "business-outline", label: "Eserler", adminOnly: true },
  { href: "/admin/achievements", path: "/admin/achievements", icon: "ribbon-outline", label: "Başarımlar", adminOnly: true },
  { href: "/admin/rewards", path: "/admin/rewards", icon: "gift-outline", label: "Ödüller", adminOnly: true },
];

/** The sections this person sees: admins' own only to admins, Sohbetten Kabul only where the API has it. */
function useSections(role: PanelRole) {
  const { intake } = usePanel();
  return SECTIONS.filter((section) => (role === "admin" || !section.adminOnly) && (intake || !section.intake));
}

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
  const [intake, setIntake] = useState(false);
  const [draftsPending, setDraftsPending] = useState(0);
  const [round, setRound] = useState(0);
  const [folded, toggleFolded] = useFolded();
  const role = user?.role === "admin" || user?.role === "moderator" ? user.role : null;

  useEffect(() => {
    if (!role) return;
    let active = true;
    fetchAdminSummary().then(
      (summary) => active && setPending(summary.pending.notes),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [role, round]);

  // Drafts waiting for this person (new assets are an admin's), beside the notes in the side bar's count.
  useEffect(() => {
    if (!role || !intake) return;
    let active = true;
    // One request: an admin's are all of them, a moderator's the inscriptions. A failed count keeps the last.
    fetchDrafts({ status: "pending", limit: 1, ...(role === "admin" ? {} : { kind: "inscription" as const }) }).then(
      (page) => active && setDraftsPending(page.total),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [role, intake, round]);

  // Sohbetten Kabul is only on an API with Veri Döngüsü's routes (INTAKE_ENABLED). Asked once; a
  // failed answer (the API starting, a timeout) is asked again a little later, not taken as "off".
  useEffect(() => {
    if (!role) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ask = () =>
      fetchChats().then(
        (chats) => active && setIntake(chats !== null),
        () => {
          if (active) retry = setTimeout(ask, 15_000);
        },
      );
    void ask();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [role]);

  // Signed in at the app's own sign-in page, as every account is.
  if (user === undefined || !user?.username || !role) return <Away />;

  const waiting = pending === null ? null : pending + draftsPending;
  const context: PanelContext = { role, pending: waiting, refreshPending: () => setRound((n) => n + 1), intake };
  return (
    <Panel.Provider value={context}>
      <View style={[styles.fill, { backgroundColor: wide ? a.page : a.frame, padding: wide ? 16 : 0 }]}>
        <View style={[styles.fill, wide && styles.frame, { flexDirection: wide ? "row" : "column", backgroundColor: a.frame }]}>
          {wide ? <SideBar name={user.nickname} username={user.username} role={role} pending={waiting} folded={folded} onFold={toggleFolded} /> : <TopStrip role={role} pending={waiting} />}
          <View style={styles.fill}>{children}</View>
        </View>
      </View>
    </Panel.Provider>
  );
}

/**
 * The panel has no sign-in page of its own: signed out, or signed in with an account without the
 * moderator's or admin's role, the app's sign-in opens, and comes back here once signed in (`next`).
 */
function Away() {
  const a = useAdminColors();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useCommunity();
  useEffect(() => {
    if (user === undefined) return;
    router.replace({ pathname: "/auth", params: { mode: "login", next: pathname } });
  }, [user, pathname, router]);
  return <View style={[styles.fill, { backgroundColor: a.page }]} />;
}

/** The app's logo, as the site's bar has it: deep gold on the light panel, light gold on the dark one. */
const BRAND = {
  light: { logo: require("../../../assets/images/brand/logo.png"), symbol: require("../../../assets/images/brand/symbol.png") },
  dark: { logo: require("../../../assets/images/brand/logo-light.png"), symbol: require("../../../assets/images/brand/symbol-light.png") },
};
/** Their width for their height (assets/images/brand). */
const LOGO_SHAPE = 1885 / 474;
const SYMBOL_SHAPE = 1255 / 947;

/** The logo, named for a screen reader; the symbol alone where the side bar is folded. */
function BrandMark({ height = 32, symbol = false }: { height?: number; symbol?: boolean }) {
  const { dark } = useAdminColors();
  const look = BRAND[dark ? "dark" : "light"];
  return (
    <Image
      source={symbol ? look.symbol : look.logo}
      accessibilityRole="image"
      accessibilityLabel="Vakıfname"
      resizeMode="contain"
      style={{ height, width: height * (symbol ? SYMBOL_SHAPE : LOGO_SHAPE) }}
    />
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
  const sections = useSections(role);
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
        <BrandMark symbol height={30} />
        {fold}
        <ScrollView style={{ flex: 1, alignSelf: "stretch" }} contentContainerStyle={{ gap: 4, paddingTop: 10, alignItems: "center" }}>
          {sections.map((section) => (
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
        <View style={{ flex: 1 }}>
          <BrandMark height={34} />
        </View>
        {fold}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingTop: 22 }}>
        {sections.map((section) => (
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
  const sections = useSections(role);
  return (
    <View style={[styles.strip, { borderBottomColor: a.line }]}>
      <View style={styles.stripHead}>
        <View style={[styles.brand, { paddingVertical: 12 }]}>
          <BrandMark height={28} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Çıkış yap" onPress={() => void logout()} style={styles.iconButton}>
          <Ionicons name="log-out-outline" size={19} color={a.textSecondary} aria-hidden />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 12, paddingBottom: 10 }}>
        {sections.map((section) => (
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
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, paddingVertical: 6 },
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
  body: { flexGrow: 1 },
  bodyInner: { width: "100%", maxWidth: 1320, alignSelf: "center" },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, touchTarget, useTheme, type Theme } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { startTransition, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { AccessibilityInfo, ActivityIndicator, BackHandler, FlatList, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AssetCard } from "@/components/asset-card";
import { Star } from "@/components/star";
import { useSearchableAssets } from "@/data";
import { foldTurkish } from "@/search/asset-search";

/** Content column width; on a wide screen the cards stay a gallery instead of stretching. */
const MAX_CONTENT_WIDTH = 560;

/** Gap between the grid's two columns and its rows. */
const GRID_GAP = spacing.md;
const FIELD_HEIGHT = 48;

/**
 * The gallery's colors, from the theme: the app's night blue in dark mode, its paper white in
 * light mode, and the high contrast versions of both. Gold is the theme's text-safe gold.
 */
function inkOf(theme: Theme) {
  const c = theme.colors;
  const dark = theme.scheme === "dark";
  return {
    dark,
    background: c.background,
    panel: dark ? c.surfaceRaised : c.surface,
    text: c.text,
    soft: c.textSecondary,
    gold: c.highlight,
    onGold: c.onPrimary,
    glass: dark ? "rgba(255, 255, 255, 0.07)" : c.surface,
    edge: dark ? "rgba(255, 255, 255, 0.12)" : c.border,
  };
}
type Ink = ReturnType<typeof inkOf>;

const looks = new Map<string, { ink: Ink; styles: ReturnType<typeof makeStyles> }>();

/** The colors and the styles for the current theme, made once per theme. */
function useLook() {
  const theme = useTheme();
  let look = looks.get(theme.name);
  if (!look) {
    const ink = inkOf(theme);
    look = { ink, styles: makeStyles(ink) };
    looks.set(theme.name, look);
  }
  return look;
}

interface Filters {
  city?: string;
  kind?: string;
}

interface Option {
  code: string;
  label: string;
  count: number;
}

/**
 * The filter offers a handful of kinds instead of every type in the data set: the dataset's
 * `asset_types` codes (data/enums.json), gathered by what a visitor looks for. A type not named
 * here falls under "Diğer".
 */
const KINDS: { code: string; label: string; types: string[] }[] = [
  {
    code: "ibadet",
    label: "Cami",
    types: ["cami", "mescit", "kulliye", "tekke", "kilise"],
  },
  { code: "turbe", label: "Türbe", types: ["turbe", "hazire", "makam"] },
  {
    code: "ticaret",
    label: "Han ve Çarşı",
    types: ["han", "kervansaray", "bedesten", "arasta"],
  },
  { code: "su", label: "Hamam ve Çeşme", types: ["hamam", "cesme", "sebil"] },
];
const OTHER = { code: "diger", label: "Diğer" };

function kindOf(asset: AssetSummary): { code: string; label: string } {
  return KINDS.find((kind) => kind.types.includes(asset.type.code)) ?? OTHER;
}

/** The distinct values of one field, most assets first. */
function optionsOf(assets: AssetSummary[], pick: (asset: AssetSummary) => { code: string; label: string }): Option[] {
  const byCode = new Map<string, Option>();
  for (const asset of assets) {
    const { code, label } = pick(asset);
    const option = byCode.get(code) ?? { code, label, count: 0 };
    option.count++;
    byCode.set(code, option);
  }
  return [...byCode.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr"));
}

/** The kinds that have assets, in their fixed order, "Diğer" last. */
function kindOptions(assets: AssetSummary[]): Option[] {
  const counts = optionsOf(assets, kindOf);
  return [...KINDS, OTHER].flatMap((kind) => counts.filter((option) => option.code === kind.code));
}

function matches(asset: AssetSummary, query: string, filters: Filters): boolean {
  if (filters.city && asset.city.code !== filters.city) return false;
  if (filters.kind && kindOf(asset).code !== filters.kind) return false;
  if (query === "") return true;
  return [asset.name, asset.type.label, asset.district, asset.city.label].some((field) => foldTurkish(field).includes(query));
}

/**
 * Eserler: the collection as a night gallery. A title, a search field and the city and kind
 * dropdowns under it, then the assets in a two-column photo grid. The bar floats over it.
 */
export default function MonumentsScreen() {
  const { ink, styles } = useLook();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  // A link can still open the list on one city (/monuments?city=bursa).
  const { city } = useLocalSearchParams<{ city?: string }>();
  const all = useSearchableAssets(true);
  const assets = useMemo(() => (all.status === "success" ? (all.data ?? []) : []), [all]);

  const [text, setText] = useState("");
  const [filters, setFilters] = useState<Filters>({ city });
  const [menu, setMenu] = useState<{
    field: keyof Filters;
    anchor: Anchor;
  } | null>(null);
  const screen = useRef<ComponentRef<typeof View>>(null);
  // The menu is drawn in this screen, not in a native modal (which opens with a lag and, on
  // Android, measures from under the status bar): the button's window position is made
  // relative to the screen.
  const openMenu = (field: keyof Filters, at: Anchor) =>
    screen.current?.measureInWindow((x, y) => setMenu({ field, anchor: { ...at, top: at.top - y, left: at.left - x } }));
  useEffect(() => {
    if (city) setFilters((f) => ({ ...f, city }));
  }, [city]);

  const query = foldTurkish(text);
  const shown = useMemo(() => assets.filter((asset) => matches(asset, query, filters)).sort((a, b) => b.prominence - a.prominence), [assets, query, filters]);
  const cityOptions = useMemo(() => optionsOf(assets, (a) => a.city), [assets]);
  const typeOptions = useMemo(() => kindOptions(assets), [assets]);
  const options = { city: cityOptions, kind: typeOptions };

  // A status message (WCAG 4.1.3): read out when the list loads or the search changes.
  // Android and the web read the live region below; iOS needs an explicit announcement.
  const status = all.status === "loading" ? "Eserler yükleniyor" : all.status === "success" ? `${shown.length} eser` : "";
  useEffect(() => {
    if (Platform.OS !== "ios" || status === "") return;
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(status), 700);
    return () => clearTimeout(timer);
  }, [status]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.titleRow}>
        <Text variant="title" headingLevel={1} colorValue={ink.text} style={styles.title}>
          Eserler
        </Text>
        <Pressable accessibilityRole="link" accessibilityLabel="Zamanda yolculuk yaparak inceleyin" onPress={() => router.push("/time-journey")} style={({ pressed }) => [styles.journey, pressed && styles.journeyPressed]}>
          <Text variant="label" colorValue={palette.gece950} numberOfLines={1} style={styles.journeyText}>
            Zamanda yolculuk
          </Text>
          <View style={styles.journeyArrow}>
            <Ionicons name="arrow-forward" size={16} color={ink.gold} />
          </View>
        </Pressable>
      </View>
      {/* Not shown, still read: screen readers hear the count as the list loads or the search changes. */}
      <Text colorValue={ink.soft} accessibilityLiveRegion="polite" style={styles.visuallyHidden}>
        {all.status === "success" ? `${shown.length} vakıf eseri` : status}
      </Text>

      <View style={styles.searchRow}>
        <View style={styles.field}>
          <Ionicons name="search" size={18} color={ink.soft} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Eser, ilçe veya tür ara"
            placeholderTextColor={ink.soft}
            accessibilityLabel="Eser ara"
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
          />
          {text !== "" && (
            <Pressable accessibilityRole="button" accessibilityLabel="Aramayı temizle" hitSlop={10} onPress={() => setText("")}>
              <Ionicons name="close-circle" size={18} color={ink.soft} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.dropdowns}>
        <Dropdown
          title="Şehir"
          value={cityOptions.find((o) => o.code === filters.city)?.label}
          open={menu?.field === "city"}
          onOpen={(anchor) => openMenu("city", anchor)}
        />
        <Dropdown
          title="Tür"
          value={typeOptions.find((o) => o.code === filters.kind)?.label}
          open={menu?.field === "kind"}
          onOpen={(anchor) => openMenu("kind", anchor)}
        />
      </View>
    </View>
  );

  return (
    <View ref={screen} style={styles.screen}>
      <StatusBar style={ink.dark ? "light" : "dark"} />
      <Head>
        <title>Eserler · Vagabonds</title>
      </Head>
      {all.status === "success" ? (
        <FlatList
          // An odd count gets an empty cell, so the last card keeps its column width.
          data={shown.length % 2 ? [...shown, null] : shown}
          keyExtractor={(a) => a?.id ?? "filler"}
          numColumns={2}
          columnWrapperStyle={styles.row}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.xl }]}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.state}>
              <Ionicons name="search-outline" size={28} color={ink.soft} />
              <Text colorValue={ink.soft} style={styles.center}>
                Aramana uyan eser yok.
              </Text>
            </View>
          }
          ListFooterComponent={shown.length > 0 ? <EndMark /> : undefined}
          renderItem={({ item }) => (item ? <AssetCard asset={item} /> : <View style={styles.filler} />)}
        />
      ) : (
        <View style={styles.list}>
          {header}
          {all.status === "loading" ? (
            <ActivityIndicator color={ink.gold} size="large" accessibilityLabel="Yükleniyor" style={styles.state} />
          ) : (
            <View style={styles.state} accessibilityRole="alert">
              <Text variant="label" colorValue={ink.text}>
                {all.error.kind === "invalid" ? "Veriler okunamadı" : "Veriler yüklenemedi"}
              </Text>
              <Text colorValue={ink.soft} style={styles.center}>
                {all.error.message}
              </Text>
              <GoldButton label="Tekrar dene" onPress={all.retry} />
            </View>
          )}
        </View>
      )}

      <FilterMenu
        anchor={menu?.anchor ?? null}
        options={menu ? options[menu.field] : []}
        selected={menu ? filters[menu.field] : undefined}
        // The menu closes first; the grid follows without holding the tap up.
        onPick={(code) => menu && startTransition(() => setFilters((f) => ({ ...f, [menu.field]: code })))}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

/** Where a dropdown sits on screen; its menu opens under it. */
interface Anchor {
  top: number;
  left: number;
  width: number;
}

/**
 * A filter as a button that drops a menu: its name, or the chosen value in gold, and a chevron.
 * The options stay out of sight until it is opened.
 */
function Dropdown({ title, value, open, onOpen }: { title: string; value: string | undefined; open: boolean; onOpen: (anchor: Anchor) => void }) {
  const { ink, styles } = useLook();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const on = value !== undefined;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value ?? "Tümü"}`}
      accessibilityState={{ expanded: open }}
      onPress={() => ref.current?.measureInWindow((x, y, width, height) => onOpen({ top: y + height + spacing.xs, left: x, width }))}
      style={({ pressed }) => [styles.dropdown, on && styles.dropdownOn, pressed && styles.pressed]}
    >
      <Text colorValue={on ? ink.gold : ink.text} style={styles.dropdownText} numberOfLines={1}>
        {value ?? title}
      </Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={on ? ink.gold : ink.soft} />
    </Pressable>
  );
}

/** The menu of one dropdown, as wide as its button: "Tümü" and the options as rows, the chosen one ticked. A choice applies at once. */
function FilterMenu({
  anchor,
  options,
  selected,
  onPick,
  onClose,
}: {
  anchor: Anchor | null;
  options: Option[];
  selected: string | undefined;
  onPick: (code: string | undefined) => void;
  onClose: () => void;
}) {
  const { ink, styles } = useLook();
  const rows = [{ code: undefined, label: "Tümü" }, ...options];
  // Android's back button closes the menu first.
  useEffect(() => {
    if (!anchor || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [anchor, onClose]);

  if (!anchor) return null;
  return (
    <>
      <Pressable accessibilityLabel="Menüyü kapat" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.menu, { top: anchor.top, left: anchor.left, width: anchor.width }]} accessibilityViewIsModal accessibilityRole="radiogroup">
        {rows.map((row) => {
          const on = row.code === selected;
          return (
            <Pressable
              key={row.code ?? "all"}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                onClose();
                onPick(row.code);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}
            >
              <Text colorValue={on ? ink.text : ink.soft} style={[styles.menuText, on && styles.menuTextOn]}>
                {row.label}
              </Text>
              {on && <Ionicons name="checkmark" size={18} color={ink.gold} />}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function GoldButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { ink, styles } = useLook();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.gold, pressed && styles.pressed]}>
      <Text variant="label" colorValue={ink.onGold} style={styles.center}>
        {label}
      </Text>
    </Pressable>
  );
}

function EndMark() {
  const { ink, styles } = useLook();
  return (
    <View style={styles.end}>
      <View style={styles.endLine} />
      <Star size={14} color={ink.gold} />
      <View style={styles.endLine} />
    </View>
  );
}

const makeStyles = (ink: Ink) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: ink.background,
    },
    visuallyHidden: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      opacity: 0,
    },
    center: {
      textAlign: "center",
    },
    pressed: {
      opacity: 0.75,
    },
    list: {
      width: "100%",
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      paddingHorizontal: spacing.lg,
      gap: GRID_GAP + spacing.xs,
    },
    header: {
      gap: spacing.xs,
      paddingBottom: spacing.xs,
    },
    searchRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    field: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      height: FIELD_HEIGHT,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      backgroundColor: ink.glass,
      borderColor: ink.edge,
      borderWidth: StyleSheet.hairlineWidth,
    },
    input: {
      flex: 1,
      minWidth: 0,
      height: "100%",
      color: ink.text,
      fontFamily: fontFamily.sans,
      fontSize: 16,
    },
    dropdowns: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    title: {
      flexShrink: 1,
    },
    journey: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: touchTarget.min,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      borderRadius: radius.full,
      // White in both themes, its words and arrow night blue.
      backgroundColor: palette.white,
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    journeyPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },
    journeyArrow: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.gece950,
    },
    journeyText: {
      flexShrink: 1,
      fontFamily: fontFamily.sansSemiBold,
    },
    // The two share the search field's width.
    dropdown: {
      flex: 1,
      flexBasis: 0,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.xs,
      height: touchTarget.min - 4,
      paddingLeft: spacing.lg,
      paddingRight: spacing.md,
      borderRadius: radius.full,
      backgroundColor: ink.glass,
      borderColor: ink.edge,
      borderWidth: StyleSheet.hairlineWidth,
    },
    dropdownOn: {
      borderColor: ink.gold,
    },
    dropdownText: {
      flexShrink: 1,
      fontFamily: fontFamily.sansMedium,
      fontSize: 15,
    },
    row: {
      gap: GRID_GAP,
    },
    filler: {
      flex: 1,
      flexBasis: 0,
    },
    state: {
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xxxl,
    },
    gold: {
      minHeight: touchTarget.min + 4,
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      borderRadius: radius.full,
      backgroundColor: ink.gold,
    },
    end: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xl,
    },
    endLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: ink.edge,
    },
    menu: {
      position: "absolute",
      paddingVertical: spacing.xs,
      borderRadius: radius.xl,
      backgroundColor: ink.panel,
      borderColor: ink.edge,
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: "#000",
      shadowOpacity: 0.4,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.lg,
      minHeight: touchTarget.min,
      paddingHorizontal: spacing.lg,
    },
    menuPressed: {
      backgroundColor: ink.glass,
    },
    menuText: {
      fontFamily: fontFamily.sansMedium,
      fontSize: 15,
    },
    menuTextOn: {
      fontFamily: fontFamily.sansSemiBold,
    },
  });

import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary, Lang } from "@vagabonds/contracts";
import {
  fontFamily,
  radius,
  spacing,
  Text,
  touchTarget,
  useTheme,
  useUi,
  type Theme,
} from "@vagabonds/ui";
import { useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AssetCard } from "@/components/asset-card";
import { Star } from "@/components/star";
import { TimeJourneyCard } from "@/components/time-journey-card";
import { useSearchableAssets } from "@/data";
import { useLang, useMessages, type Messages } from "@/i18n";
import { foldTurkish } from "@/search/asset-search";

/** Content column width; on a wide screen the cards stay a gallery instead of stretching. */
const MAX_CONTENT_WIDTH = 560;
/**
 * A wide web page is a website's gallery: a wider column, three or four cards a row, and the
 * search and the filters in one bar beside the title.
 */
const WEB_CONTENT_WIDTH = 1200;
const WEB_FROM = 900;

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

const looks = new Map<
  string,
  { ink: Ink; styles: ReturnType<typeof makeStyles> }
>();

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
const KINDS: { code: KindCode; types: string[] }[] = [
  { code: "ibadet", types: ["cami", "mescit", "kulliye", "tekke", "kilise"] },
  { code: "turbe", types: ["turbe", "hazire", "makam"] },
  { code: "ticaret", types: ["han", "kervansaray", "bedesten", "arasta"] },
  { code: "su", types: ["hamam", "cesme", "sebil"] },
];
const OTHER = { code: "diger" as const };

type KindCode = keyof Messages["monuments"]["kinds"];

function kindOf(asset: AssetSummary): { code: KindCode } {
  return KINDS.find((kind) => kind.types.includes(asset.type.code)) ?? OTHER;
}

/** The distinct values of one field, most assets first. */
function optionsOf(
  assets: AssetSummary[],
  pick: (asset: AssetSummary) => { code: string; label: string },
  lang: Lang,
): Option[] {
  const byCode = new Map<string, Option>();
  for (const asset of assets) {
    const { code, label } = pick(asset);
    const option = byCode.get(code) ?? { code, label, count: 0 };
    option.count++;
    byCode.set(code, option);
  }
  return [...byCode.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, lang),
  );
}

/** The kinds that have assets, in their fixed order, "Diğer" last. */
function kindOptions(assets: AssetSummary[], labels: Messages["monuments"]["kinds"], lang: Lang): Option[] {
  const counts = optionsOf(assets, (asset) => {
    const { code } = kindOf(asset);
    return { code, label: labels[code] };
  }, lang);
  return [...KINDS, OTHER].flatMap((kind) =>
    counts.filter((option) => option.code === kind.code),
  );
}

function matches(
  asset: AssetSummary,
  query: string,
  filters: Filters,
): boolean {
  if (filters.city && asset.city.code !== filters.city) return false;
  if (filters.kind && kindOf(asset).code !== filters.kind) return false;
  if (query === "") return true;
  return [asset.name, asset.type.label, asset.district, asset.city.label].some(
    (field) => foldTurkish(field).includes(query),
  );
}

/**
 * Eserler: the collection as a night gallery. A title, a search field and the city and kind
 * dropdowns under it, then the assets in a two-column photo grid. The bar floats over it.
 */
export default function MonumentsScreen() {
  const { ink, styles } = useLook();
  const { textScale } = useUi();
  const m = useMessages();
  const w = m.monuments;
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= WEB_FROM;
  const columns = wide ? (width >= 1240 ? 4 : 3) : 2;
  // A link can still open the list on one city (/monuments?city=bursa).
  const { city } = useLocalSearchParams<{ city?: string }>();
  const all = useSearchableAssets(true);
  const assets = useMemo(
    () => (all.status === "success" ? (all.data ?? []) : []),
    [all],
  );

  const [text, setText] = useState("");
  // The field's own ring shows the focus: the browser's outline around the bare input is turned off.
  const [focused, setFocused] = useState(false);
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
    screen.current?.measureInWindow((x, y) =>
      setMenu({ field, anchor: { ...at, top: at.top - y, left: at.left - x } }),
    );
  useEffect(() => {
    if (city) setFilters((f) => ({ ...f, city }));
  }, [city]);

  const query = foldTurkish(text);
  const shown = useMemo(
    () =>
      assets
        .filter((asset) => matches(asset, query, filters))
        .sort((a, b) => b.prominence - a.prominence),
    [assets, query, filters],
  );
  const cityOptions = useMemo(() => optionsOf(assets, (a) => a.city, lang), [assets, lang]);
  const typeOptions = useMemo(() => kindOptions(assets, w.kinds, lang), [assets, w, lang]);
  const options = { city: cityOptions, kind: typeOptions };

  // A status message (WCAG 4.1.3): read out when the list loads or the search changes.
  // Android and the web read the live region below; iOS needs an explicit announcement.
  const status =
    all.status === "loading"
      ? w.loading
      : all.status === "success"
        ? w.sites(shown.length)
        : "";
  useEffect(() => {
    if (Platform.OS !== "ios" || status === "") return;
    const timer = setTimeout(
      () => AccessibilityInfo.announceForAccessibility(status),
      700,
    );
    return () => clearTimeout(timer);
  }, [status]);

  const header = (
    <View
      style={[
        styles.header,
        wide && styles.headerWide,
        { paddingTop: insets.top + (wide ? spacing.lg : spacing.xl) },
      ]}
    >
      {/* The tab bar and the site's bar name the page: the title is there for screen readers only. */}
      <View style={styles.visuallyHidden}>
        <Text
          variant="title"
          headingLevel={1}
          colorValue={ink.text}
          style={styles.title}
        >
          {m.tabs.monuments}
        </Text>
      </View>
      <View style={wide ? styles.toolbar : undefined}>
        {/* Not shown, still read: screen readers hear the count as the list loads or the search changes. */}
        <Text
          colorValue={ink.soft}
          accessibilityLiveRegion="polite"
          style={styles.visuallyHidden}
        >
          {all.status === "success" ? w.waqfSites(shown.length) : status}
        </Text>

        <View style={[styles.searchRow, wide && styles.searchRowWide]}>
          <View style={[styles.field, focused && styles.fieldFocused]}>
            <Ionicons name="search" size={18} color={ink.soft} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={w.searchPlaceholder}
              placeholderTextColor={ink.soft}
              accessibilityLabel={w.searchLabel}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="search"
              autoCorrect={false}
              style={[styles.input, { fontSize: 16 * textScale }, Platform.OS === "web" && ({ outlineStyle: "none" } as object)]}
            />
            {text !== "" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={w.clearSearch}
                hitSlop={10}
                onPress={() => setText("")}
              >
                <Ionicons name="close-circle" size={18} color={ink.soft} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={[styles.dropdowns, wide && styles.dropdownsWide]}>
          <Dropdown
            title={w.city}
            value={cityOptions.find((o) => o.code === filters.city)?.label}
            open={menu?.field === "city"}
            onOpen={(anchor) => openMenu("city", anchor)}
          />
          <Dropdown
            title={w.kind}
            value={typeOptions.find((o) => o.code === filters.kind)?.label}
            open={menu?.field === "kind"}
            onOpen={(anchor) => openMenu("kind", anchor)}
          />
        </View>
      </View>

      {/* Out of the way while searching or filtering: the results come first then. */}
      {all.status === "success" &&
        query === "" &&
        !filters.city &&
        !filters.kind && (
          <View style={styles.journeyCard}>
            <TimeJourneyCard assets={assets} />
          </View>
        )}
    </View>
  );

  return (
    <View ref={screen} style={styles.screen}>
      <StatusBar style={ink.dark ? "light" : "dark"} />
      <Head>
        <title>{m.common.title(m.tabs.monuments)}</title>
      </Head>
      {all.status === "success" ? (
        <FlatList
          // A short last row gets empty cells, so its cards keep their column width.
          key={`grid-${columns}`}
          data={[
            ...shown,
            ...Array<null>((columns - (shown.length % columns)) % columns).fill(
              null,
            ),
          ]}
          keyExtractor={(a, i) => a?.id ?? `filler-${i}`}
          numColumns={columns}
          columnWrapperStyle={styles.row}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.list,
            wide && styles.listWide,
            { paddingBottom: tabBarHeight + spacing.xl },
          ]}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.state}>
              <Ionicons name="search-outline" size={28} color={ink.soft} />
              <Text colorValue={ink.soft} style={styles.center}>
                {w.empty}
              </Text>
            </View>
          }
          ListFooterComponent={shown.length > 0 ? <EndMark /> : undefined}
          renderItem={({ item }) =>
            item ? <AssetCard asset={item} /> : <View style={styles.filler} />
          }
        />
      ) : (
        <View style={[styles.list, wide && styles.listWide]}>
          {header}
          {all.status === "loading" ? (
            <ActivityIndicator
              color={ink.gold}
              size="large"
              accessibilityLabel={m.common.loading}
              style={styles.state}
            />
          ) : (
            <View style={styles.state} accessibilityRole="alert">
              <Text variant="label" colorValue={ink.text}>
                {all.error.kind === "invalid"
                  ? w.unreadable
                  : w.unavailable}
              </Text>
              <Text colorValue={ink.soft} style={styles.center}>
                {all.error.message}
              </Text>
              <GoldButton label={m.common.retry} onPress={all.retry} />
            </View>
          )}
        </View>
      )}

      <FilterMenu
        anchor={menu?.anchor ?? null}
        options={menu ? options[menu.field] : []}
        selected={menu ? filters[menu.field] : undefined}
        // The menu closes first; the grid follows without holding the tap up.
        onPick={(code) =>
          menu &&
          startTransition(() =>
            setFilters((f) => ({ ...f, [menu.field]: code })),
          )
        }
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
function Dropdown({
  title,
  value,
  open,
  onOpen,
}: {
  title: string;
  value: string | undefined;
  open: boolean;
  onOpen: (anchor: Anchor) => void;
}) {
  const { ink, styles } = useLook();
  const all = useMessages().monuments.all;
  const ref = useRef<ComponentRef<typeof View>>(null);
  const on = value !== undefined;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value ?? all}`}
      accessibilityState={{ expanded: open }}
      onPress={() =>
        ref.current?.measureInWindow((x, y, width, height) =>
          onOpen({ top: y + height + spacing.xs, left: x, width }),
        )
      }
      style={({ pressed }) => [
        styles.dropdown,
        on && styles.dropdownOn,
        pressed && styles.pressed,
      ]}
    >
      <Text
        colorValue={on ? ink.gold : ink.text}
        style={styles.dropdownText}
        numberOfLines={1}
      >
        {value ?? title}
      </Text>
      <Ionicons
        name={open ? "chevron-up" : "chevron-down"}
        size={16}
        color={on ? ink.gold : ink.soft}
      />
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
  const rows = [{ code: undefined, label: useMessages().monuments.all }, ...options];
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
      {/* A tap beside the menu closes it; screen readers close it with a choice, the back button or the escape gesture. */}
      <Pressable
        onPress={onClose}
        accessible={false}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.menu,
          { top: anchor.top, left: anchor.left, width: anchor.width },
        ]}
        accessibilityViewIsModal
        accessibilityRole="radiogroup"
        onAccessibilityEscape={onClose}
      >
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
              style={({ pressed }) => [
                styles.menuRow,
                pressed && styles.menuPressed,
              ]}
            >
              <Text
                colorValue={on ? ink.text : ink.soft}
                style={[styles.menuText, on && styles.menuTextOn]}
              >
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

function GoldButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { ink, styles } = useLook();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.gold, pressed && styles.pressed]}
    >
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
    listWide: {
      maxWidth: WEB_CONTENT_WIDTH,
      paddingHorizontal: spacing.xl,
      gap: spacing.xl,
    },
    headerWide: {
      gap: spacing.lg,
      paddingBottom: spacing.sm,
    },
    /** The search and the two filters in one row. */
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    searchRowWide: {
      flex: 1,
      marginTop: 0,
    },
    dropdownsWide: {
      width: 420,
      marginTop: 0,
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
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    title: {
      flexShrink: 1,
    },
    journeyCard: {
      marginTop: spacing.xs,
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
    fieldFocused: {
      borderColor: ink.gold,
      borderWidth: 1.5,
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

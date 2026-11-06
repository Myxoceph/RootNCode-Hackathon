import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary, Lang } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, touchTarget, typography, useTheme, useUi } from "@vagabonds/ui";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { useSearchableAssets } from "@/data";
import type { CityOption } from "@/data/source";
import { announce } from "@/lib/announce";
import { searchAssets } from "@/search/asset-search";
import { useLang, useMessages } from "@/i18n";

/** The gold of the tab bar: the field's ring while it is typed in. */
const GOLD = "#966F22";
const FIELD_HEIGHT = 52;
/** Shown before anything is typed: the best-known assets. */
const SUGGESTED = 5;

interface MapSearchProps {
  /** The open city; the search keeps to it. `null` in the Turkey view. */
  city: CityOption | null;
  /** The cities with assets, offered before anything is typed and found by name. */
  cities: CityOption[];
  top: number;
  onBack: () => void;
  onPickCity: (plate: number) => void;
  onPickAsset: (asset: AssetSummary) => void;
  /** Shown to the right of the field: the assistant button. */
  trailing?: React.ReactNode;
  /** Something went wrong (the map, the city's assets): said under the field, with a retry. */
  notice?: { message: string; onRetry?: () => void } | null;
  /** Shown right under the field while the search is closed: the chosen asset's buttons. */
  below?: React.ReactNode;
  /** On a wide web page the bar keeps to the map's side panel: this far from the left, this wide. */
  column?: { left: number; width: number };
  /** Where the bar (with what is under it) ends, while the search is closed: the side panel's list starts there. */
  onBottom?: (y: number) => void;
}

/**
 * The map's one bar: a search field for the assets, in the open city or all of them. Typed in,
 * it dims the map and lists cities and assets as they match; before anything is typed it offers
 * the cities and the best-known assets. A city opens on the map, an asset is chosen on it (or
 * opens its card when it has no place on the map). In a city a back button leads out first.
 *
 * For screen readers this is also the map in words: the cities and assets are buttons in the list,
 * and how many were found is said as the list changes.
 */
export function MapSearch({ city, cities, top, onBack, onPickCity, onPickAsset, trailing, notice, below, column, onBottom }: MapSearchProps) {
  const lang = useLang();
  const { colors: c } = useTheme();
  const { textScale } = useUi();
  const m = useMessages();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  // The assets load the first time the field is used, and stay for the next search.
  const [wanted, setWanted] = useState(false);
  const all = useSearchableAssets(wanted);
  const assets = all.status === "success" ? (all.data ?? []) : [];

  const typed = text.trim().length > 0;
  const results = useMemo(() => searchAssets(text, assets, cities, city?.code), [text, assets, cities, city?.code]);
  const suggested = useMemo(
    () =>
      [...assets]
        .filter((asset) => !city || asset.city.code === city.code)
        .sort((a, b) => b.prominence - a.prominence)
        .slice(0, SUGGESTED),
    [assets, city],
  );
  const shownCities = typed ? results.cities : city ? [] : cities.filter((option) => option.assetCount > 0 && option.plate !== null);
  const shownAssets = typed ? results.assets : suggested;
  const found = shownCities.length + shownAssets.length;

  // A new city empties the field.
  useEffect(() => {
    setText("");
    setOpen(false);
  }, [city?.code]);

  // How many were found, once the typing pauses.
  useEffect(() => {
    if (!open || !typed || all.status !== "success") return;
    const timer = setTimeout(() => announce(found === 0 ? m.search.noResults : m.search.results(found)), 700);
    return () => clearTimeout(timer);
  }, [open, typed, found, all.status]);

  const close = () => {
    setOpen(false);
    setText("");
    input.current?.blur();
  };
  const pickCity = (option: CityOption) => {
    close();
    if (option.plate !== null) onPickCity(option.plate);
  };
  const pickAsset = (asset: AssetSummary) => {
    close();
    onPickAsset(asset);
  };
  const pickFirst = () => {
    if (shownCities[0]) pickCity(shownCities[0]);
    else if (shownAssets[0]) pickAsset(shownAssets[0]);
  };

  const placeholder = city ? m.search.placeholderIn(placeIn(city.label, lang)) : m.search.placeholder;
  const shadow = { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 };

  return (
    <>
      {/* A tap beside the search closes it; screen readers have its "Kapat" for that. */}
      {open && <Pressable onPress={close} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={[StyleSheet.absoluteFill, styles.dim]} />}
      <View
        style={[styles.wrap, { top }, column && { left: column.left, width: column.width, right: undefined, alignSelf: "flex-start" }]}
        onLayout={(event) => !open && onBottom?.(top + event.nativeEvent.layout.height)}
      >
        <View style={[styles.field, shadow, { backgroundColor: c.surface, borderColor: open ? GOLD : c.surface }]}>
          {city ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.search.backToTurkey}
              onPress={onBack}
              hitSlop={4}
              style={({ pressed }) => [styles.round, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={20} color={c.text} />
            </Pressable>
          ) : (
            <View style={styles.searchIcon}>
              <Ionicons name="search" size={20} color={open ? GOLD : c.textSecondary} />
            </View>
          )}
          <TextInput
            ref={input}
            value={text}
            onChangeText={(value) => {
              setText(value);
              setOpen(true);
            }}
            onFocus={() => {
              setWanted(true);
              setOpen(true);
            }}
            onSubmitEditing={pickFirst}
            onKeyPress={(event) => event.nativeEvent.key === "Escape" && close()}
            placeholder={placeholder}
            placeholderTextColor={c.textSecondary}
            accessibilityLabel={placeholder}
            accessibilityHint={city ? m.search.hintCity : m.search.hint}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={[
              styles.input,
              { color: c.text, fontSize: typography.body.fontSize * textScale },
              Platform.OS === "web" && ({ outlineStyle: "none" } as object),
            ]}
          />
          {typed && (
            <Pressable accessibilityRole="button" accessibilityLabel={m.search.clear} onPress={() => setText("")} hitSlop={8} style={styles.clear}>
              <Ionicons name="close-circle" size={20} color={c.textSecondary} />
            </Pressable>
          )}
          {open ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.search.close}
              accessibilityHint={m.search.closeHint}
              onPress={close}
              hitSlop={4}
              style={({ pressed }) => [styles.closeButton, { backgroundColor: c.surfaceRaised }, pressed && styles.pressed]}
            >
              <Text variant="label">{m.search.close}</Text>
            </Pressable>
          ) : (
            trailing
          )}
        </View>

        {!open && below}
        {open ? (
          <View style={[styles.panel, shadow, { backgroundColor: c.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
              {all.status === "loading" && (
                <View style={styles.state}>
                  <ActivityIndicator color={GOLD} />
                  <Text variant="caption" color="textSecondary">
                    {m.search.loading}
                  </Text>
                </View>
              )}
              {all.status === "error" && (
                <View style={styles.state}>
                  <Text variant="caption" color="warning" style={styles.flex}>
                    {all.error.message}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={all.retry} hitSlop={8}>
                    <Text variant="label" color="highlight">
                      {m.common.retry}
                    </Text>
                  </Pressable>
                </View>
              )}

              {shownCities.length > 0 && (
                <Section title={m.search.cities}>
                  {shownCities.map((option) => (
                    <Row
                      key={option.code}
                      label={m.search.cityRow(option.label, option.assetCount)}
                      onPress={() => pickCity(option)}
                      leading={
                        <View style={[styles.cityMark, { backgroundColor: palette.gece800 }]}>
                          <Ionicons name="location" size={20} color={palette.altin200} />
                        </View>
                      }
                      title={option.label}
                      meta={m.search.count(option.assetCount)}
                    />
                  ))}
                </Section>
              )}

              {all.status === "success" && shownAssets.length > 0 && (
                <Section title={typed ? m.search.sites : m.search.featured}>
                  {shownAssets.map((asset) => {
                    const meta = [asset.type.label, city ? asset.district : `${asset.district}, ${asset.city.label}`].join(" · ");
                    return (
                      <Row
                        key={asset.id}
                        label={`${asset.name}, ${meta}`}
                        onPress={() => pickAsset(asset)}
                        leading={
                          <View style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>
                            {asset.cover ? <AssetImage media={asset.cover} decorative fill /> : <Ionicons name="image-outline" size={18} color={c.textSecondary} />}
                          </View>
                        }
                        title={asset.name}
                        meta={meta}
                      />
                    );
                  })}
                </Section>
              )}

              {all.status === "success" && typed && found === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="search-outline" size={28} color={c.textSecondary} />
                  <Text variant="label">{m.search.notFound}</Text>
                  <Text variant="caption" color="textSecondary" style={styles.center}>
                    {m.search.nothingMatches(text.trim(), city ? placeIn(city.label, lang) : null)}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        ) : (
          notice && (
            <View style={[styles.notice, shadow, { backgroundColor: c.surface }]}>
              <Ionicons name="alert-circle" size={18} color={c.warning} />
              <Text variant="caption" color="warning" style={styles.flex} accessibilityLiveRegion="polite">
                {notice.message}
              </Text>
              {notice.onRetry && (
                <Pressable accessibilityRole="button" onPress={notice.onRetry} hitSlop={8}>
                  <Text variant="label" color="highlight">
                    {m.common.retry}
                  </Text>
                </Pressable>
              )}
            </View>
          )
        )}
      </View>
    </>
  );
}

/** "Bursa'da" in Turkish, "Bursa" in English: the city as the phrases around it need it. */
export function placeIn(name: string, lang: Lang): string {
  return lang === "tr" ? inCity(name) : name;
}

/** "Bursa'da", "Edirne'de", "Sinop'ta": the city with the locative ending its last sounds call for. */
export function inCity(name: string): string {
  const lower = name.toLocaleLowerCase("tr");
  const vowel = [...lower].reverse().find((letter) => "aeıioöuü".includes(letter));
  const back = vowel !== undefined && "aıou".includes(vowel);
  const hard = "çfhkpsşt".includes(lower.at(-1) ?? "");
  return `${name}'${hard ? "t" : "d"}${back ? "a" : "e"}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const lang = useLang();
  return (
    <View style={styles.section}>
      <Text variant="overline" color="textSecondary" headingLevel={2} style={styles.sectionTitle}>
        {title.toLocaleUpperCase(lang)}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, onPress, leading, title, meta }: { label: string; onPress: () => void; leading: React.ReactNode; title: string; meta: string }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, (pressed || hovered) && { backgroundColor: c.surfaceRaised }]}
    >
      {leading}
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: "rgba(5, 8, 14, 0.45)",
  },
  wrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 560,
    alignSelf: "center",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: FIELD_HEIGHT,
    paddingHorizontal: spacing.xxs + 2,
    borderRadius: radius.full,
    borderWidth: 2,
  },
  round: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIcon: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  input: {
    flex: 1,
    minHeight: touchTarget.min,
    fontFamily: fontFamily.sans,
    paddingVertical: 0,
  },
  closeButton: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  clear: {
    width: touchTarget.min - 8,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    marginTop: spacing.xs,
    maxHeight: 440,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  panelContent: {
    paddingVertical: spacing.xs,
  },
  section: {
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowTitle: {
    fontFamily: fontFamily.sansSemiBold,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  cityMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  state: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  empty: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  center: {
    textAlign: "center",
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  flex: {
    flex: 1,
  },
});

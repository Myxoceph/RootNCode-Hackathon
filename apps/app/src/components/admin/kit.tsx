import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";

import { DataError } from "@/data";

import { usePanel } from "./panel";

/**
 * The admin panel's building blocks: a white frame on a soft backdrop, soft grey tiles inside it,
 * pill buttons in varak gold and round dark icon buttons. Hanken Grotesk for the interface and
 * IBM Plex Mono for codes. The panel is made for the web (a mouse, a wide screen) and still works narrow.
 */

export type IconName = ComponentProps<typeof Ionicons>["name"];
/** Pressable's state on the web also says whether the pointer is over it. */
type PressState = { pressed: boolean; hovered?: boolean };

/** Colors the panel adds to the theme: soft tints behind badges and stat icons. */
export function useAdminColors() {
  const theme = useTheme();
  const dark = theme.scheme === "dark";
  const c = theme.colors;
  return {
    ...c,
    dark,
    /** Behind the frame. */
    page: dark ? palette.gece1000 : "#E3E5EC",
    /** The big rounded frame that holds the side bar and the page. */
    frame: dark ? palette.gece950 : palette.white,
    /** Tiles inside the frame. */
    card: dark ? palette.gece900 : "#F3F4F7",
    /** Fields and small boxes inside a tile. */
    well: dark ? palette.gece800 : palette.white,
    line: dark ? "#232D41" : "#E6E8EE",
    hover: dark ? "rgba(255,255,255,0.05)" : "rgba(16,24,40,0.045)",
    /** Pill buttons and the picked side bar link. */
    accent: palette.altin300,
    accentHover: palette.altin200,
    onAccent: palette.gece950,
    /** Round icon buttons and dark marks: navy on light, near-white on dark. */
    ink: dark ? palette.gece100 : palette.gece900,
    onInk: dark ? palette.gece950 : palette.white,
    shadow: dark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(16,24,40,0.05)",
    gold: dark ? palette.altin300 : palette.altin700,
    goldMark: dark ? palette.altin300 : palette.altin600,
    goldSoft: dark ? "rgba(221,181,92,0.14)" : "rgba(156,116,36,0.10)",
    blueSoft: dark ? "rgba(127,163,241,0.14)" : "rgba(30,74,160,0.08)",
    roseSoft: dark ? "rgba(234,178,188,0.14)" : "rgba(160,85,104,0.09)",
    redSoft: dark ? "rgba(238,123,100,0.14)" : "rgba(190,58,38,0.08)",
    greySoft: dark ? "rgba(150,162,182,0.14)" : "rgba(86,97,116,0.09)",
  };
}

export type Tone = "gold" | "blue" | "rose" | "red" | "grey";

function toneColors(tone: Tone, a: ReturnType<typeof useAdminColors>) {
  switch (tone) {
    case "gold":
      return { fg: a.gold, bg: a.goldSoft };
    case "blue":
      return { fg: a.primary, bg: a.blueSoft };
    case "rose":
      return { fg: a.success, bg: a.roseSoft };
    case "red":
      return { fg: a.warning, bg: a.redSoft };
    case "grey":
      return { fg: a.textSecondary, bg: a.greySoft };
  }
}

/** A short status or kind label in a soft tint. */
export function Badge({ tone, label, icon }: { tone: Tone; label: string; icon?: IconName }) {
  const a = useAdminColors();
  const { fg, bg } = toneColors(tone, a);
  return (
    <View style={[kit.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={fg} aria-hidden />}
      <Text colorValue={fg} style={kit.badgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "success";

export function Button({
  label,
  icon,
  kind = "secondary",
  onPress,
  disabled,
  busy,
  small,
  accessibilityLabel,
}: {
  label?: string;
  icon?: IconName;
  kind?: ButtonKind;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
}) {
  const a = useAdminColors();
  const look = {
    primary: { bg: a.accent, fg: a.onAccent, border: a.accent, hover: a.accentHover },
    secondary: { bg: a.well, fg: a.text, border: a.line, hover: a.hover },
    ghost: { bg: "transparent", fg: a.textSecondary, border: "transparent", hover: a.hover },
    danger: { bg: "transparent", fg: a.warning, border: a.dark ? "rgba(238,123,100,0.35)" : "rgba(190,58,38,0.3)", hover: a.redSoft },
    success: { bg: "transparent", fg: a.success, border: a.dark ? "rgba(234,178,188,0.35)" : "rgba(160,85,104,0.3)", hover: a.roseSoft },
  }[kind];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={(state) => {
        const { pressed, hovered } = state as PressState;
        return [
          kit.button,
          small && kit.buttonSmall,
          !label && (small ? kit.iconOnlySmall : kit.iconOnly),
          { backgroundColor: hovered && !off ? look.hover : look.bg, borderColor: look.border },
          kind === "secondary" && hovered && !off && { backgroundColor: a.dark ? palette.gece700 : "#F7F8FA" },
          pressed && { opacity: 0.85 },
          off && { opacity: 0.5 },
        ];
      }}
    >
      {busy ? <ActivityIndicator size="small" color={look.fg} /> : icon && <Ionicons name={icon} size={small ? 15 : 17} color={look.fg} aria-hidden />}
      {label && (
        <Text colorValue={look.fg} style={[kit.buttonText, small && kit.buttonTextSmall]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A soft grey tile inside the frame. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const a = useAdminColors();
  return <View style={[kit.card, padded && kit.cardPadded, { backgroundColor: a.card }, style]}>{children}</View>;
}

/** A round dark button with an icon: the page header's tools. A dot marks something waiting. */
export function IconButton({ icon, label, onPress, dot, light }: { icon: IconName; label: string; onPress: () => void; dot?: boolean; light?: boolean }) {
  const a = useAdminColors();
  const bg = light ? a.well : a.ink;
  const fg = light ? a.text : a.onInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [kit.round, { backgroundColor: bg }, light && { borderWidth: 1, borderColor: a.line }, (state as PressState).hovered && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={18} color={fg} aria-hidden />
      {dot && <View style={[kit.dot, { borderColor: a.frame }]} />}
    </Pressable>
  );
}

/** A card's title row: a title, an optional line under it and actions on the right. */
export function CardHeader({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <View style={kit.cardHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text headingLevel={2} style={kit.cardTitle}>
          {title}
        </Text>
        {hint && (
          <Text variant="caption" color="textSecondary">
            {hint}
          </Text>
        )}
      </View>
      {actions && <View style={kit.row}>{actions}</View>}
    </View>
  );
}

/** The page's title row: the title with a line under it, then the round tools and the page's actions. */
export function PageHeader({ overline, title, hint, actions, tools = true }: { overline?: string; title: string; hint?: string; actions?: ReactNode; /** The round buttons to the review queue and back to the app; off on pages busy with one task. */ tools?: boolean }) {
  const router = useRouter();
  const { pending } = usePanel();
  return (
    <View style={kit.pageHeader}>
      <View style={{ flex: 1, minWidth: 260 }}>
        {overline && (
          <Text color="textSecondary" style={kit.overline}>
            {overline}
          </Text>
        )}
        <Text headingLevel={1} style={kit.pageTitle}>
          {title}
        </Text>
        {hint && (
          <Text color="textSecondary" style={kit.pageHint}>
            {hint}
          </Text>
        )}
      </View>
      <View style={[kit.row, { flexWrap: "wrap", gap: 10 }]}>
        {tools && (
          <>
            <IconButton icon="notifications-outline" label={pending ? `${pending} inceleme bekliyor` : "İnceleme"} dot={!!pending} onPress={() => router.push("/admin/review")} />
            <IconButton icon="map-outline" label="Uygulamaya dön" onPress={() => router.replace("/map")} />
          </>
        )}
        {actions}
      </View>
    </View>
  );
}

/** A count with its label and an icon in a tinted square. */
export function Stat({ icon, tone, label, value, hint, onPress }: { icon: IconName; tone: Tone; label: string; value: string; hint?: string; onPress?: () => void }) {
  const a = useAdminColors();
  const { fg, bg } = toneColors(tone, a);
  const body = (
    <>
      <View style={kit.statTop}>
        <Text color="textSecondary" style={kit.statLabel}>
          {label}
        </Text>
        <View style={[kit.statIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={18} color={fg} aria-hidden />
        </View>
      </View>
      <Text style={kit.statValue}>{value}</Text>
      {hint && (
        <Text variant="caption" color="textSecondary">
          {hint}
        </Text>
      )}
    </>
  );
  if (!onPress) return <Card style={kit.stat}>{body}</Card>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={(state) => [kit.card, kit.cardPadded, kit.stat, { backgroundColor: (state as PressState).hovered ? a.hover : a.card }]}
    >
      {body}
    </Pressable>
  );
}

/** A table: a header row and rows of cells that share column widths (flex weights). */
export interface Column {
  label: string;
  /** Flex weight; a fixed width wins. */
  flex?: number;
  width?: number;
  align?: "left" | "right";
}

export function TableHead({ columns }: { columns: Column[] }) {
  const a = useAdminColors();
  return (
    <View style={[kit.tr, kit.thead, { borderBottomColor: a.line }]}>
      {columns.map((column) => (
        <View key={column.label} style={cellBox(column)}>
          <Text color="textSecondary" style={[kit.th, column.align === "right" && { textAlign: "right" }]} numberOfLines={1}>
            {column.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TableRow({ columns, cells, last }: { columns: Column[]; cells: ReactNode[]; last?: boolean }) {
  const a = useAdminColors();
  const [hovered, setHovered] = useState(false);
  return (
    <View
      // The web's pointer events, for the row's hover tint.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={[kit.tr, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: a.line }, hovered && { backgroundColor: a.hover }]}
    >
      {cells.map((cell, i) => (
        <View key={i} style={[cellBox(columns[i]!), columns[i]!.align === "right" && { alignItems: "flex-end" }]}>
          {cell}
        </View>
      ))}
    </View>
  );
}

function cellBox(column: Column): ViewStyle {
  return column.width ? { width: column.width, paddingHorizontal: 12 } : { flex: column.flex ?? 1, minWidth: 0, paddingHorizontal: 12 };
}

/** Text in a table cell: the main line and a quieter one under it. */
export function Cell({ title, sub, mono }: { title: string; sub?: string | null; mono?: boolean }) {
  return (
    <View style={{ minWidth: 0 }}>
      <Text style={[kit.cellTitle, mono && kit.mono]} numberOfLines={1}>
        {title}
      </Text>
      {sub ? (
        <Text color="textSecondary" style={kit.cellSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Initials in a round tile, for people. */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const a = useAdminColors();
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toLocaleUpperCase("tr"))
      .join("") || "?";
  return (
    <View style={[kit.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: a.goldSoft, borderColor: a.dark ? "rgba(221,181,92,0.35)" : "rgba(156,116,36,0.25)" }]}>
      <Text colorValue={a.gold} style={[kit.avatarText, { fontSize: size * 0.38 }]}>
        {initials}
      </Text>
    </View>
  );
}

/** A row of choices, one picked: filters and small enums. */
export function Segments<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string; count?: number }>; value: T; onChange: (value: T) => void; label: string }) {
  const a = useAdminColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[kit.segments, { backgroundColor: a.card, borderColor: "transparent" }]}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.value)}
            style={(state) => [kit.segment, on && { backgroundColor: a.ink }, !on && (state as PressState).hovered && { backgroundColor: a.hover }]}
          >
            <Text colorValue={on ? a.onInk : a.textSecondary} style={kit.segmentText}>
              {option.label}
            </Text>
            {option.count !== undefined && option.count > 0 && (
              <View style={[kit.segmentCount, { backgroundColor: on ? a.accent : a.greySoft }]}>
                <Text colorValue={on ? a.onAccent : a.textSecondary} style={kit.segmentCountText}>
                  {option.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A labelled text field. */
export function Field({ label, hideLabel, hint, error, style, ...input }: TextInputProps & { label: string; hideLabel?: boolean; hint?: string; error?: string | null; style?: StyleProp<ViewStyle> }) {
  const a = useAdminColors();
  const [focused, setFocused] = useState(false);
  // A long text grows its box instead of scrolling inside it.
  const [height, setHeight] = useState(0);
  return (
    <View style={[kit.field, style]}>
      {label && !hideLabel ? <Text style={kit.fieldLabel}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label || undefined}
        placeholderTextColor={a.textSecondary}
        {...input}
        onContentSizeChange={(event) => {
          if (input.multiline) setHeight(Math.ceil(event.nativeEvent.contentSize.height));
          input.onContentSizeChange?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[
          kit.input,
          input.multiline && [kit.inputMulti, { height: Math.max(110, height) }],
          { color: a.text, backgroundColor: a.well, borderColor: error ? a.warning : focused ? a.goldMark : a.line },
          focused && { boxShadow: `0 0 0 3px ${a.goldSoft}` },
          // @ts-expect-error: the web's own focus outline is replaced by the gold ring.
          { outlineStyle: "none" },
        ]}
      />
      {error ? (
        <Text colorValue={a.warning} style={kit.fieldHint}>
          {error}
        </Text>
      ) : hint ? (
        <Text color="textSecondary" style={kit.fieldHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A pill search box with a magnifier and a clear button, as tall as `Segments`: for a page's filter row. */
export function SearchField({ value, onChangeText, placeholder, label, style }: { value: string; onChangeText: (text: string) => void; placeholder: string; label: string; style?: StyleProp<ViewStyle> }) {
  const a = useAdminColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[kit.search, { backgroundColor: a.card, borderColor: focused ? a.goldMark : "transparent" }, focused && { boxShadow: `0 0 0 3px ${a.goldSoft}` }, style]}>
      <Ionicons name="search" size={17} color={a.textSecondary} aria-hidden />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={a.textSecondary}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // @ts-expect-error: the web's own focus outline is replaced by the gold ring.
        style={[kit.searchInput, { color: a.text, outlineStyle: "none" }]}
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Aramayı temizle" onPress={() => onChangeText("")} hitSlop={6}>
          <Ionicons name="close-circle" size={17} color={a.textSecondary} aria-hidden />
        </Pressable>
      )}
    </View>
  );
}

/** A labelled choice from a long list, with search: cities, asset types, eras. */
export function Picker({
  label,
  value,
  options,
  onChange,
  placeholder = "Seç",
  allowEmpty,
  hint,
  hideLabel,
  float,
}: {
  label: string;
  /** Kept for screen readers only, as in a table under its column's name. */
  hideLabel?: boolean;
  /** The list opens over what is below instead of pushing it down, as in a table row. */
  float?: boolean;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  hint?: string;
}) {
  const a = useAdminColors();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const picked = options.find((option) => option.value === value);
  // An opened list below the fold scrolls the page just enough to show it.
  const menu = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const timer = setTimeout(() => {
      const node = menu.current as unknown as HTMLElement | null;
      let box = node?.parentElement ?? null;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      if (!node || !box) return;
      const below = node.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom + 16;
      if (below > 0) box.scrollBy({ top: below, behavior: "smooth" });
    }, 30);
    return () => clearTimeout(timer);
  }, [open]);
  const needle = search.trim().toLocaleLowerCase("tr");
  const shown = needle ? options.filter((option) => option.label.toLocaleLowerCase("tr").includes(needle)) : options;
  return (
    <View style={[kit.field, open && { zIndex: 20 }]}>
      {!hideLabel && <Text style={kit.fieldLabel}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${picked?.label ?? placeholder}`}
        onPress={() => setOpen(!open)}
        style={[kit.input, kit.pickerButton, { backgroundColor: a.well, borderColor: open ? a.goldMark : a.line }]}
      >
        <Text colorValue={picked ? a.text : a.textSecondary} style={kit.pickerText} numberOfLines={1}>
          {picked?.label ?? placeholder}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={a.textSecondary} aria-hidden />
      </Pressable>
      {open && (
        <View ref={menu} style={[kit.pickerMenu, float && kit.pickerFloat, { backgroundColor: a.well, borderColor: a.line }]}>
          {options.length > 8 && (
            <TextInput
              autoFocus
              value={search}
              onChangeText={setSearch}
              placeholder="Ara…"
              placeholderTextColor={a.textSecondary}
              accessibilityLabel={`${label} ara`}
              // @ts-expect-error: no web focus outline inside the menu.
              style={[kit.pickerSearch, { color: a.text, borderBottomColor: a.line, outlineStyle: "none" }]}
            />
          )}
          <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
            {allowEmpty && (
              <MenuItem
                // The empty choice reads as the box does when nothing is picked.
                label={placeholder === "Seç" ? "Belirtilmemiş" : placeholder}
                muted
                selected={value === null}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              />
            )}
            {shown.map((option) => (
              <MenuItem
                key={option.value}
                label={option.label}
                selected={option.value === value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
              />
            ))}
            {shown.length === 0 && (
              <Text color="textSecondary" style={{ padding: 12, fontSize: 14 }}>
                Sonuç yok
              </Text>
            )}
          </ScrollView>
        </View>
      )}
      {hint && (
        <Text color="textSecondary" style={kit.fieldHint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

function MenuItem({ label, selected, muted, onPress }: { label: string; selected: boolean; muted?: boolean; onPress: () => void }) {
  const a = useAdminColors();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [kit.menuItem, (state as PressState).hovered && { backgroundColor: a.hover }, selected && { backgroundColor: a.goldSoft }]}
    >
      <Text colorValue={muted ? a.textSecondary : a.text} style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {selected && <Ionicons name="checkmark" size={16} color={a.gold} aria-hidden />}
    </Pressable>
  );
}

/** An on/off switch with its label. */
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (value: boolean) => void; hint?: string }) {
  const a = useAdminColors();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={kit.toggleRow}>
      <View style={[kit.toggleTrack, { backgroundColor: value ? a.goldMark : a.dark ? palette.gece700 : palette.gece200 }]}>
        <View style={[kit.toggleKnob, { transform: [{ translateX: value ? 18 : 0 }] }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={kit.toggleLabel}>{label}</Text>
        {hint && (
          <Text color="textSecondary" style={kit.fieldHint}>
            {hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** A panel that slides over the page's right side: forms. */
export function Sheet({ title, hint, onClose, children, footer }: { title: string; hint?: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const a = useAdminColors();
  useEscape(onClose);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={kit.overlay} accessibilityViewIsModal>
      <Pressable accessibilityLabel="Kapat" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(6,8,13,0.45)" }]} />
      <View style={[kit.sheet, { backgroundColor: a.frame, borderLeftColor: a.line }]}>
        <View style={[kit.sheetHead, { borderBottomColor: a.line }]}>
          <View style={{ flex: 1 }}>
            <Text headingLevel={2} style={kit.sheetTitle}>
              {title}
            </Text>
            {hint && (
              <Text variant="caption" color="textSecondary">
                {hint}
              </Text>
            )}
          </View>
          <Button icon="close" kind="ghost" onPress={onClose} accessibilityLabel="Kapat" />
        </View>
        <ScrollView contentContainerStyle={kit.sheetBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={[kit.sheetFoot, { borderTopColor: a.line }]}>{footer}</View>
      </View>
    </View>
    </Modal>
  );
}

/** A question before something that cannot be taken back. */
export function Confirm({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const a = useAdminColors();
  useEscape(onCancel);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
    <View style={[kit.overlay, kit.centered]} accessibilityViewIsModal>
      <Pressable accessibilityLabel="Vazgeç" onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(6,8,13,0.5)" }]} />
      <View style={[kit.dialog, { backgroundColor: a.frame, borderColor: a.line }]}>
        <View style={[kit.dialogIcon, { backgroundColor: danger ? a.redSoft : a.goldSoft }]}>
          <Ionicons name={danger ? "warning-outline" : "help-circle-outline"} size={22} color={danger ? a.warning : a.gold} aria-hidden />
        </View>
        <Text headingLevel={2} style={kit.sheetTitle}>
          {title}
        </Text>
        <Text color="textSecondary" style={{ fontSize: 15, lineHeight: 22 }}>
          {body}
        </Text>
        {children}
        <View style={[kit.row, { justifyContent: "flex-end", marginTop: 8 }]}>
          <Button label="Vazgeç" kind="ghost" onPress={onCancel} />
          <Button label={confirmLabel} kind={danger ? "danger" : "primary"} onPress={onConfirm} busy={busy} />
        </View>
      </View>
    </View>
    </Modal>
  );
}

function useEscape(onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const listener = (event: KeyboardEvent) => event.key === "Escape" && latest.current();
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
}

/** A message in the page's corner after an action, gone by itself. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, tone });
    timer.current = setTimeout(() => setToast(null), 3600);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return { toast, show };
}

export function Toast({ toast }: { toast: { text: string; tone: "ok" | "error" } | null }) {
  const a = useAdminColors();
  if (!toast) return null;
  const ok = toast.tone === "ok";
  return (
    <View accessibilityLiveRegion="polite" style={[kit.toast, { backgroundColor: a.dark ? palette.gece800 : palette.gece900 }]}>
      <Ionicons name={ok ? "checkmark-circle" : "alert-circle"} size={18} color={ok ? palette.gulkurusu300 : palette.mercan300} aria-hidden />
      <Text colorValue={palette.gece50} style={{ fontSize: 14, flexShrink: 1 }}>
        {toast.text}
      </Text>
    </View>
  );
}

/** A request's answer for a screen: loading, the data or the error, and how to ask again. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    load().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error: unknown) => active && setState((previous) => ({ data: previous.data, error: errorText(error), loading: false })),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, round]);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { ...state, reload, setData: (data: T) => setState((previous) => ({ ...previous, data })) };
}

export function errorText(error: unknown): string {
  return error instanceof DataError ? error.message : "Beklenmeyen bir hata oluştu.";
}

/** Shown in place of a list: nothing yet, still loading, or an error with a retry. */
export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const a = useAdminColors();
  return (
    <View style={kit.empty}>
      <View style={[kit.emptyIcon, { backgroundColor: a.goldSoft }]}>
        <Ionicons name={icon} size={24} color={a.gold} aria-hidden />
      </View>
      <Text style={kit.emptyTitle}>{title}</Text>
      {body && (
        <Text color="textSecondary" style={{ fontSize: 14, textAlign: "center", maxWidth: 360 }}>
          {body}
        </Text>
      )}
      {action}
    </View>
  );
}

export function Loading() {
  const a = useAdminColors();
  return (
    <View style={kit.empty}>
      <ActivityIndicator color={a.goldMark} />
    </View>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Empty icon="cloud-offline-outline" title="Yüklenemedi" body={message} action={<Button label="Tekrar dene" icon="refresh" onPress={onRetry} />} />;
}

/** "12 Kas 2026" and "12 Kas 2026, 14:05". */
export function formatDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  return withTime ? `${day}, ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : day;
}

/** "3 dk önce", "2 sa önce", "5 gün önce", then the date. */
export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  return formatDate(iso);
}

export const formatNumber = (n: number) => n.toLocaleString("tr-TR");

export const kit = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  centered: { alignItems: "center", justifyContent: "center" },
  mono: { fontFamily: fontFamily.mono },
  overline: { fontFamily: fontFamily.sansMedium, fontSize: 13, marginBottom: 2 },
  pageHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 },
  pageTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 26, lineHeight: 34, letterSpacing: -0.6 },
  pageHint: { fontSize: 13, lineHeight: 19, marginTop: 2, maxWidth: 640 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontFamily: fontFamily.sansSemiBold, fontSize: 12, lineHeight: 17 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 40, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1 },
  buttonSmall: { height: 32, paddingHorizontal: 13, gap: 5 },
  iconOnly: { width: 40, paddingHorizontal: 0 },
  iconOnlySmall: { width: 32, paddingHorizontal: 0 },
  buttonText: { fontFamily: fontFamily.sansSemiBold, fontSize: 14, lineHeight: 18 },
  buttonTextSmall: { fontSize: 13 },
  card: { borderRadius: 24, overflow: "visible" },
  cardPadded: { padding: 20 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  cardTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 17, lineHeight: 24, letterSpacing: -0.3 },
  stat: { flex: 1, minWidth: 160, gap: 6 },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statLabel: { fontFamily: fontFamily.sansMedium, fontSize: 14 },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: fontFamily.sansBold, fontSize: 30, lineHeight: 38, letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  tr: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingHorizontal: 8 },
  thead: { minHeight: 44, borderBottomWidth: 1 },
  th: { fontFamily: fontFamily.sansMedium, fontSize: 12.5 },
  cellTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 14, lineHeight: 20 },
  cellSub: { fontSize: 13, lineHeight: 18 },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  avatarText: { fontFamily: fontFamily.sansBold },
  segments: { flexDirection: "row", padding: 4, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start", gap: 2 },
  segment: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 999 },
  segmentText: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  segmentCount: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  segmentCountText: { fontFamily: fontFamily.monoMedium, fontSize: 11 },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  fieldHint: { fontSize: 12, lineHeight: 17 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontFamily: fontFamily.sans, fontSize: 14 },
  inputMulti: { minHeight: 110, paddingTop: 10, textAlignVertical: "top" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  searchInput: { flex: 1, minWidth: 0, height: "100%", fontFamily: fontFamily.sans, fontSize: 14 },
  pickerButton: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerText: { flex: 1, fontSize: 14 },
  pickerFloat: { position: "absolute", top: 50, left: 0, right: 0, minWidth: 200 },
  pickerMenu: { borderWidth: 1, borderRadius: 16, overflow: "hidden", boxShadow: "0 12px 32px rgba(6,8,13,0.18)" },
  pickerSearch: { height: 40, paddingHorizontal: 12, borderBottomWidth: 1, fontFamily: fontFamily.sans, fontSize: 14 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, padding: 2 },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: palette.white },
  toggleLabel: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  overlay: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  sheet: { width: 520, maxWidth: "100%", height: "100%", borderLeftWidth: 1, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, overflow: "hidden", boxShadow: "-24px 0 48px rgba(6,8,13,0.22)" },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1 },
  sheetTitle: { fontFamily: fontFamily.sansBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.4 },
  sheetBody: { padding: 24, gap: 18 },
  sheetFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1 },
  dialog: { width: 440, maxWidth: "92%", borderRadius: 28, borderWidth: 1, padding: 24, gap: 10, boxShadow: "0 24px 64px rgba(6,8,13,0.3)" },
  dialogIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  toast: { position: "absolute", bottom: 24, right: 24, zIndex: 60, flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 420, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, boxShadow: "0 12px 32px rgba(6,8,13,0.3)" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 2, backgroundColor: palette.altin300 },
  emptyTitle: { fontFamily: fontFamily.sansBold, fontSize: 16 },
});

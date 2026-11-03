import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, Text } from "@vagabonds/ui";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Button, Card, Field, Segments, useAdminColors } from "./kit";

/**
 * The asset editor's inputs: a Turkish text with its English one step away, numbers, confidence,
 * tags, and lists whose items can be added, folded, moved and removed.
 */

export type Pair = { tr: string; en: string | null };

/** A Turkish text, with an "EN" switch that opens its English one. An optional text is null when both are empty. */
export function PairField({
  label,
  value,
  onChange,
  optional,
  multiline,
  placeholder,
  hint,
  required,
}: {
  label: string;
  value: Pair | null;
  onChange: (value: Pair | null) => void;
  optional?: boolean;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const a = useAdminColors();
  const current = value ?? { tr: "", en: null };
  const [english, setEnglish] = useState(current.en !== null && current.en !== "");
  const set = (next: Pair) => onChange(optional && !next.tr.trim() && !next.en?.trim() ? null : next);
  return (
    <View style={styles.pair}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? " *" : ""}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: english }}
          accessibilityLabel={`${label}: İngilizcesi`}
          onPress={() => setEnglish(!english)}
          style={[styles.en, { backgroundColor: english ? a.ink : a.card }]}
        >
          <Text colorValue={english ? a.onInk : a.textSecondary} style={styles.enText}>
            EN
          </Text>
        </Pressable>
      </View>
      <Field label="" accessibilityLabel={label} value={current.tr} onChangeText={(tr) => set({ ...current, tr })} multiline={multiline} placeholder={placeholder} hint={hint} />
      {english && (
        <Field
          label=""
          accessibilityLabel={`${label} (İngilizce)`}
          value={current.en ?? ""}
          onChangeText={(en) => set({ ...current, en: en === "" ? null : en })}
          multiline={multiline}
          placeholder="English"
        />
      )}
    </View>
  );
}

/** A plain text that is null when empty. */
export function TextField({ label, value, onChange, placeholder, multiline, hint, required }: { label: string; value: string | null; onChange: (value: string | null) => void; placeholder?: string; multiline?: boolean; hint?: string; required?: boolean }) {
  return <Field label={required ? `${label} *` : label} value={value ?? ""} onChangeText={(text) => onChange(text === "" ? null : text)} placeholder={placeholder} multiline={multiline} hint={hint} />;
}

/** A whole number, or null when empty. */
export function NumberField({ label, value, onChange, placeholder, hint }: { label: string; value: number | null; onChange: (value: number | null) => void; placeholder?: string; hint?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const bad = text.trim() !== "" && !/^-?\d+$/.test(text.trim());
  return (
    <Field
      label={label}
      value={text}
      keyboardType="number-pad"
      placeholder={placeholder}
      hint={hint}
      error={bad ? "Tam sayı yaz" : null}
      onChangeText={(next) => {
        setText(next);
        const trimmed = next.trim();
        if (trimmed === "") onChange(null);
        else if (/^-?\d+$/.test(trimmed)) onChange(Number(trimmed));
      }}
    />
  );
}

/** A labelled row of choices. */
export function ChoiceField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <View style={styles.pair}>
      <Text style={styles.label}>{label}</Text>
      <Segments label={label} value={value} options={options} onChange={onChange} />
    </View>
  );
}

const CONFIDENCE = [
  { value: "certain", label: "Kesin" },
  { value: "probable", label: "Muhtemel" },
  { value: "disputed", label: "Tartışmalı" },
  { value: "legend", label: "Rivayet" },
] as const;

export type ConfidenceCode = (typeof CONFIDENCE)[number]["value"];

/** How sure the record is; "Belirtilmemiş" only where the field may have none. */
export function ConfidenceField({ value, onChange, optional }: { value: ConfidenceCode | null; onChange: (value: ConfidenceCode | null) => void; optional?: boolean }) {
  const options = optional ? [{ value: "none" as const, label: "Belirtilmemiş" }, ...CONFIDENCE] : [...CONFIDENCE];
  return (
    <ChoiceField
      label="Güven"
      value={(value ?? "none") as ConfidenceCode | "none"}
      options={options as Array<{ value: ConfidenceCode | "none"; label: string }>}
      onChange={(next) => onChange(next === "none" ? null : (next as ConfidenceCode))}
    />
  );
}

/** Words added with Enter or a comma, removed with their ×. */
export function TagsField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const a = useAdminColors();
  const [draft, setDraft] = useState("");
  const add = (text: string) => {
    const words = text.split(",").map((w) => w.trim()).filter(Boolean);
    if (words.length) onChange([...values, ...words.filter((w) => !values.includes(w))]);
    setDraft("");
  };
  return (
    <View style={styles.pair}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.tags, { backgroundColor: a.well, borderColor: a.line }]}>
        {values.map((value) => (
          <View key={value} style={[styles.tag, { backgroundColor: a.card }]}>
            <Text style={{ fontSize: 12.5 }}>{value}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${value} kaldır`} onPress={() => onChange(values.filter((v) => v !== value))} hitSlop={6}>
              <Ionicons name="close" size={13} color={a.textSecondary} aria-hidden />
            </Pressable>
          </View>
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => (text.endsWith(",") ? add(text) : setDraft(text))}
          onSubmitEditing={() => add(draft)}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length ? "" : placeholder}
          placeholderTextColor={a.textSecondary}
          accessibilityLabel={label}
          blurOnSubmit={false}
          // @ts-expect-error: no web focus outline inside the box.
          style={[styles.tagInput, { color: a.text, outlineStyle: "none" }]}
        />
      </View>
    </View>
  );
}

/** A group of fields, titled unless it is the only one. */
export function Group({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <Card style={{ gap: 16 }}>
      {(title || hint) && (
        <View style={{ gap: 2 }}>
          {title && <Text style={styles.groupTitle}>{title}</Text>}
          {hint && (
            <Text color="textSecondary" style={{ fontSize: 12.5, lineHeight: 18 }}>
              {hint}
            </Text>
          )}
        </View>
      )}
      {children}
    </Card>
  );
}

/** Two fields side by side, one under the other when narrow. */
export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Cell({ children, grow = 1 }: { children: ReactNode; grow?: number }) {
  return <View style={{ flexGrow: grow, flexBasis: 180, minWidth: 0 }}>{children}</View>;
}

/**
 * A list of items, each folded to its title until opened. New items open at once. Items move up and
 * down and are removed with their buttons.
 */
export function ListField<T>({
  title,
  hint,
  items,
  onChange,
  make,
  titleOf,
  render,
  addLabel,
  empty,
}: {
  title?: string;
  hint?: string;
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  titleOf: (item: T, index: number) => string;
  render: (item: T, update: (item: T) => void, index: number) => ReactNode;
  /** Empty when items cannot be added here. */
  addLabel: string;
  empty: string;
}) {
  const a = useAdminColors();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpen((now) => (now.has(i) ? new Set([...now].filter((x) => x !== i)) : new Set([...now, i])));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
    setOpen((now) => new Set([...now].map((x) => (x === i ? j : x === j ? i : x))));
  };
  return (
    <Group title={title && `${title}${items.length ? ` · ${items.length}` : ""}`} hint={hint}>
      {items.length === 0 && (
        <Text color="textSecondary" style={{ fontSize: 13 }}>
          {empty}
        </Text>
      )}
      <View style={{ gap: 8 }}>
        {items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <View key={i} style={[styles.item, { backgroundColor: a.well, borderColor: isOpen ? a.goldMark : a.line }]}>
              <View style={styles.itemHead}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => toggle(i)} style={styles.itemToggle}>
                  <View style={[styles.itemNumber, { backgroundColor: a.card }]}>
                    <Text style={styles.itemNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {titleOf(item, i) || "Başlıksız"}
                  </Text>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={a.textSecondary} aria-hidden />
                </Pressable>
                <Button small kind="ghost" icon="arrow-up" accessibilityLabel="Yukarı taşı" disabled={i === 0} onPress={() => move(i, -1)} />
                <Button small kind="ghost" icon="arrow-down" accessibilityLabel="Aşağı taşı" disabled={i === items.length - 1} onPress={() => move(i, 1)} />
                <Button
                  small
                  kind="ghost"
                  icon="trash-outline"
                  accessibilityLabel="Kaldır"
                  onPress={() => {
                    onChange(items.filter((_, x) => x !== i));
                    setOpen((now) => new Set([...now].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))));
                  }}
                />
              </View>
              {isOpen && (
                <View style={styles.itemBody}>
                  {render(item, (next) => onChange(items.map((old, x) => (x === i ? next : old))), i)}
                </View>
              )}
            </View>
          );
        })}
      </View>
      {addLabel ? (
      <View style={{ alignItems: "flex-start" }}>
        <Button
          small
          label={addLabel}
          icon="add"
          onPress={() => {
            onChange([...items, make()]);
            setOpen((now) => new Set([...now, items.length]));
          }}
        />
      </View>
      ) : null}
    </Group>
  );
}

/** A new item's id: unique, lowercase, kept while the item lives. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const styles = StyleSheet.create({
  pair: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  en: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  enText: { fontFamily: fontFamily.sansBold, fontSize: 10.5, letterSpacing: 0.6 },
  groupTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, letterSpacing: -0.2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingLeft: 10, paddingRight: 8, paddingVertical: 4 },
  tagInput: { flexGrow: 1, minWidth: 120, height: 30, fontFamily: fontFamily.sans, fontSize: 14 },
  item: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 6 },
  itemToggle: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  itemNumber: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemNumberText: { fontFamily: fontFamily.sansBold, fontSize: 11.5 },
  itemTitle: { flex: 1, fontFamily: fontFamily.sansSemiBold, fontSize: 13.5 },
  itemBody: { gap: 14, paddingHorizontal: 14, paddingBottom: 14 },
});

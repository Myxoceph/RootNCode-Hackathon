import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, Text } from "@vagabonds/ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Field, Segments, useAdminColors, type IconName } from "./kit";

/** The asset editor's inputs: plain texts, numbers, choices, tags, and rows to set them side by side. */

/** The DOM id of a record field's input, so the phone preview can send the editor to it. */
export const fieldId = (field: string) => `field-${field}`;

/** A plain text that is null when empty. */
export function TextField({ label, value, onChange, placeholder, multiline, hint, required, id }: { label: string; value: string | null; onChange: (value: string | null) => void; placeholder?: string; multiline?: boolean; hint?: string; required?: boolean; id?: string }) {
  return <Field nativeID={id && fieldId(id)} label={required ? `${label} *` : label} value={value ?? ""} onChangeText={(text) => onChange(text === "" ? null : text)} placeholder={placeholder} multiline={multiline} hint={hint} />;
}

/** A whole number, or null when empty. */
export function NumberField({ label, hideLabel, value, onChange, placeholder, hint, id }: { label: string; hideLabel?: boolean; value: number | null; onChange: (value: number | null) => void; placeholder?: string; hint?: string; id?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const bad = text.trim() !== "" && !/^-?\d+$/.test(text.trim());
  return (
    <Field
      nativeID={id && fieldId(id)}
      label={label}
      hideLabel={hideLabel}
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

/**
 * A text in Turkish and English: one label, one box, a line for each language.
 */
export function BilingualField({ label, tr, en, onTr, onEn, placeholder, placeholderEn, multiline, id, hideLabel, hint, stacked }: { label: string; tr: string; en: string; onTr: (text: string) => void; onEn: (text: string) => void; placeholder?: string; placeholderEn?: string; multiline?: boolean; id?: string; /** Kept for screen readers only, as in a table under its column's name. */ hideLabel?: boolean; hint?: string; /** For a narrow box: each language's name above its line. */ stacked?: boolean }) {
  const a = useAdminColors();
  const [focused, setFocused] = useState<"tr" | "en" | null>(null);
  // A long text grows its box instead of scrolling inside it.
  const [heights, setHeights] = useState({ tr: 0, en: 0 });
  const line = (lang: "tr" | "en") => {
    const english = lang === "en";
    return (
      <View style={[styles.langLine, stacked && styles.langStacked, english && { borderTopWidth: 1, borderTopColor: a.line }]}>
        <View style={[styles.langTag, stacked && styles.langTagStacked]}>
          <Text color="textSecondary" style={styles.langName}>
            {english ? "İngilizce" : "Türkçe"}
          </Text>
        </View>
        <TextInput
          nativeID={!english && id ? fieldId(id) : undefined}
          accessibilityLabel={english ? `${label} (İngilizce)` : label}
          value={english ? en : tr}
          onChangeText={english ? onEn : onTr}
          placeholder={english ? placeholderEn : placeholder}
          placeholderTextColor={a.textSecondary}
          multiline={multiline}
          onContentSizeChange={multiline ? (e) => { const h = e.nativeEvent.contentSize.height; setHeights((old) => (old[lang] === h ? old : { ...old, [lang]: h })); } : undefined}
          onFocus={() => setFocused(lang)}
          onBlur={() => setFocused(null)}
          // @ts-expect-error: the web's own focus outline is replaced by the gold ring.
          style={[styles.langInput, stacked && { paddingTop: 2 }, multiline && [styles.langInputMulti, { height: Math.max(72, heights[lang]) }], { color: a.text, outlineStyle: "none" }]}
        />
      </View>
    );
  };
  return (
    <View {...({ dataSet: { phone: id } } as object)} style={styles.pair}>
      {!hideLabel && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.langBox, { backgroundColor: a.well, borderColor: focused ? a.goldMark : a.line }, focused && { boxShadow: `0 0 0 3px ${a.goldSoft}` }]}>
        {line("tr")}
        {line("en")}
      </View>
      {hint && (
        <Text color="textSecondary" style={styles.hint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

/**
 * A formatted text: a toolbar over the box writes the marks the dossier reads (see `rich-text.tsx`),
 * on the selected words or the lines the cursor is on.
 */
export function RichTextField({ label, value, onChange, placeholder, id, hint }: { label: string; value: string; onChange: (text: string) => void; placeholder?: string; id?: string; hint?: string }) {
  const a = useAdminColors();
  const own = useId();
  const domId = id ? fieldId(id) : `rich-${own}`;
  const boxOf = () => (typeof document === "undefined" ? null : (document.getElementById(domId) as HTMLTextAreaElement | null));
  // A toolbar press takes the focus; once the new text is in the box, it gets the focus back with
  // the cursor (or the sample words, selected) where the change ends.
  const pending = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const box = boxOf();
    if (!pending.current || !box) return;
    box.focus();
    box.setSelectionRange(pending.current.start, pending.current.end);
    pending.current = null;
  });
  // What is in the box and selected right now; the box keeps its selection while a button is pressed.
  const now = () => {
    const box = boxOf();
    return { text: box?.value ?? value, start: box?.selectionStart ?? value.length, end: box?.selectionEnd ?? value.length };
  };
  const apply = (next: string, start: number, end: number) => {
    pending.current = { start, end };
    onChange(next);
  };
  // Bold and italic wrap the words; with nothing selected they write a sample to type over.
  const wrap = (mark: string, sample: string) => {
    const { text, start, end } = now();
    const words = text.slice(start, end) || sample;
    apply(`${text.slice(0, start)}${mark}${words}${mark}${text.slice(end)}`, start + mark.length, start + mark.length + words.length);
  };
  // A heading, a list or a quote marks whole lines; pressing again takes the mark off.
  const lines = (mark: string) => {
    const { text, start, end } = now();
    const from = text.lastIndexOf("\n", start - 1) + 1;
    const toBreak = text.indexOf("\n", end);
    const to = toBreak < 0 ? text.length : toBreak;
    const picked = text.slice(from, to).split("\n");
    const marked = picked.every((line) => line.startsWith(mark));
    const strip = (line: string) => line.replace(/^(## |- |> )/, "");
    const changed = picked.map((line) => (marked ? line.slice(mark.length) : `${mark}${strip(line)}`)).join("\n");
    apply(`${text.slice(0, from)}${changed}${text.slice(to)}`, from + changed.length, from + changed.length);
  };
  const paragraph = () => {
    const { text, end } = now();
    apply(`${text.slice(0, end)}\n\n${text.slice(end)}`, end + 2, end + 2);
  };
  const tools: Array<{ icon?: IconName; glyph?: "bold" | "italic"; label: string; run: () => void }> = [
    { icon: "text-outline", label: "Alt başlık", run: () => lines("## ") },
    { icon: "reorder-four-outline", label: "Paragraf", run: paragraph },
    { glyph: "bold", label: "Kalın", run: () => wrap("**", "kalın yazı") },
    { glyph: "italic", label: "Eğik", run: () => wrap("_", "eğik yazı") },
    { icon: "list-outline", label: "Liste", run: () => lines("- ") },
    { icon: "chatbox-ellipses-outline", label: "Alıntı", run: () => lines("> ") },
  ];
  return (
    <View style={styles.pair}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.rich, { borderColor: a.line, backgroundColor: a.well }]}>
        <View accessibilityRole="toolbar" accessibilityLabel={`${label} biçimi`} style={[styles.tools, { borderBottomColor: a.line }]}>
          {tools.map((tool) => (
            <Pressable
              key={tool.label}
              accessibilityRole="button"
              accessibilityLabel={tool.label}
              onPress={tool.run}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tool, hovered && { backgroundColor: a.hover }]}
            >
              {tool.icon ? (
                <Ionicons name={tool.icon} size={15} color={a.text} aria-hidden />
              ) : (
                <Text aria-hidden style={[styles.glyph, tool.glyph === "bold" ? { fontFamily: fontFamily.sansBold } : { fontStyle: "italic" }]}>
                  {tool.glyph === "bold" ? "K" : "E"}
                </Text>
              )}
              <Text style={styles.toolText}>{tool.label}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          nativeID={domId}
          label={label}
          hideLabel
          multiline
          value={value}
          placeholder={placeholder}
          onChangeText={onChange}
          style={styles.richInput}
        />
      </View>
      {hint && (
        <Text color="textSecondary" style={styles.hint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Two fields side by side, one under the other when narrow. */
export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Cell({ children, grow = 1, basis = 180 }: { children: ReactNode; grow?: number; basis?: number }) {
  return <View style={{ flexGrow: grow, flexBasis: basis, minWidth: 0 }}>{children}</View>;
}

/** A new item's id: unique, lowercase, kept while the item lives. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const styles = StyleSheet.create({
  pair: { gap: 6 },
  label: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingLeft: 10, paddingRight: 8, paddingVertical: 4 },
  langBox: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  langLine: { flexDirection: "row", alignItems: "flex-start" },
  langTag: { width: 80, paddingLeft: 12, paddingTop: 13, gap: 1 },
  hint: { fontSize: 12, lineHeight: 17 },
  langName: { fontFamily: fontFamily.sansSemiBold, fontSize: 12 },
  langStacked: { flexDirection: "column", alignItems: "stretch" },
  langTagStacked: { width: "auto", flexDirection: "row", gap: 6, paddingTop: 8 },
  langInput: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, fontFamily: fontFamily.sans, fontSize: 14 },
  langInputMulti: { minHeight: 72, textAlignVertical: "top" },
  rich: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 2, padding: 4, borderBottomWidth: 1 },
  tool: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  glyph: { width: 15, textAlign: "center", fontSize: 14 },
  toolText: { fontFamily: fontFamily.sansMedium, fontSize: 12.5 },
  richInput: { margin: -1 },
  tagInput: { flexGrow: 1, minWidth: 120, height: 30, fontFamily: fontFamily.sans, fontSize: 14 },
});

import Ionicons from "@expo/vector-icons/Ionicons";
import { PHOTO_SUBJECTS, type IntakeDraft, type MetaEnumsResponse } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";

import { localMediaUrl, reviewDraft } from "@/data/admin";

import { getIn, obj, setIn, type Path, type Rec } from "./record-path";
import { CONFIDENCE, Line, Notice, Quotes, quotesOf, Section, SUBJECTS, type Ref } from "./intake-chat";
import { Badge, Button, Card, CardHeader, errorText, Field, Picker, Segments, Toggle, useAdminColors } from "./kit";

/**
 * A new asset's draft as the reviewer corrects it (Y3): the dataset record (data/README.md) in a form,
 * each field beside the sentence it came from, and the rest of the record as JSON. Approving sends the
 * record as corrected; the worker publishes it (H6), validate.py checks it then.
 */

const text = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));
const orNull = (value: string) => (value.trim() === "" ? null : value);
const intOrNull = (value: string) => (/^-?\d+$/.test(value.trim()) ? Number(value.trim()) : null);

const CONFIDENCE_OPTIONS = Object.entries(CONFIDENCE).map(([value, c]) => ({ value, label: c.label }));
const SUBJECT_OPTIONS = PHOTO_SUBJECTS.map((value) => ({ value, label: SUBJECTS[value] ?? value }));
/** What the worker writes as a chat photo's credit until the reviewer names who took it (chat.py). */
const PANEL_CREDIT = "Vagabonds yönetim paneli";
const ASSET_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REASONS = ["Veri setinde zaten var", "Vakıf eseri değil", "Bilgiler doğrulanamıyor", "Kaynak yetersiz"];

/** What the reviewer still has to fix before approving, found in the browser; validate.py checks the rest. */
function problems(record: Rec): string[] {
  const found: string[] = [];
  if (!ASSET_ID.test(text(record["id"]))) found.push("Kimlik küçük harf, rakam ve tireden oluşmalı (ör. manisa-sehzadeler-muradiye-camii).");
  if (!text(getIn(record, ["name", "tr"])).trim()) found.push("Ad boş olamaz.");
  if (!text(getIn(record, ["location", "district"])).trim()) found.push("İlçe boş olamaz.");
  const sections = getIn(record, ["sections"]);
  if (!Array.isArray(sections) || sections.length === 0) found.push("En az bir anlatı bölümü olmalı.");
  else if (sections.some((s) => !text(getIn(s, ["body", "tr"])).trim())) found.push("Boş anlatı bölümü var; doldur ya da kaldır.");
  const spot = obj(getIn(record, ["location", "coordinates"]));
  if (spot) {
    const lat = spot["lat"];
    const lng = spot["lng"];
    if (typeof lat !== "number" || typeof lng !== "number" || lat < 35.5 || lat > 42.5 || lng < 25.5 || lng > 45) {
      found.push("Konum Türkiye içinde bir enlem (35,5-42,5) ve boylam (25,5-45) olmalı; bilinmiyorsa JSON'da kaldır.");
    }
  }
  const media = getIn(record, ["media"]);
  if (Array.isArray(media) && media.some((m) => !text(getIn(m, ["credit"])).trim() || text(getIn(m, ["credit"])) === PANEL_CREDIT)) {
    found.push("Fotoğrafların çekenini (ya da kaynağını) yaz: veri setine lisanssız fotoğraf girmez.");
  }
  for (const key of ["founder", "architect"] as const) {
    const person = obj(record[key]);
    if (person && !text(person["name"]).trim()) found.push(`${key === "founder" ? "Bani" : "Mimar"} adı boş; bilinmiyorsa kaldır.`);
  }
  return found;
}

export function DraftReview({
  draft,
  enums,
  canDecide,
  onShowQuote,
  onDecided,
}: {
  draft: IntakeDraft;
  enums: MetaEnumsResponse | null;
  /** New assets are an admin's call. */
  canDecide: boolean;
  onShowQuote: (ref: Ref) => void;
  onDecided: (draft: IntakeDraft, message: string) => void;
}) {
  const a = useAdminColors();
  const [record, setRecord] = useState<Rec>(() => structuredClone(draft.record));
  const [tab, setTab] = useState<"form" | "json">("form");
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const quotes = useMemo(() => quotesOf(draft), [draft]);
  const changed = JSON.stringify(record) !== JSON.stringify(draft.record);
  const open = draft.status === "pending";
  const left = problems(record);
  const errorsLeft = draft.validation.errors.length > 0 && !changed;
  // A decided draft is shown as it was decided: nothing on it changes.
  const set = (path: Path, value: unknown) => {
    if (open) setRecord((now) => setIn(now, path, value));
  };
  const refs = (...pointers: string[]) => pointers.flatMap((p) => quotes.get(p) ?? []);

  const toJson = () => {
    setJson(JSON.stringify(record, null, 2));
    setJsonError(null);
    setTab("json");
  };
  const fromJson = (next: "form" | null) => {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!obj(parsed)) throw new Error("Kayıt bir JSON nesnesi olmalı.");
      setRecord(parsed as Rec);
      setJsonError(null);
      if (next) setTab(next);
      return true;
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "JSON okunamadı.");
      return false;
    }
  };

  /** The record as it stands now: from the JSON being edited (not yet in state), or the form's. */
  const current = (): Rec | null => {
    if (tab !== "json") return record;
    try {
      const parsed: unknown = JSON.parse(json);
      if (!obj(parsed)) throw new Error("Kayıt bir JSON nesnesi olmalı.");
      setRecord(parsed as Rec);
      setJsonError(null);
      return parsed as Rec;
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "JSON okunamadı.");
      return null;
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    setFailure(null);
    let sent: Rec | undefined;
    if (decision === "approve") {
      const now = current();
      if (!now) return;
      const blockers = problems(now);
      const isChanged = JSON.stringify(now) !== JSON.stringify(draft.record);
      if (blockers.length > 0 || (draft.validation.errors.length > 0 && !isChanged)) {
        setFailure(blockers[0] ?? "Taslakta doğrulama hataları var: ilgili alanı düzelt, onay düzeltilmiş kayıtla gider.");
        return;
      }
      sent = isChanged ? now : undefined;
    }
    setBusy(decision);
    try {
      const done =
        decision === "approve"
          ? await reviewDraft(draft.id, { decision: "approve", ...(sent && { record: sent }), ...(note.trim() && { note: note.trim() }) })
          : await reviewDraft(draft.id, { decision: "reject", note: reason.trim() });
      onDecided(done, decision === "approve" ? "Onaylandı; worker eseri veri setine yazıp yayınlayacak." : "Reddedildi.");
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const person = (key: "founder" | "architect", label: string) => {
    const value = obj(record[key]);
    const pointer = `/${key}/name`;
    if (!value) {
      return (
        <Row label={label} refs={refs(pointer, `/${key}`)} onShow={onShowQuote}>
          <View style={styles.inline}>
            <Text color="textSecondary">Yok</Text>
            {open && <Button small label="Ekle" icon="add" kind="ghost" onPress={() => set([key], { name: "", confidence: "certain" })} />}
          </View>
        </Row>
      );
    }
    const candidates = Array.isArray(value["candidates"]) ? (value["candidates"] as unknown[]).map(obj).filter((c) => c !== null) : [];
    return (
      <Row label={label} refs={refs(pointer, `/${key}`)} onShow={onShowQuote}>
        <View style={styles.inline}>
          <Field label={`${label} adı`} hideLabel style={{ flex: 1, minWidth: 180 }} value={text(value["name"])} onChangeText={(v) => set([key, "name"], v)} editable={open} />
          <View style={{ width: 150 }}>
            <Picker label="Güven" hideLabel float value={text(value["confidence"]) || null} options={CONFIDENCE_OPTIONS} onChange={(v) => v && set([key, "confidence"], v)} />
          </View>
          {open && <Button small icon="trash-outline" kind="ghost" accessibilityLabel={`${label} kaldır`} onPress={() => set([key], null)} />}
        </View>
        {key === "founder" && <Field label="Unvanı" value={text(value["role"])} onChangeText={(v) => set([key, "role"], v.trim() ? v : undefined)} editable={open} placeholder="ör. Manisa sancakbeyi" />}
        {key === "architect" &&
          candidates.map((c, i) => (
            <View key={i} style={styles.inline}>
              <Field label={`Öbür mimar ${i + 1}`} style={{ flex: 1, minWidth: 160 }} value={text(c["name"])} onChangeText={(v) => set([key, "candidates", i, "name"], v)} editable={open} />
              <Field label="İşi" style={{ flex: 1, minWidth: 160 }} value={text(c["note"])} onChangeText={(v) => set([key, "candidates", i, "note"], v)} editable={open} />
              {open && (
                <Button
                  small
                  icon="trash-outline"
                  kind="ghost"
                  accessibilityLabel={`Öbür mimar ${i + 1} kaldır`}
                  onPress={() => {
                    const rest = candidates.filter((_, j) => j !== i);
                    set([key, "candidates"], rest.length > 0 ? rest : undefined);
                  }}
                />
              )}
            </View>
          ))}
        {key === "architect" && open && (
          <Button small label="Öbür mimar ekle" icon="add" kind="ghost" onPress={() => set([key, "candidates"], [...candidates, { name: "" }])} />
        )}
      </Row>
    );
  };

  const sections = Array.isArray(record["sections"]) ? (record["sections"] as unknown[]) : [];
  const media = Array.isArray(record["media"]) ? (record["media"] as unknown[]) : [];
  const coordinates = obj(getIn(record, ["location", "coordinates"]));
  const todos = getIn(record, ["meta", "todos"]);

  return (
    <Card>
      <CardHeader
        title={changed ? "Taslak (düzeltildi)" : "Taslak"}
        hint={draft.ai ? `${draft.ai.model} · ${draft.ai.promptVersion} · ${Math.round(draft.ai.ms / 1000)} sn` : undefined}
        actions={
          <Segments
            label="Görünüm"
            value={tab}
            onChange={(next) => (next === "json" ? toJson() : fromJson("form"))}
            options={[
              { value: "form", label: "Form" },
              { value: "json", label: "JSON" },
            ]}
          />
        }
      />

      {draft.duplicateOf && (
        <Notice tone="red" icon="copy-outline">
          {`Veri setinde zaten olabilir: ${draft.duplicateOf}. Karşılaştırmak için Eserler'de aç; aynı eserse reddet.`}
        </Notice>
      )}
      {draft.validation.errors.length > 0 && (
        <Section title={`Hatalar (${draft.validation.errors.length})${changed ? " · düzeltildiyse onaylayabilirsin" : ""}`}>
          {draft.validation.errors.map((line, i) => (
            <Line key={i} tone="red" text={line} />
          ))}
        </Section>
      )}
      {draft.validation.warnings.length > 0 && (
        <Section title={`Uyarılar (${draft.validation.warnings.length})`}>
          {draft.validation.warnings.map((line, i) => (
            <Line key={i} tone="gold" text={line} />
          ))}
        </Section>
      )}
      {Array.isArray(todos) && todos.length > 0 && (
        <Section title="Worker'ın notları">
          {todos.map((todo, i) => (
            <Line key={i} tone="gold" text={text(todo)} />
          ))}
        </Section>
      )}

      {tab === "json" ? (
        <Section title="Kayıt (JSON)">
          <TextInput
            accessibilityLabel="Kayıt JSON"
            multiline
            value={json}
            onChangeText={setJson}
            editable={open}
            spellCheck={false}
            autoCapitalize="none"
            style={[styles.json, { color: a.text, backgroundColor: a.well, borderColor: jsonError ? a.warning : a.line }]}
          />
          {jsonError && (
            <Text colorValue={a.warning} style={styles.small}>
              {jsonError}
            </Text>
          )}
        </Section>
      ) : (
        <>
          <Section title="Kimlik ve ad">
            <Field label="Kimlik" hint="Eserin adresi olur; değiştirirsen veri setinde yoksa yeni kimlikle eklenir." value={text(record["id"])} onChangeText={(v) => set(["id"], v.trim())} editable={open} autoCapitalize="none" />
            <Row label="Ad" refs={refs("/name/tr")} onShow={onShowQuote}>
              <Field label="Ad (Türkçe)" hideLabel value={text(getIn(record, ["name", "tr"]))} onChangeText={(v) => set(["name", "tr"], v)} editable={open} />
              <Field label="Ad (İngilizce)" value={text(getIn(record, ["name", "en"]))} onChangeText={(v) => set(["name", "en"], orNull(v))} editable={open} placeholder="Boş kalabilir" />
            </Row>
            <Row label="Tür" refs={refs("/type")} onShow={onShowQuote}>
              <Picker label="Tür" hideLabel value={text(record["type"]) || null} options={(enums?.assetTypes ?? []).map((t) => ({ value: t.code, label: t.label }))} onChange={(v) => v && set(["type"], v)} />
            </Row>
            <Row label="Dönem" refs={refs("/era")} onShow={onShowQuote}>
              <Picker label="Dönem" hideLabel allowEmpty placeholder="Söylenmedi" value={text(record["era"]) || null} options={(enums?.eras ?? []).map((e) => ({ value: e.code, label: e.label }))} onChange={(v) => set(["era"], v)} />
            </Row>
          </Section>

          <Section title="Yer">
            <Row label="İlçe" refs={refs("/location/district")} onShow={onShowQuote}>
              <Field label="İlçe" hideLabel hint="Küçük harf, Türkçe karaktersiz (ör. sehzadeler)." value={text(getIn(record, ["location", "district"]))} onChangeText={(v) => set(["location", "district"], v.trim())} editable={open} autoCapitalize="none" />
            </Row>
            <Row label="Mahalle" refs={refs("/location/neighborhood")} onShow={onShowQuote}>
              <Field label="Mahalle" hideLabel value={text(getIn(record, ["location", "neighborhood"]))} onChangeText={(v) => set(["location", "neighborhood"], orNull(v))} editable={open} />
            </Row>
            <Row label="Adres" refs={refs("/location/address")} onShow={onShowQuote}>
              <Field label="Adres" hideLabel value={text(getIn(record, ["location", "address"]))} onChangeText={(v) => set(["location", "address"], orNull(v))} editable={open} />
            </Row>
            <Row label="Konum" refs={[]} onShow={onShowQuote}>
              {coordinates ? (
                <>
                  <View style={styles.inline}>
                    <Field label="Enlem" style={{ flex: 1, minWidth: 120 }} value={text(coordinates["lat"])} onChangeText={(v) => set(["location", "coordinates", "lat"], v.trim() === "" || Number.isNaN(Number(v)) ? v : Number(v))} editable={open} keyboardType="decimal-pad" />
                    <Field label="Boylam" style={{ flex: 1, minWidth: 120 }} value={text(coordinates["lng"])} onChangeText={(v) => set(["location", "coordinates", "lng"], v.trim() === "" || Number.isNaN(Number(v)) ? v : Number(v))} editable={open} keyboardType="decimal-pad" />
                  </View>
                  <Toggle label="Yerinde doğrulandı" value={coordinates["verified"] === true} onChange={(v) => set(["location", "coordinates", "verified"], v)} hint={coordinates["source"] === "photo_exif" ? "Fotoğrafın konum bilgisinden; fotoğraf eserin yanında çekilmemiş olabilir." : undefined} />
                </>
              ) : (
                <View style={styles.inline}>
                  <Text color="textSecondary">Yok: eser haritada görünmez</Text>
                  {open && <Button small label="Ekle" icon="add" kind="ghost" onPress={() => set(["location", "coordinates"], { lat: "", lng: "", source: "manual", verified: false })} />}
                </View>
              )}
            </Row>
          </Section>

          <Section title="Tarih ve kişiler">
            <Row label="Tarih" refs={refs("/dating")} onShow={onShowQuote}>
              {obj(record["dating"]) ? (
                <>
                  <View style={styles.inline}>
                    <Field label="Gösterim" style={{ flex: 2, minWidth: 160 }} value={text(getIn(record, ["dating", "display", "tr"]))} onChangeText={(v) => set(["dating", "display", "tr"], v)} editable={open} placeholder="ör. 1583-1586" />
                    <View style={{ width: 150 }}>
                      <Picker label="Güven" float value={text(getIn(record, ["dating", "confidence"])) || null} options={CONFIDENCE_OPTIONS} onChange={(v) => v && set(["dating", "confidence"], v)} />
                    </View>
                  </View>
                  <View style={styles.inline}>
                    {(
                      [
                        ["start_year", "Başlangıç"],
                        ["end_year", "Bitiş"],
                        ["hijri_year", "Hicri"],
                        ["century", "Yüzyıl"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label} style={{ flex: 1, minWidth: 90 }} value={text(getIn(record, ["dating", key]))} onChangeText={(v) => set(["dating", key], intOrNull(v))} editable={open} keyboardType="number-pad" />
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.inline}>
                  <Text color="textSecondary">Yok</Text>
                  {open && <Button small label="Ekle" icon="add" kind="ghost" onPress={() => set(["dating"], { display: { tr: "", en: null }, confidence: "certain" })} />}
                </View>
              )}
            </Row>
            {person("founder", "Bani (yaptıran)")}
            {person("architect", "Mimar")}
          </Section>

          <Section title="Özet">
            <Field label="Özet" hideLabel multiline value={text(getIn(record, ["summary", "tr"]))} onChangeText={(v) => set(["summary", "tr"], v)} editable={open} />
          </Section>

          <Section title={`Anlatı bölümleri (${sections.length})`}>
            {sections.map((section, i) => (
              <View key={i} style={[styles.block, { borderColor: a.line }]}>
                <View style={styles.inline}>
                  <Field label={`Bölüm ${i + 1} başlığı`} style={{ flex: 1 }} value={text(getIn(section, ["title", "tr"]))} onChangeText={(v) => set(["sections", i, "title", "tr"], v)} editable={open} />
                  {open && <Button small icon="trash-outline" kind="ghost" accessibilityLabel={`Bölüm ${i + 1} kaldır`} onPress={() => set(["sections"], sections.filter((_, j) => j !== i))} />}
                </View>
                <Field label="Metin" multiline value={text(getIn(section, ["body", "tr"]))} onChangeText={(v) => set(["sections", i, "body", "tr"], v)} editable={open} />
                <Text color="textSecondary" style={styles.small}>
                  {`Kaynak: ${(Array.isArray(getIn(section, ["source_refs"])) ? (getIn(section, ["source_refs"]) as unknown[]) : []).map((r) => text(getIn(r, ["pages"]))).filter(Boolean).join("; ") || "yok"}`}
                </Text>
              </View>
            ))}
            {open && (
              <Button
                small
                label="Bölüm ekle"
                icon="add"
                kind="ghost"
                onPress={() =>
                  set(["sections"], [...sections, { id: `bolum-${sections.length + 1}`, order: sections.length + 1, title: { tr: "", en: null }, body: { tr: "", en: null }, confidence: "certain", source_refs: [{ source_id: "vagabonds-panel", pages: "inceleme" }] }])
                }
              />
            )}
          </Section>

          {media.length > 0 && (
            <Section title={`Fotoğraflar (${media.length})`}>
              {media.map((item, i) => {
                const shown = draft.media[i];
                return (
                  <View key={i} style={styles.photo}>
                    {shown ? <Image source={{ uri: localMediaUrl(shown.key) }} style={[styles.photoImage, { backgroundColor: a.well }]} accessibilityLabel={text(getIn(item, ["alt", "tr"]))} /> : null}
                    <View style={{ flex: 1, minWidth: 200, gap: 8 }}>
                      <Picker label="Konu" float value={text(getIn(item, ["subject"])) || null} options={SUBJECT_OPTIONS} onChange={(v) => v && set(["media", i, "subject"], v)} />
                      <Field label="Alt metin" multiline value={text(getIn(item, ["alt", "tr"]))} onChangeText={(v) => set(["media", i, "alt", "tr"], v)} editable={open} />
                      <Field label="Çeken / kaynak" value={text(getIn(item, ["credit"]))} onChangeText={(v) => set(["media", i, "credit"], v)} editable={open} />
                    </View>
                  </View>
                );
              })}
            </Section>
          )}
        </>
      )}

      {open && canDecide && (
        <View style={[styles.decision, { borderTopColor: a.line }]}>
          {tab === "form" && left.length > 0 && (
            <Section title="Onaydan önce">
              {left.map((line, i) => (
                <Line key={i} tone="red" text={line} />
              ))}
            </Section>
          )}
          {errorsLeft && (
            <Text colorValue={a.warning} style={styles.small}>
              Taslakta doğrulama hataları var: ilgili alanı düzelt, onay düzeltilmiş kayıtla gider.
            </Text>
          )}
          {failure && (
            <Text colorValue={a.warning} style={styles.small}>
              {failure}
            </Text>
          )}
          {rejecting ? (
            <>
              <View style={styles.reasons}>
                {REASONS.map((preset) => (
                  <Button key={preset} small label={preset} kind={reason === preset ? "primary" : "secondary"} onPress={() => setReason(preset)} />
                ))}
              </View>
              <Field label="Ret gerekçesi" hint="En az 3 karakter; taslağın sohbetinde görünür." value={reason} onChangeText={setReason} />
              <View style={styles.actions}>
                <Button small label="Vazgeç" kind="ghost" onPress={() => setRejecting(false)} />
                <Button label="Reddet" icon="close" kind="danger" disabled={reason.trim().length < 3} busy={busy === "reject"} onPress={() => void decide("reject")} />
              </View>
            </>
          ) : (
            <>
              <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="ör. Vakıflar kaydıyla karşılaştırıldı" />
              <View style={styles.actions}>
                <Button label="Reddet" icon="close" kind="danger" disabled={busy !== null} onPress={() => setRejecting(true)} />
                <View style={{ flex: 1 }} />
                {changed && <Button small label="Değişiklikleri geri al" icon="arrow-undo-outline" kind="ghost" onPress={() => setRecord(structuredClone(draft.record))} />}
                <Button
                  label={changed ? "Düzeltilmiş hâliyle onayla" : "Onayla"}
                  icon="checkmark"
                  kind="primary"
                  disabled={busy !== null || (tab === "form" && (left.length > 0 || errorsLeft))}
                  busy={busy === "approve"}
                  onPress={() => void decide("approve")}
                />
              </View>
            </>
          )}
        </View>
      )}
      {open && !canDecide && (
        <Text color="textSecondary" style={[styles.small, { marginTop: 14 }]}>
          Yeni eserlere admin karar verir.
        </Text>
      )}
    </Card>
  );
}

/** One field: its name, its inputs, and the sentence of the chat it came from. */
function Row({ label, refs, onShow, children }: { label: string; refs: Ref[]; onShow: (ref: Ref) => void; children: React.ReactNode }) {
  const a = useAdminColors();
  return (
    <View style={[styles.row, { borderBottomColor: a.line }]}>
      <Text color="textSecondary" style={styles.rowLabel}>
        {label}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        {children}
        <Quotes refs={refs} onShow={onShow} />
      </View>
    </View>
  );
}

/** Where an approved draft is: waiting for the worker, published, or turned back by it. */
export function PublishState({ draft }: { draft: IntakeDraft }) {
  const a = useAdminColors();
  if (draft.status === "rejected") return <Badge tone="red" label="Reddedildi" icon="close-circle-outline" />;
  if (draft.status === "pending") return <Badge tone="gold" label="Onay bekliyor" icon="time-outline" />;
  if (draft.applyError) return <Badge tone="red" label="Yayınlanamadı" icon="alert-circle-outline" />;
  if (draft.appliedAt) return <Badge tone="rose" label="Yayında" icon="checkmark-circle-outline" />;
  return (
    <View style={styles.inline}>
      <Ionicons name="hourglass-outline" size={14} color={a.textSecondary} aria-hidden />
      <Badge tone="blue" label="Onaylandı, yayın bekliyor" />
    </View>
  );
}

const styles = StyleSheet.create({
  small: { fontSize: 13, lineHeight: 19 },
  inline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { width: 120, fontSize: 13, lineHeight: 21, fontFamily: fontFamily.sansMedium },
  block: { gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  photo: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" },
  photoImage: { width: 160, height: 120, borderRadius: 10 },
  json: { minHeight: 420, borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 18 },
  decision: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 16, gap: 12 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});

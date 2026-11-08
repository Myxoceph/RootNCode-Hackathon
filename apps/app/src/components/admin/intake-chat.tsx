import Ionicons from "@expo/vector-icons/Ionicons";
import { INTAKE_FIELD_NAMES, INTAKE_MESSAGE_MAX_CHARS, INTAKE_MESSAGE_MAX_UPLOADS, type IntakeDraft, type IntakeJob, type MetaEnumsResponse } from "@vagabonds/contracts";
import { fontFamily, Text } from "@vagabonds/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";

import { localMediaUrl, uploadChatPhoto } from "@/data/admin";
import { messages } from "@/i18n/messages";

import { LANGUAGES } from "./asset-steps";

import { Badge, Button, Card, CardHeader, errorText, Field, formatDate, useAdminColors, type Tone } from "./kit";
import { pickChatPhotos, type PickedPhoto } from "./pick-image";

/**
 * Sohbetten Kabul's pieces (docs/veri-dongusu.md): the messages of a chat, the box
 * a message is written in, and the draft the worker (data/pipeline) wrote from them.
 */

// ── The job's state ─────────────────────────────────────────────────────────────────────────

/** Whether the worker still has the chat: the screen asks again until it does not. */
export const isWorking = (job: IntakeJob) => job.status === "queued" || job.status === "drafting";

export function jobBadge(job: IntakeJob): { tone: Tone; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] } {
  switch (job.status) {
    case "queued":
      return { tone: "grey", label: "Sırada", icon: "time-outline" };
    case "drafting":
      return { tone: "blue", label: "Taslak yazılıyor", icon: "sparkles-outline" };
    case "done":
      return { tone: "rose", label: "Taslak hazır", icon: "checkmark-circle-outline" };
    case "failed":
      return { tone: "red", label: "Yazılamadı", icon: "alert-circle-outline" };
    default:
      return { tone: "grey", label: job.status, icon: "ellipse-outline" };
  }
}

export function draftBadge(draft: IntakeDraft): { tone: Tone; label: string } {
  if (draft.status === "approved") return { tone: "rose", label: draft.appliedAt ? "Onaylandı, yayında" : "Onaylandı" };
  if (draft.status === "rejected") return { tone: "red", label: "Reddedildi" };
  return { tone: "gold", label: "Onay bekliyor" };
}

// ── Messages ────────────────────────────────────────────────────────────────────────────────

/** The chat as it was told: numbered as the draft's sources number them ("Mesaj 2"), each with its photos. */
export function ChatMessages({ job, highlight }: { job: IntakeJob; /** A quote to mark in its message (the review screen). */ highlight?: Ref | null }) {
  const a = useAdminColors();
  const input = job.input;
  if (!input) return null;
  return (
    <View style={styles.messages}>
      {input.messages.map((message, index) => {
        const photos = input.files.filter((file) => file.message === index);
        return (
          <View key={index} style={[styles.message, { backgroundColor: a.well, borderColor: a.line }]}>
            <View style={styles.messageHead}>
              <Text style={[styles.messageNo, { color: a.gold }]}>Mesaj {index + 1}</Text>
              <Text variant="caption" color="textSecondary">
                {formatDate(message.at, true)}
              </Text>
            </View>
            {message.text.length > 0 && (
              <Text style={styles.messageText} selectable>
                <Marked text={message.text} quote={highlight && highlight.message === index ? highlight.quote : null} />
              </Text>
            )}
            {photos.length > 0 && (
              <View style={styles.thumbs}>
                {photos.map((file) =>
                  file.key ? (
                    <Image key={file.path} source={{ uri: localMediaUrl(file.key) }} style={[styles.thumb, { backgroundColor: a.card }]} accessibilityLabel={file.name} />
                  ) : (
                    <View key={file.path} style={[styles.thumb, styles.centered, { backgroundColor: a.card }]}>
                      <Ionicons name="image-outline" size={20} color={a.textSecondary} aria-hidden />
                    </View>
                  ),
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** A message's text with a quote from it marked; the quote is found as written, case aside. */
function Marked({ text, quote }: { text: string; quote: string | null }) {
  const a = useAdminColors();
  const at = quote ? text.toLocaleLowerCase("tr").indexOf(quote.toLocaleLowerCase("tr")) : -1;
  if (!quote || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text style={[styles.messageText, { backgroundColor: a.goldSoft, color: a.text, fontFamily: fontFamily.sansMedium }]}>{text.slice(at, at + quote.length)}</Text>
      {text.slice(at + quote.length)}
    </>
  );
}

// ── The message box ─────────────────────────────────────────────────────────────────────────

interface Attached extends PickedPhoto {
  /** The upload's id once sent; null while it goes. */
  id: string | null;
  error: string | null;
}

/**
 * A message: text (a long one pasted from a book or notes is fine) and photos. Each photo is sent
 * as soon as it is added, so the message itself goes at once; it waits until the photos are up.
 */
export function ChatComposer({
  onSend,
  closed,
  placeholder,
  draftText,
  onDraftText,
}: {
  onSend: (text: string, uploads: string[]) => Promise<void>;
  /** Why no message can be sent now (the draft is being written, or was decided); null when one can. */
  closed: string | null;
  placeholder: string;
  /** The text being written, kept by the screen so a question from the draft can start it. */
  draftText: string;
  onDraftText: (text: string) => void;
}) {
  const a = useAdminColors();
  const [photos, setPhotos] = useState<Attached[]>([]);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The photos' object URLs are let go when they leave the box, and when the screen closes.
  const shown = useRef(new Set<string>());
  const release = (uris: string[]) => uris.forEach((uri) => {
    URL.revokeObjectURL(uri);
    shown.current.delete(uri);
  });
  useEffect(() => () => release([...shown.current]), []);

  const upload = (photo: Attached) => {
    uploadChatPhoto(photo).then(
      (done) => setPhotos((now) => now.map((p) => (p.uri === photo.uri ? { ...p, id: done.id, error: null } : p))),
      (error: unknown) => setPhotos((now) => now.map((p) => (p.uri === photo.uri ? { ...p, error: errorText(error) } : p))),
    );
  };

  const add = async () => {
    setProblem(null);
    try {
      const { photos: picked, refused } = await pickChatPhotos();
      const room = INTAKE_MESSAGE_MAX_UPLOADS - photos.length;
      const over = picked.slice(Math.max(0, room));
      release(over.map((p) => p.uri));
      if (over.length > 0) refused.push(`${over.length} fotoğraf: bir mesajla en çok ${INTAKE_MESSAGE_MAX_UPLOADS} fotoğraf gider, kalanları sonraki mesajla gönder`);
      if (refused.length > 0) setProblem(`Eklenmedi: ${refused.join("; ")}`);
      const fresh = picked.slice(0, Math.max(0, room)).map((p) => ({ ...p, id: null, error: null }));
      fresh.forEach((p) => shown.current.add(p.uri));
      setPhotos((now) => [...now, ...fresh]);
      fresh.forEach(upload);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Fotoğraf seçilemedi.");
    }
  };

  const remove = (uri: string) => {
    release([uri]);
    setPhotos((now) => now.filter((p) => p.uri !== uri));
  };
  const retry = (photo: Attached) => {
    setPhotos((now) => now.map((p) => (p.uri === photo.uri ? { ...p, error: null } : p)));
    upload(photo);
  };

  const going = photos.some((p) => p.id === null && p.error === null);
  const failed = photos.some((p) => p.error !== null);
  const empty = draftText.trim().length === 0 && photos.length === 0;
  const tooLong = draftText.trim().length > INTAKE_MESSAGE_MAX_CHARS;
  const send = async () => {
    setSending(true);
    setProblem(null);
    try {
      await onSend(draftText.trim(), photos.map((p) => p.id!));
      release(photos.map((p) => p.uri));
      setPhotos([]);
      onDraftText("");
    } catch (error) {
      setProblem(errorText(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.composer, { backgroundColor: a.card }]}>
      <Field
        label="Mesaj"
        hideLabel
        multiline
        value={draftText}
        onChangeText={onDraftText}
        placeholder={placeholder}
        editable={!sending}
      />
      {photos.length > 0 && (
        <View style={styles.thumbs}>
          {photos.map((photo) => (
            <View key={photo.uri} style={styles.attached}>
              <Image source={{ uri: photo.uri }} style={[styles.thumb, { backgroundColor: a.well }, photo.error ? { opacity: 0.4 } : null]} accessibilityLabel={photo.name} />
              {photo.id === null && photo.error === null && (
                <View style={[StyleSheet.absoluteFill, styles.centered]}>
                  <ActivityIndicator color={a.goldMark} />
                </View>
              )}
              {photo.error && (
                <Pressable accessibilityRole="button" accessibilityLabel={`${photo.name}: ${photo.error} Yeniden dene`} onPress={() => retry(photo)} style={[StyleSheet.absoluteFill, styles.centered]}>
                  <Ionicons name="refresh-circle" size={28} color={a.warning} aria-hidden />
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={`${photo.name} fotoğrafını çıkar`} onPress={() => remove(photo.uri)} hitSlop={6} style={[styles.unattach, { backgroundColor: a.ink }]}>
                <Ionicons name="close" size={13} color={a.onInk} aria-hidden />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {(problem || failed) && (
        <Text colorValue={a.warning} style={styles.small}>
          {problem ?? photos.find((p) => p.error)?.error}
        </Text>
      )}
      {tooLong && (
        <Text colorValue={a.warning} style={styles.small}>
          {`Metin bir mesaj için çok uzun (${draftText.trim().length.toLocaleString("tr-TR")} / ${INTAKE_MESSAGE_MAX_CHARS.toLocaleString("tr-TR")} karakter). İkiye bölüp ayrı mesajlarla gönder.`}
        </Text>
      )}
      {closed && (
        <Text color="textSecondary" style={styles.small}>
          {closed}
        </Text>
      )}
      <View style={styles.composerRow}>
        <Button label="Fotoğraf ekle" icon="image-outline" onPress={() => void add()} disabled={sending} small />
        <View style={{ flex: 1 }} />
        <Button
          label={going ? "Fotoğraflar yükleniyor" : "Gönder"}
          icon="send"
          kind="primary"
          onPress={() => void send()}
          busy={sending}
          disabled={empty || tooLong || going || failed || closed !== null}
        />
      </View>
    </View>
  );
}

// ── The draft ───────────────────────────────────────────────────────────────────────────────

/** What a field is called on the card and in its questions (INTAKE_FIELD_NAMES, shared with the worker). */
export function fieldName(pointer: string): string {
  const known = INTAKE_FIELD_NAMES[pointer];
  if (known) return known;
  const inscription = /^\/inscriptions\/(\d+)/.exec(pointer);
  if (inscription) return `Kitabe ${Number(inscription[1]) + 1}`;
  return pointer;
}

export type Ref = { message: number; quote: string };

/** How sure the chat is of a value (the dataset's confidence), shown beside it: "kesin" stays quiet. */
export type Confidence = { tone: Tone; label: string };
export const CONFIDENCE: Record<string, Confidence> = {
  certain: { tone: "grey", label: "kesin" },
  probable: { tone: "gold", label: "olası" },
  disputed: { tone: "red", label: "tartışmalı" },
  legend: { tone: "blue", label: "rivayet" },
};

/** The quoted sentence behind each field (`{field, message, quote}`), by its pointer. */
export function quotesOf(draft: IntakeDraft): Map<string, Ref[]> {
  const map = new Map<string, Ref[]>();
  for (const ref of draft.sourceRefs) {
    if (!("message" in ref)) continue;
    map.set(ref.field, [...(map.get(ref.field) ?? []), { message: ref.message, quote: ref.quote }]);
  }
  return map;
}

/** A photo's subject as the seal screen names it ("Taçkapı"); "aerial" and "other" are the draft's own. */
export const SUBJECTS: Record<string, string> = { ...messages.tr.seal.parts, aerial: "Havadan", other: "Diğer" };
const languageName = (code: string | null) => (code ? (LANGUAGES.find((l) => l.value === code)?.label ?? code) : "Dili yazılmamış");

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const obj = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const tr = (value: unknown): string | null => text(obj(value)?.["tr"]);

/**
 * The worker's draft, as the expert checks it: each field beside the sentence of the chat it came
 * from, what the chat did not say as questions to answer in it, and the checks' errors and warnings.
 * The record is the dataset's JSON (data/README.md); it is read loosely, since the worker writes it.
 */
export function DraftCard({ draft, job, enums, onAsk }: { draft: IntakeDraft; job: IntakeJob; enums: MetaEnumsResponse | null; onAsk: (field: string) => void }) {
  const a = useAdminColors();
  const record = draft.record;
  const quotes = quotesOf(draft);
  const location = obj(record["location"]);
  const dating = obj(record["dating"]);
  const coordinates = obj(location?.["coordinates"]);
  const label = (list: Array<{ code: string; label: string }> | undefined, code: unknown) =>
    typeof code === "string" ? (list?.find((item) => item.code === code)?.label ?? code) : null;
  const person = (value: unknown) => {
    const p = obj(value);
    return p ? [text(p["name"]), text(p["role"])].filter(Boolean).join(", ") || null : null;
  };
  const sections = Array.isArray(record["sections"]) ? (record["sections"] as unknown[]).map(obj).filter((s) => s !== null) : [];
  // Kept at their places in the record: the quotes point at them by index (/inscriptions/2).
  const inscriptions = Array.isArray(record["inscriptions"]) ? (record["inscriptions"] as unknown[]).map(obj) : [];
  const badge = draftBadge(draft);
  const open = draft.status === "pending";

  const confidence = (value: unknown) => CONFIDENCE[text(obj(value)?.["confidence"]) ?? ""] ?? null;
  const candidates = (value: unknown) => {
    const list = obj(value)?.["candidates"];
    return Array.isArray(list) ? list.map(obj).filter((c) => c !== null && text(c["name"])).map((c) => (text(c!["note"]) ? `${c!["name"]} (${c!["note"]})` : String(c!["name"]))) : [];
  };
  const rows: Array<[string, string, string | null, Confidence | null, string[]]> = [
    ["/name/tr", "Ad", [tr(record["name"]), text(obj(record["name"])?.["en"])].filter(Boolean).join(" · ") || null],
    ["/type", "Tür", label(enums?.assetTypes, record["type"])],
    ["/era", "Dönem", label(enums?.eras, record["era"])],
    ["/location/district", "İlçe", [label(enums?.cities, location?.["city"]), text(location?.["district"])].filter(Boolean).join(" / ") || null],
    ["/location/neighborhood", "Mahalle", text(location?.["neighborhood"])],
    ["/location/address", "Adres", text(location?.["address"])],
    ["/location/coordinates", "Konum", typeof coordinates?.["lat"] === "number" && typeof coordinates["lng"] === "number" ? `${coordinates["lat"]}, ${coordinates["lng"]}${coordinates["source"] === "photo_exif" ? " (fotoğrafın konum bilgisinden)" : ""}${coordinates["verified"] === true ? "" : ", doğrulanmadı"}` : null],
    ["/dating", "Tarih", tr(dating?.["display"]), confidence(dating), []],
    ["/founder/name", "Bani (yaptıran)", person(record["founder"]), confidence(record["founder"]), []],
    ["/architect/name", "Mimar", person(record["architect"]), confidence(record["architect"]), candidates(record["architect"])],
  ].map((row) => [row[0], row[1], row[2], row[3] ?? null, row[4] ?? []] as [string, string, string | null, Confidence | null, string[]]);

  return (
    <Card>
      <CardHeader
        title="Taslak"
        hint={`${draft.assetId} · ${formatDate(draft.updatedAt, true)}${draft.ai ? ` · ${draft.ai.model}, ${Math.round(draft.ai.ms / 1000)} sn` : ""}`}
        actions={<Badge tone={badge.tone} label={badge.label} />}
      />
      {job.status === "queued" && open && (
        <Notice tone="grey" icon="time-outline">
          Yeni mesajla birlikte taslak yeniden yazılacak; aşağıdaki, önceki mesajlardan.
        </Notice>
      )}

      {draft.validation.missing.length > 0 && open && (
        <Section title="Sohbette söylenmeyenler">
          <Text color="textSecondary" style={styles.small}>
            Biliyorsan sohbete yaz; taslak yeniden yazılır. Bilinmiyorsa boş kalabilir.
          </Text>
          <View style={styles.questions}>
            {draft.validation.missing.map((pointer) => (
              <Pressable
                key={pointer}
                accessibilityRole="button"
                accessibilityLabel={`${fieldName(pointer)} yazılmamış. Sohbete yaz`}
                onPress={() => onAsk(pointer)}
                style={[styles.question, { borderColor: a.line, backgroundColor: a.well }]}
              >
                <Ionicons name="help-circle-outline" size={15} color={a.gold} aria-hidden />
                <Text style={styles.small}>{fieldName(pointer)} yazılmamış</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      {draft.duplicateOf && (
        <Notice tone="red" icon="copy-outline">
          {`Bu eser veri setinde zaten olabilir: ${draft.duplicateOf}. Onaylamadan önce karşılaştır.`}
        </Notice>
      )}
      {draft.validation.errors.length > 0 && (
        <Section title={`Hatalar (${draft.validation.errors.length})`}>
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

      <Section title="Alanlar">
        {rows.map(([pointer, name, value, sure, others]) => (
          <FieldRow key={pointer} name={name} value={value} sure={sure} others={others} refs={quotes.get(pointer) ?? (pointer === "/founder/name" || pointer === "/architect/name" ? quotes.get(pointer.replace("/name", "")) : undefined)} />
        ))}
      </Section>

      {tr(record["summary"]) && (
        <Section title="Özet">
          <Text style={styles.body} selectable>
            {tr(record["summary"])}
          </Text>
        </Section>
      )}

      {sections.length > 0 && (
        <Section title="Anlatı bölümleri">
          {sections.map((section, i) => (
            <View key={i} style={styles.block}>
              <Text style={styles.blockTitle}>{tr(section["title"]) ?? `Bölüm ${i + 1}`}</Text>
              <Text style={styles.body} selectable>
                {tr(section["body"])}
              </Text>
              <Text color="textSecondary" style={styles.small}>
                {sourcePages(section["source_refs"])}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {inscriptions.length > 0 && (
        <Section title="Kitabeler">
          {inscriptions.map((item, i) =>
            item === null ? null : (
            <View key={i} style={styles.block}>
              <Text style={styles.blockTitle}>{`${tr(item["location"]) ?? "Kitabe"} · ${languageName(text(item["language"]))}`}</Text>
              {text(item["transliteration"]) && <Text style={[styles.body, { fontStyle: "italic" }]}>{text(item["transliteration"])}</Text>}
              {tr(item["translation"]) && <Text style={styles.body}>{tr(item["translation"])}</Text>}
              <Quotes refs={quotes.get(`/inscriptions/${i}`)} />
            </View>
            ),
          )}
        </Section>
      )}

      {draft.media.length > 0 && (
        <Section title="Fotoğraflar">
          <View style={styles.thumbs}>
            {draft.media.map((media) => (
              <View key={media.key} style={styles.mediaItem}>
                <Image source={{ uri: localMediaUrl(media.key) }} style={[styles.mediaImage, { backgroundColor: a.well }]} accessibilityLabel={media.alt ?? "Fotoğraf"} />
                <Text style={styles.small} numberOfLines={1}>
                  {media.subject ? (SUBJECTS[media.subject] ?? media.subject) : "Konu belirsiz"}
                  {media.subjectConfidence !== null ? ` · %${Math.round(media.subjectConfidence * 100)}` : ""}
                  {media.arTargetCandidate ? " · kitabe" : ""}
                </Text>
                {media.alt && (
                  <Text color="textSecondary" style={styles.small} numberOfLines={3}>
                    {media.alt}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </Section>
      )}

      {draft.reviewNote && (
        <Section title="İncelemenin notu">
          <Text style={styles.body}>{draft.reviewNote}</Text>
        </Section>
      )}
      {draft.applyError && <Notice tone="red" icon="alert-circle-outline">{`Yayınlanamadı: ${draft.applyError}`}</Notice>}
      {open && (
        <Text color="textSecondary" style={[styles.small, { marginTop: 12 }]}>
          Taslak onay kuyruğunda yeni eser olarak bekliyor. Onaylanınca worker veri setine ekleyip yayınlar.
        </Text>
      )}
    </Card>
  );
}

/** "mesaj 1, 2" as the dataset's sources write it, for a section. */
function sourcePages(refs: unknown): string {
  const pages = Array.isArray(refs) ? refs.map((ref) => text(obj(ref)?.["pages"])).filter(Boolean) : [];
  return pages.length > 0 ? `Kaynak: ${pages.join("; ")}` : "Kaynak yok";
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const a = useAdminColors();
  return (
    <View style={[styles.section, { borderTopColor: a.line }]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FieldRow({ name, value, refs, sure = null, others = [] }: { name: string; value: string | null; refs: Ref[] | undefined; sure?: Confidence | null; others?: string[] }) {
  const a = useAdminColors();
  return (
    <View style={[styles.fieldRow, { borderBottomColor: a.line }]}>
      <Text color="textSecondary" style={styles.fieldName}>
        {name}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.valueRow}>
          <Text style={[styles.body, { flexShrink: 1 }, value === null && { color: a.textSecondary }]}>{value ?? "—"}</Text>
          {value !== null && sure && <Badge tone={sure.tone} label={sure.label} />}
        </View>
        {others.length > 0 && (
          <Text color="textSecondary" style={styles.small}>
            {`Öbürleri: ${others.join("; ")}`}
          </Text>
        )}
        <Quotes refs={refs} />
      </View>
    </View>
  );
}

/** The sentences a value was taken from, word for word, with the message they are in. */
export function Quotes({ refs, onShow }: { refs: Ref[] | undefined; /** Shows the quote in its message (the review screen). */ onShow?: (ref: Ref) => void }) {
  const a = useAdminColors();
  if (!refs || refs.length === 0) return null;
  return (
    <>
      {refs.map((ref, i) => (
        <Pressable
          key={i}
          disabled={!onShow}
          onPress={() => onShow?.(ref)}
          accessibilityRole={onShow ? "button" : undefined}
          accessibilityLabel={onShow ? `Mesaj ${ref.message + 1}'de göster` : undefined}
          style={[styles.quote, { borderLeftColor: a.goldMark }]}
        >
          <Text color="textSecondary" style={styles.small}>
            <Text style={[styles.small, { color: a.gold, fontFamily: fontFamily.sansMedium }]}>{`Mesaj ${ref.message + 1}: `}</Text>
            {`“${ref.quote}”`}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

export function Line({ tone, text: line }: { tone: "red" | "gold"; text: string }) {
  const a = useAdminColors();
  return (
    <View style={styles.line}>
      <Ionicons name={tone === "red" ? "close-circle" : "warning-outline"} size={14} color={tone === "red" ? a.warning : a.gold} aria-hidden style={{ marginTop: 2 }} />
      <Text style={[styles.small, { flex: 1 }]} selectable>
        {line}
      </Text>
    </View>
  );
}

export function Notice({ tone, icon, children }: { tone: "grey" | "red" | "blue"; icon: React.ComponentProps<typeof Ionicons>["name"]; children: string }) {
  const a = useAdminColors();
  const look = { grey: { fg: a.textSecondary, bg: a.greySoft }, red: { fg: a.warning, bg: a.redSoft }, blue: { fg: a.primary, bg: a.blueSoft } }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: look.bg }]}>
      <Ionicons name={icon} size={16} color={look.fg} aria-hidden style={{ marginTop: 1 }} />
      <Text colorValue={look.fg} style={[styles.small, { flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", justifyContent: "center" },
  messages: { gap: 10 },
  message: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 8 },
  messageHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  messageNo: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  messageText: { fontSize: 14, lineHeight: 21 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: 10 },
  attached: { width: 88, height: 88 },
  unattach: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  composer: { borderRadius: 16, padding: 14, gap: 10 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  small: { fontSize: 13, lineHeight: 19 },
  body: { fontSize: 14, lineHeight: 21 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 14, gap: 8 },
  sectionTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  questions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  question: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  valueRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  fieldRow: { flexDirection: "row", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldName: { width: 130, fontSize: 13, lineHeight: 21 },
  quote: { borderLeftWidth: 2, paddingLeft: 8 },
  block: { gap: 4, paddingBottom: 6 },
  blockTitle: { fontFamily: fontFamily.sansMedium, fontSize: 14 },
  line: { flexDirection: "row", gap: 6 },
  notice: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 12, marginTop: 12 },
  mediaItem: { width: 150, gap: 4 },
  mediaImage: { width: 150, height: 110, borderRadius: 10 },
});

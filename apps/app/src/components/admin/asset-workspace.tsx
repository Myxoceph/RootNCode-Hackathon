import Ionicons from "@expo/vector-icons/Ionicons";
import { AdminAssetRecordInputSchema, type AdminAssetRecord, type AssetDetail, type SourceRef } from "@vagabonds/contracts";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { DossierView } from "@/app/dossier";
import { AssetDetailView } from "@/components/asset-detail";
import { AssetImage } from "@/components/asset-image";
import { createAssetRecord, fetchAssetPreview, fetchAssetRecord, fetchMetaEnums, fetchPanelAssets, saveAssetRecord, updatePanelAsset } from "@/data/admin";
import { InFrame, type EditPart, type Frame, type FrameEditing } from "@/lib/in-frame";

import { Badge, Button, Card, Confirm, Empty, errorText, Failed, formatDate, Loading, PageHeader, Segments, Toast, useAdminColors, useLoad, useToast, type Tone } from "./kit";
import { PART_GROUPS, PartEditor, partInfo, PARTS, partState } from "./record-editor";
import { previewOf, SAMPLE_TEXTS } from "./record-preview";
import { PageBody } from "./shell";

/**
 * An asset's page in the panel: the app's page in a phone, next to everything its record holds.
 * Any part of the phone can be pressed to edit it: the part opens beside the phone with only its own
 * fields, and the phone follows every keystroke. The list of parts says what is filled and what is
 * missing, and goes to a part on the phone too. A new asset opens straight into editing, with
 * faded sample texts where nothing is filled in yet. Narrow screens get the phone as a tab.
 */

type Tab = "general" | "text" | "history" | "inscriptions" | "visit" | "media" | "preview";

const EMPTY: AdminAssetRecord = {
  status: "draft",
  name: { tr: "", en: null },
  subtitle: null,
  type: "",
  secondaryTypes: [],
  era: null,
  parentId: null,
  tags: [],
  alternateNames: [],
  city: "",
  district: "",
  neighborhood: null,
  address: null,
  coordinates: null,
  summary: { tr: "", en: null },
  dating: { display: null, startYear: null, endYear: null, hijriYear: null, century: null, basis: null, confidence: null },
  founder: { name: null, role: null, confidence: null },
  architect: { name: null, candidates: [], confidence: null },
  waqf: { name: null, deedDate: null, deedExcerpt: null, conditions: null, landNote: null, confidence: null },
  sections: [],
  highlights: [],
  timeline: [],
  facts: [],
  legends: [],
  people: [],
  inscriptions: [],
  visit: { setting: null, durationMin: null, entranceFee: null, notes: null },
  tips: [],
  accessibility: { wheelchair: "unknown", stepFree: "unknown", ramp: "unknown", toilet: "unknown", verified: false, notes: null, audioDescription: null },
  ambientSound: { key: null, caption: null },
  media: [],
};

export function AssetWorkspace({ id }: { id: string | null }) {
  const creating = id === null;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const split = width >= 1280;
  const [tab, setTab] = useState<Tab>("general");
  const [draft, setDraft] = useState<AdminAssetRecord | null>(creating ? EMPTY : null);
  const [part, setPart] = useState<EditPart>("identity");
  const [focus, setFocus] = useState<FrameEditing["focus"]>(null);
  const [phoneOnly, setPhoneOnly] = useState(false);
  const [samples, setSamples] = useState(true);
  // After a save is stopped, what is still wrong is checked again as the form changes.
  const [checked, setChecked] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();
  const preview = useLoad(() => (id ? fetchAssetPreview(id) : Promise.resolve(null)), [id]);
  const loaded = useLoad(() => (id ? fetchAssetRecord(id) : Promise.resolve(null)), [id]);
  const meta = useLoad(fetchMetaEnums);
  const assets = useLoad(fetchPanelAssets);

  const editing = draft !== null;
  const problems = useMemo(() => (checked && draft ? problemsOf(draft) : []), [checked, draft]);
  const saved = loaded.data?.record ?? null;
  const dirty = editing && (creating ? JSON.stringify(draft) !== JSON.stringify(EMPTY) : JSON.stringify(draft) !== JSON.stringify(saved));
  // The phone follows the form a beat behind the keys, so typing stays quick.
  const typed = useDeferredValue(draft);
  const phone = useMemo(
    () => (typed ? previewOf(typed, { id: id ?? "yeni-eser", meta: meta.data, base: preview.data, samples }) : preview.data),
    [typed, id, meta.data, preview.data, samples],
  );

  const reload = () => {
    preview.reload();
    loaded.reload();
  };

  const startEditing = () => {
    setDraft(structuredClone(saved!));
    setSamples(false);
  };

  /** Opens a part to edit; from the list, the phone also goes to where the part is. */
  const pick = (next: EditPart, show = false) => {
    if (!editing) startEditing();
    setPart(next);
    setPhoneOnly(false);
    if (show) setFocus({ part: next, n: Date.now() });
  };

  const frameEditing: FrameEditing = {
    selected: editing ? part : null,
    pick: (next) => pick(next),
    label: (p) => partInfo(p).label,
    focus,
    samples: editing && samples,
  };

  const toggleStatus = async () => {
    if (!id || !saved) return;
    setBusy(true);
    try {
      const next = saved.status === "published" ? "draft" : "published";
      await updatePanelAsset(id, { status: next });
      show(next === "published" ? "Eser yayında." : "Eser taslağa alındı.");
      reload();
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const found = problemsOf(draft);
    setChecked(true);
    if (found.length > 0) {
      pick(found[0]!.part, true);
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        const created = await createAssetRecord(draft);
        router.replace(`/admin/assets/${created.id}`);
        return;
      }
      const result = await saveAssetRecord(id, draft);
      loaded.setData(result);
      preview.reload();
      setDraft(null);
      setChecked(false);
      show("Eser kaydedildi.");
    } catch (error) {
      show(errorText(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    setLeaving(false);
    setChecked(false);
    if (creating) router.push("/admin/assets");
    else setDraft(null);
  };

  if ((preview.error && !preview.data) || (loaded.error && !loaded.data)) {
    return (
      <PageBody>
        <BackLink onPress={() => router.push("/admin/assets")} />
        <Card>
          <Failed message={preview.error ?? loaded.error ?? ""} onRetry={reload} />
        </Card>
      </PageBody>
    );
  }
  const asset = preview.data;
  if (!creating && (!asset || !saved || !loaded.data)) {
    return (
      <PageBody>
        <Loading />
      </PageBody>
    );
  }

  const record = draft ?? saved!;
  const count = (...lists: unknown[][]) => lists.reduce((sum, list) => sum + list.length, 0);
  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: "general", label: "Genel" },
    { value: "text", label: "Metin", count: count(record.sections, record.highlights) },
    { value: "history", label: "Tarihçe", count: count(record.timeline, record.facts, record.legends) },
    { value: "inscriptions", label: "Kitabe ve kişiler", count: count(record.inscriptions, record.people) },
    { value: "visit", label: "Ziyaret", count: count(record.tips) },
    { value: "media", label: "Görsel ve kaynak", count: count(asset?.media ?? [], asset?.sources ?? []) },
    ...(split ? [] : [{ value: "preview" as const, label: "Önizleme" }]),
  ];
  const shownTab = split && tab === "preview" ? "general" : tab;
  const title = editing ? draft.name.tr.trim() || (creating ? "Yeni eser" : asset!.name) : asset!.name;
  const typeLabel = meta.data?.assetTypes.find((t) => t.code === record.type)?.label;
  const cityLabel = meta.data?.cities.find((c) => c.code === record.city)?.label;
  const hint = [typeLabel, [record.district, cityLabel].filter(Boolean).join(", "), id].filter(Boolean).join(" · ") || "Telefonda bir yere ya da soldaki listeden bir parçaya tıkla, bilgilerini gir.";

  const actions = editing ? (
    <>
      <Button label="Vazgeç" kind="ghost" onPress={() => (dirty ? setLeaving(true) : leave())} />
      <Button label={creating ? "Eseri ekle" : "Kaydet"} icon="checkmark" kind="primary" busy={busy} disabled={!dirty && !creating} onPress={() => void save()} />
    </>
  ) : (
    <>
      <Button
        label={saved!.status === "published" ? "Taslağa al" : "Yayına al"}
        icon={saved!.status === "published" ? "cloud-download-outline" : "cloud-upload-outline"}
        busy={busy}
        onPress={() => void toggleStatus()}
      />
      <Button label="Düzenle" icon="create-outline" kind="primary" onPress={startEditing} />
    </>
  );

  const phoneView = phone && <Phone asset={phone} faded={samples && editing} edit={frameEditing} />;

  const details = (
    <>
      <BackLink onPress={() => (dirty ? setLeaving(true) : router.push("/admin/assets"))} />
      <PageHeader title={title} hint={hint} actions={actions} />
      <View style={styles.statusRow}>
        {editing ? (
          <Badge tone="gold" label={creating ? "Yeni eser" : dirty ? "Kaydedilmemiş değişiklikler" : "Düzenleniyor"} icon="create-outline" />
        ) : (
          <>
            <StatusBadge status={saved!.status} />
            <Badge tone="grey" label={loaded.data!.origin === "panel" ? "Panelden eklendi" : "Veri seti"} icon={loaded.data!.origin === "panel" ? "create-outline" : "server-outline"} />
            <Text color="textSecondary" style={{ fontSize: 12.5 }}>
              Son güncelleme {formatDate(asset!.updatedAt)}
            </Text>
          </>
        )}
      </View>
      {editing && !creating && loaded.data!.origin === "dataset" && <DatasetNotice />}
      {problems.length > 0 && <Problems problems={problems} onPick={(p) => pick(p, true)} />}
      {editing ? (
        <View style={styles.editor}>
          <PartNav record={draft} part={phoneOnly ? null : part} problems={new Set(problems.map((p) => p.part))} onPick={(p) => pick(p, true)} onPhone={split ? undefined : () => setPhoneOnly(true)} phoneOn={phoneOnly} />
          <View style={styles.panel}>
            {phoneOnly ? (
              <View style={{ alignItems: "center", gap: 12 }}>
                <SamplesSwitch samples={samples} onSamples={setSamples} />
                {phoneView}
              </View>
            ) : (
              <PartPanel part={part} record={draft} onPick={(p) => pick(p, true)}>
                <PartEditor key={part} part={part} record={draft} onChange={setDraft} meta={meta.data} base={asset} assets={assets.data ?? []} />
              </PartPanel>
            )}
          </View>
        </View>
      ) : (
        <>
          <View style={{ marginBottom: 20 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Segments label="Bölüm" value={shownTab} onChange={setTab} options={tabs} />
            </ScrollView>
          </View>
          {shownTab === "preview" && <View style={{ alignItems: "center" }}>{phoneView}</View>}
          {shownTab === "general" && <General asset={asset!} />}
          {shownTab === "text" && <TextTab asset={asset!} />}
          {shownTab === "history" && <History asset={asset!} />}
          {shownTab === "inscriptions" && <Inscriptions asset={asset!} />}
          {shownTab === "visit" && <Visit asset={asset!} />}
          {shownTab === "media" && <MediaTab asset={asset!} />}
        </>
      )}
    </>
  );

  return (
    <View style={styles.fill}>
      {split ? (
        <View style={[styles.fill, { flexDirection: "row" }]}>
          <View style={styles.fill}>
            <PageBody>{details}</PageBody>
          </View>
          {phone && (
            <PreviewColumn editing={editing} samples={samples} onSamples={setSamples}>
              {phoneView}
            </PreviewColumn>
          )}
        </View>
      ) : (
        <PageBody>{details}</PageBody>
      )}
      {leaving && (
        <Confirm
          title="Değişiklikler kaydedilmedi"
          body="Çıkarsan bu düzenlemede yaptığın değişiklikler kaybolur."
          confirmLabel="Kaydetmeden çık"
          danger
          onConfirm={leave}
          onCancel={() => setLeaving(false)}
        />
      )}
      <Toast toast={toast} />
    </View>
  );
}

/* ───────────── Parts ───────────── */

/** Every part of the page, grouped as the app shows them, with how full each one is. */
function PartNav({
  record,
  part,
  problems,
  onPick,
  onPhone,
  phoneOn,
}: {
  record: AdminAssetRecord;
  part: EditPart | null;
  problems: Set<EditPart>;
  onPick: (part: EditPart) => void;
  /** Narrow screens: the phone in place of the form. */
  onPhone?: () => void;
  phoneOn: boolean;
}) {
  const a = useAdminColors();
  const done = PARTS.filter((p) => partState(p.part, record).state === "done").length;
  return (
    <View style={[styles.nav, { backgroundColor: a.card }]}>
      <View style={styles.navHead}>
        <Text style={styles.navTitle}>Sayfanın parçaları</Text>
        <Text color="textSecondary" style={{ fontSize: 12 }}>
          {done}/{PARTS.length} dolu
        </Text>
      </View>
      <View style={[styles.progress, { backgroundColor: a.line }]}>
        <View style={{ width: `${(done / PARTS.length) * 100}%`, height: "100%", borderRadius: 2, backgroundColor: a.goldMark }} />
      </View>
      {onPhone && <NavRow icon="phone-portrait-outline" label="Önizleme" on={phoneOn} onPress={onPhone} />}
      {PART_GROUPS.map((group) => (
        <View key={group.title} style={{ gap: 2 }}>
          <Text color="textSecondary" style={styles.navGroup}>
            {group.title.toLocaleUpperCase("tr")}
          </Text>
          {group.parts.map((info) => {
            const { state, count } = partState(info.part, record);
            const problem = problems.has(info.part) || (state === "missing" && problems.size > 0);
            return (
              <NavRow
                key={info.part}
                icon={info.icon}
                label={info.label}
                on={info.part === part}
                onPress={() => onPick(info.part)}
                end={
                  problem ? (
                    <Ionicons name="alert-circle" size={16} color={a.warning} aria-label="Düzeltilmeli" />
                  ) : count ? (
                    <Text color="textSecondary" style={styles.navCount}>
                      {count}
                    </Text>
                  ) : state === "done" ? (
                    <Ionicons name="checkmark-circle" size={16} color={a.success} aria-label="Dolu" />
                  ) : state === "missing" ? (
                    <Text colorValue={a.warning} style={styles.navCount}>
                      Gerekli
                    </Text>
                  ) : (
                    <View style={[styles.navEmpty, { borderColor: a.textSecondary }]} aria-label="Boş" />
                  )
                }
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NavRow({ icon, label, on, onPress, end }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; on: boolean; onPress: () => void; end?: ReactNode }) {
  const a = useAdminColors();
  return (
    <Pressable
      accessibilityRole="button"
      aria-current={on ? "true" : undefined}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => [styles.navRow, { backgroundColor: on ? a.well : hovered ? a.hover : "transparent" }, on && { boxShadow: a.shadow }]}
    >
      <Ionicons name={icon} size={16} color={on ? a.goldMark : a.textSecondary} aria-hidden />
      <Text style={[styles.navLabel, on && { fontFamily: fontFamily.sansSemiBold }]} numberOfLines={1}>
        {label}
      </Text>
      {end}
    </Pressable>
  );
}

/** The picked part: what it is and where it shows, its fields, and the way on to the next one. */
function PartPanel({ part, record, onPick, children }: { part: EditPart; record: AdminAssetRecord; onPick: (part: EditPart) => void; children: ReactNode }) {
  const a = useAdminColors();
  const info = partInfo(part);
  const at = PARTS.findIndex((p) => p.part === part);
  const previous = PARTS[at - 1];
  const next = PARTS[at + 1];
  const { state } = partState(part, record);
  // A part picked further down a long one leaves the page scrolled: bring the new part's top back into view.
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (Platform.OS === "web" && node && node.getBoundingClientRect().top < 0) node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [part]);
  return (
    <View ref={ref} style={{ gap: 16 }}>
      <View style={styles.panelHead}>
        <View style={[styles.panelIcon, { backgroundColor: a.goldSoft }]}>
          <Ionicons name={info.icon} size={20} color={a.goldMark} aria-hidden />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text headingLevel={2} style={styles.panelTitle}>
            {info.label}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="phone-portrait-outline" size={13} color={a.textSecondary} aria-hidden />
            <Text color="textSecondary" style={{ fontSize: 12.5, flex: 1 }}>
              {info.where}
            </Text>
          </View>
        </View>
        {state === "missing" ? <Badge tone="red" label="Gerekli" /> : state === "empty" ? <Badge tone="grey" label="Boş, uygulamada görünmez" /> : <Badge tone="green" label="Dolu" icon="checkmark" />}
      </View>
      {children}
      <View style={styles.panelFoot}>
        {previous ? <Button kind="ghost" icon="arrow-back" label={previous.label} onPress={() => onPick(previous.part)} /> : <View />}
        {next && <Button kind="secondary" label={`Sonraki: ${next.label}`} icon="arrow-forward" onPress={() => onPick(next.part)} />}
      </View>
    </View>
  );
}

/** What stops a record from being saved, in Turkish, with the part to fix it in. */
interface Problem {
  part: EditPart;
  text: string;
}

const FIELD: Record<string, { part: EditPart; label: string }> = {
  name: { part: "identity", label: "Ad" },
  summary: { part: "summary", label: "Özet" },
  type: { part: "identity", label: "Tür" },
  alternateNames: { part: "identity", label: "Diğer adları" },
  city: { part: "place", label: "İl" },
  district: { part: "place", label: "İlçe" },
  coordinates: { part: "place", label: "Koordinat" },
  dating: { part: "built", label: "Yapım" },
  architect: { part: "built", label: "Mimar adayları" },
  sections: { part: "sections", label: "Bölümler" },
  highlights: { part: "highlights", label: "Öne çıkanlar" },
  timeline: { part: "timeline", label: "Zaman çizelgesi" },
  facts: { part: "facts", label: "Ölçüler" },
  legends: { part: "legends", label: "Rivayetler" },
  inscriptions: { part: "inscriptions", label: "Kitabeler" },
  people: { part: "people", label: "Kişiler" },
  waqf: { part: "waqf", label: "Vakıf" },
  visit: { part: "visit", label: "Ziyaret" },
  tips: { part: "tips", label: "İpuçları" },
  accessibility: { part: "access", label: "Erişilebilirlik" },
  ambientSound: { part: "access", label: "Ses kapsülü" },
  media: { part: "media", label: "Görseller" },
};

const MESSAGE: Record<string, string> = {
  "name is required": "boş olamaz",
  "summary is required": "boş olamaz",
  "district is required": "boş olamaz",
  "a section needs a title and a text": "başlık ve metin gerekli",
  "an event needs a title": "başlık gerekli",
  "a fact needs a label and a value": "ad ve değer gerekli",
  "a legend needs a title and a text": "başlık ve metin gerekli",
  "a person needs a name": "ad gerekli",
  "an inscription needs a place": "yeri gerekli",
  "a tip needs a text": "metin gerekli",
  "a highlight needs a title": "başlık gerekli",
  "a name is required": "ad gerekli",
  "only one cover": "yalnızca bir kapak seçilebilir",
  "the end year comes after the start": "bitiş yılı başlangıçtan önce olamaz",
};

function problemsOf(record: AdminAssetRecord): Problem[] {
  const result = AdminAssetRecordInputSchema.safeParse(record);
  if (result.success) return [];
  const seen = new Set<string>();
  return result.error.issues.flatMap((issue) => {
    const [key, index] = issue.path;
    const field = FIELD[String(key)] ?? { part: "identity" as const, label: String(key) };
    const what = typeof index === "number" ? `${field.label}, ${index + 1}. öğe` : field.label;
    const text = `${what}: ${MESSAGE[issue.message] ?? (key === "type" || key === "city" ? "seçilmeli" : "eksik ya da hatalı")}`;
    if (seen.has(text)) return [];
    seen.add(text);
    return [{ part: field.part, text }];
  });
}

function Problems({ problems, onPick }: { problems: Problem[]; onPick: (part: EditPart) => void }) {
  const a = useAdminColors();
  return (
    <View style={[styles.problems, { backgroundColor: a.redSoft }]}>
      <Text colorValue={a.warning} style={styles.problemsTitle}>
        Kaydetmeden önce düzelt
      </Text>
      {problems.slice(0, 8).map((problem) => (
        <Pressable key={problem.text} accessibilityRole="link" onPress={() => onPick(problem.part)}>
          <Text colorValue={a.warning} style={{ fontSize: 13, textDecorationLine: "underline" }}>
            {problem.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Where a dataset asset's edits go: the database only, until the next import. */
function DatasetNotice() {
  const a = useAdminColors();
  return (
    <View style={[styles.notice, { backgroundColor: a.blueSoft }]}>
      <Ionicons name="information-circle-outline" size={18} color={a.primary} aria-hidden />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
        Bu eser veri setinden geliyor. Değişiklikler uygulamada hemen görünür, ama veri seti yeniden içe aktarılınca data/eserler’deki hâline döner.
      </Text>
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.back}>
      <Ionicons name="arrow-back" size={15} color={palette.gece400} aria-hidden />
      <Text color="textSecondary" style={{ fontSize: 13 }}>
        Eserler
      </Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: AdminAssetRecord["status"] }) {
  if (status === "published") return <Badge tone="green" label="Yayında" icon="radio-button-on" />;
  if (status === "in_review") return <Badge tone="blue" label="İncelemede" icon="time-outline" />;
  return <Badge tone="grey" label="Taslak" icon="document-outline" />;
}

/* ───────────── Preview ───────────── */

function PreviewColumn({ editing, samples, onSamples, children }: { editing: boolean; samples: boolean; onSamples: (on: boolean) => void; children: ReactNode }) {
  const a = useAdminColors();
  return (
    <View style={[styles.previewColumn, styles.previewContent, { borderLeftColor: a.line }]}>
      <View style={styles.previewHead}>
        <Text style={styles.previewTitle}>Önizleme</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Ionicons name="hand-left-outline" size={13} color={a.textSecondary} aria-hidden />
          <Text color="textSecondary" style={{ fontSize: 12.5 }}>
            {editing ? "Düzenlemek için telefonda bir yere tıkla" : "Bir yere tıklarsan orayı düzenlersin"}
          </Text>
        </View>
        {editing && <SamplesSwitch samples={samples} onSamples={onSamples} />}
      </View>
      {children}
    </View>
  );
}

function SamplesSwitch({ samples, onSamples }: { samples: boolean; onSamples: (on: boolean) => void }) {
  const a = useAdminColors();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: samples }} onPress={() => onSamples(!samples)} style={[styles.samples, { backgroundColor: a.card }]}>
      <Ionicons name={samples ? "eye-outline" : "eye-off-outline"} size={14} color={a.textSecondary} aria-hidden />
      <Text color="textSecondary" style={{ fontSize: 12.5 }}>
        {samples ? "Boş alanlarda örnek metin" : "Ziyaretçinin göreceği hâli"}
      </Text>
    </Pressable>
  );
}

/**
 * Fades the sample texts the preview puts in empty fields, so they read as a template. The app's
 * page draws them like any text, so on the web the frame's text elements are checked as they change.
 */
function useFadedSamples(on: boolean) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const root = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !root || typeof MutationObserver === "undefined") return;
    // A text cut short ("…"), or a longer one built on a sample ("Bânînin adı yaptırdı."); short samples like "Yıl" only whole.
    const isSample = (text: string) =>
      text.length >= 3 && [...SAMPLE_TEXTS].some((sample) => sample.startsWith(text.replace(/…$/, "")) || (sample.length >= 8 && text.startsWith(sample)));
    const apply = () => {
      root.querySelectorAll<HTMLElement>("[dir], div, span").forEach((node) => {
        if (node.children.length > 0) return;
        const text = (node.textContent ?? "").trim();
        const fade = on && isSample(text);
        if (fade) node.style.opacity = "0.42";
        else if (node.style.opacity === "0.42") node.style.opacity = "";
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [on]);
  return ref;
}

/** A 6.1" phone (iPhone 15/16): its screen in points, the safe areas around the island and the home bar. */
const SCREEN = { width: 393, height: 852 };
const PHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const BEZEL = 12;
const FRAME = { width: SCREEN.width + BEZEL * 2, height: SCREEN.height + BEZEL * 2 };
const DOSSIER_PARTS = new Set(PARTS.filter((p) => p.dossier).map((p) => p.part));

/**
 * The app's own asset page laid out on a phone's real screen size, with its safe areas, then the
 * whole phone scaled to fit the window: proportions and text stay as in the app. Its parts are
 * picked to be edited; closing does nothing here.
 */
function Phone({ asset, faded = false, edit }: { asset: AssetDetail; faded?: boolean; edit: FrameEditing }) {
  const { height } = useWindowDimensions();
  const screen = useFadedSamples(faded);
  const scale = Math.min(1, Math.max(0.5, (height - 170) / FRAME.height));
  const [dossier, setDossier] = useState(false);
  // A part picked in the list goes to where it is: the dossier for its own parts, the pages for the rest.
  useEffect(() => {
    if (edit.focus) setDossier(DOSSIER_PARTS.has(edit.focus.part));
  }, [edit.focus]);
  // The dossier opens inside the phone; links that would leave the page (camera, assistant) do nothing here.
  const frame: Frame = {
    open: (href) => {
      const path = typeof href === "string" ? href.split("?")[0] : href.pathname;
      if (path === "/dossier") setDossier(true);
    },
    back: () => setDossier(false),
    ...SCREEN,
    edit,
  };
  return (
    <View style={{ width: FRAME.width * scale, height: FRAME.height * scale }}>
      <View style={[styles.phone, { width: FRAME.width, height: FRAME.height, transform: [{ scale }], transformOrigin: "top left" }]}>
        <View style={[styles.button, { left: -3, top: 150, height: 32 }]} />
        <View style={[styles.button, { left: -3, top: 210, height: 62 }]} />
        <View style={[styles.button, { left: -3, top: 284, height: 62 }]} />
        <View style={[styles.button, { right: -3, top: 230, height: 96 }]} />
        <View ref={screen} style={styles.phoneScreen}>
          <InFrame.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={PHONE_INSETS}>
              <AssetDetailView key={asset.updatedAt} asset={asset} onClose={() => {}} />
              {dossier && (
                <View style={StyleSheet.absoluteFill}>
                  <DossierView asset={asset} />
                </View>
              )}
            </SafeAreaInsetsContext.Provider>
          </InFrame.Provider>
          <View style={styles.island} pointerEvents="none" />
          <View style={styles.homeBar} pointerEvents="none" />
        </View>
      </View>
    </View>
  );
}

/* ───────────── Tabs ───────────── */

function General({ asset }: { asset: AssetDetail }) {
  const a = useAdminColors();
  const dating = asset.dating;
  return (
    <View style={styles.stack}>
      <Card style={styles.overview}>
        <View style={[styles.cover, { backgroundColor: a.well }]}>
          {asset.cover ? (
            <AssetImage media={asset.cover} fill />
          ) : (
            <View style={styles.coverEmpty}>
              <Ionicons name="image-outline" size={26} color={a.textSecondary} aria-hidden />
              <Text color="textSecondary" style={{ fontSize: 12.5 }}>
                Kapak fotoğrafı yok
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 260, gap: 10 }}>
          {asset.subtitle && <Text style={styles.subtitle}>{asset.subtitle}</Text>}
          <Text style={styles.body}>{asset.summary}</Text>
          {asset.tags.length > 0 && (
            <View style={styles.chips}>
              {asset.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </View>
          )}
        </View>
      </Card>

      <Block title="Kimlik">
        <Info
          rows={[
            ["Tür", [asset.type.label, ...asset.secondaryTypes.map((type) => type.label)].join(", ")],
            ["Dönem", asset.era?.label],
            ["Diğer adları", asset.alternateNames.map((name) => (name.note ? `${name.name} (${name.note})` : name.name)).join(" · ")],
            ["Bağlı olduğu külliye", asset.parent?.name],
            ["Külliyenin yapıları", asset.children.map((child) => child.name).join(", ")],
          ]}
        />
      </Block>

      <Block title="Konum">
        <Info
          rows={[
            ["İl / ilçe", `${asset.city.label} / ${asset.district}`],
            ["Mahalle", asset.neighborhood],
            ["Adres", asset.address],
            ["Koordinat", asset.coordinates ? `${asset.coordinates.lat.toFixed(5)}, ${asset.coordinates.lng.toFixed(5)}` : null],
          ]}
        />
      </Block>

      <Block title="Yapım">
        <Info
          rows={[
            ["Tarih", dating?.display, dating?.confidence],
            ["Yıllar", dating && (dating.startYear || dating.endYear) ? [dating.startYear, dating.endYear].filter(Boolean).join("–") : null],
            ["Hicrî", dating?.hijriYear ? String(dating.hijriYear) : null],
            ["Yüzyıl", dating?.century ? `${dating.century}. yüzyıl` : null],
            ["Tarihlendirme dayanağı", dating?.basis],
            ["Bânî", asset.founder ? [asset.founder.name, asset.founder.role].filter(Boolean).join(" · ") : null, asset.founder?.confidence],
            ["Mimar", asset.architect?.name ?? (asset.architect?.candidates.length ? asset.architect.candidates.map((c) => c.name).join(" ya da ") : null), asset.architect?.confidence],
          ]}
        />
      </Block>

      {asset.waqf && (
        <Block title="Vakıf">
          <Info
            rows={[
              ["Vakıf", asset.waqf.name, asset.waqf.confidence],
              ["Vakfiye tarihi", asset.waqf.deedDate],
              ["Vakfiyeden", asset.waqf.deedExcerpt],
              ["Vakıf şartları", asset.waqf.conditions],
              ["Arazi notu", asset.waqf.landNote],
            ]}
          />
        </Block>
      )}
    </View>
  );
}

function TextTab({ asset }: { asset: AssetDetail }) {
  if (asset.sections.length === 0 && asset.highlights.length === 0) return <Nothing text="Bu eserin metin bölümü yok." />;
  return (
    <View style={styles.stack}>
      {asset.sections.map((section, i) => (
        <Card key={section.id} style={{ gap: 10 }}>
          <View style={styles.itemHead}>
            <Order value={i + 1} />
            <Text style={styles.itemTitle}>{section.title ?? "Başlıksız bölüm"}</Text>
            <Confidence value={section.confidence} />
          </View>
          <Text style={styles.body}>{section.body}</Text>
          <Sources sources={section.sources} />
        </Card>
      ))}
      {asset.highlights.length > 0 && (
        <Block title="Öne çıkanlar">
          {asset.highlights.map((highlight) => (
            <Line key={highlight.feature + highlight.title} title={highlight.title} body={highlight.hint} />
          ))}
        </Block>
      )}
    </View>
  );
}

function History({ asset }: { asset: AssetDetail }) {
  if (asset.timeline.length + asset.facts.length + asset.legends.length === 0) return <Nothing text="Bu eserin zaman çizelgesi, bilgisi ya da rivayeti yok." />;
  return (
    <View style={styles.stack}>
      {asset.timeline.length > 0 && (
        <Block title="Zaman çizelgesi">
          {asset.timeline.map((event) => (
            <View key={event.id} style={styles.event}>
              <Text style={styles.year}>{event.year ?? event.date ?? event.hijri ?? "?"}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.itemHead}>
                  <Text style={styles.lineTitle}>{event.title}</Text>
                  <Badge tone="grey" label={event.type.label} />
                  <Confidence value={event.confidence} />
                </View>
                {event.note && (
                  <Text color="textSecondary" style={styles.small}>
                    {event.note}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </Block>
      )}
      {asset.facts.length > 0 && (
        <Block title="Bilgiler">
          <Info rows={asset.facts.map((fact) => [fact.label, [fact.value ?? (fact.valueNum === null ? null : String(fact.valueNum)), fact.unit].filter(Boolean).join(" ") + (fact.note ? ` (${fact.note})` : ""), fact.confidence])} />
        </Block>
      )}
      {asset.legends.length > 0 && (
        <Block title="Rivayetler">
          {asset.legends.map((legend) => (
            <View key={legend.id} style={{ gap: 6 }}>
              <View style={styles.itemHead}>
                <Text style={styles.lineTitle}>{legend.title}</Text>
                <Badge tone={legend.verdict === "refuted_by_source" ? "red" : "gold"} label={VERDICT[legend.verdict]} />
              </View>
              <Text style={styles.body}>{legend.body}</Text>
            </View>
          ))}
        </Block>
      )}
    </View>
  );
}

function Inscriptions({ asset }: { asset: AssetDetail }) {
  if (asset.inscriptions.length + asset.people.length === 0) return <Nothing text="Bu eserin kitabesi ya da kişi kaydı yok." />;
  return (
    <View style={styles.stack}>
      {asset.inscriptions.map((inscription, i) => (
        <Card key={inscription.id} style={{ gap: 12 }}>
          <View style={styles.itemHead}>
            <Order value={i + 1} />
            <Text style={styles.itemTitle}>{inscription.location ?? "Kitabe"}</Text>
            {inscription.arTarget ? <Badge tone="green" label="AR hazır" icon="scan-outline" /> : inscription.arTargetMediaKey ? <Badge tone="gold" label="AR derlenmedi" /> : null}
          </View>
          <Info
            rows={[
              ["Dil / yazı", [LANGUAGE[inscription.language] ?? inscription.language, inscription.script].filter(Boolean).join(" · ")],
              ["Tarih", [inscription.gregorian, inscription.hijriYear ? `H. ${inscription.hijriYear}` : null].filter(Boolean).join(" · ")],
              ["Yazan", inscription.author],
            ]}
          />
          {inscription.transliteration && <Quote label="Okunuş" text={inscription.transliteration} />}
          {inscription.translation && <Quote label="Anlamı" text={inscription.translation} />}
          {inscription.note && (
            <Text color="textSecondary" style={styles.small}>
              {inscription.note}
            </Text>
          )}
          <Sources sources={inscription.sources} />
        </Card>
      ))}
      {asset.people.length > 0 && (
        <Block title="Kişiler">
          <Info rows={asset.people.map((person) => [person.name, person.role ?? "—"])} />
        </Block>
      )}
    </View>
  );
}

function Visit({ asset }: { asset: AssetDetail }) {
  const access = asset.accessibility;
  return (
    <View style={styles.stack}>
      <Block title="Ziyaret">
        <Info
          rows={[
            ["Ortam", asset.visit.setting],
            ["Süre", asset.visit.durationMin ? `${asset.visit.durationMin} dakika` : null],
            ["Giriş ücreti", asset.visit.entranceFee],
            ["Notlar", asset.visit.notes],
          ]}
          empty="Ziyaret bilgisi girilmemiş."
        />
      </Block>
      <Block title="Erişilebilirlik" hint={access.verified ? "Yerinde doğrulandı" : "Yerinde doğrulanmadı"}>
        <View style={styles.access}>
          <Access label="Tekerlekli sandalye" value={access.wheelchair} />
          <Access label="Basamaksız giriş" value={access.stepFree} />
          <Access label="Rampa" value={access.ramp} />
          <Access label="Tuvalet" value={access.toilet} />
        </View>
        <Info
          rows={[
            ["Notlar", access.notes],
            ["Sesli betimleme", access.audioDescription],
          ]}
        />
      </Block>
      <Block title="Ses kapsülü">
        <Info
          rows={[
            ["Ses", asset.ambientSound?.key],
            ["Alt yazı", asset.ambientSound?.caption],
            ["Kayıt", asset.ambientSound ? (asset.ambientSound.recording ? `${Math.round(asset.ambientSound.recording.durationSeconds)} sn · ${asset.ambientSound.recording.license}` : "Henüz kayıt yok") : null],
          ]}
          empty="Ses kapsülü yok."
        />
      </Block>
      {asset.visitorTips.length > 0 && (
        <Block title="Ziyaretçi ipuçları">
          {asset.visitorTips.map((tip, i) => (
            <Line key={i} title={tip.text} body={[TIP_ORIGIN[tip.origin], tip.collectedAt && formatDate(tip.collectedAt)].filter(Boolean).join(" · ")} />
          ))}
        </Block>
      )}
    </View>
  );
}

function MediaTab({ asset }: { asset: AssetDetail }) {
  const a = useAdminColors();
  if (asset.media.length + asset.sources.length === 0) return <Nothing text="Bu eserin görseli ya da kaynağı yok." />;
  return (
    <View style={styles.stack}>
      {asset.media.length > 0 && (
        <Block title="Görseller">
          <View style={styles.gallery}>
            {asset.media.map((media) => (
              <View key={media.key} style={[styles.photo, { backgroundColor: a.well }]}>
                <View style={styles.photoImage}>
                  <AssetImage media={media} fill />
                  {media.isCover && (
                    <View style={styles.photoBadge}>
                      <Badge tone="gold" label="Kapak" />
                    </View>
                  )}
                </View>
                <View style={{ padding: 10, gap: 2 }}>
                  <Text style={styles.photoCaption} numberOfLines={2}>
                    {media.caption ?? media.alt}
                  </Text>
                  <Text color="textSecondary" style={{ fontSize: 11.5 }} numberOfLines={1}>
                    {[MEDIA_KIND[media.kind], media.archiveYear, media.credit, media.license].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Block>
      )}
      {asset.sources.length > 0 && (
        <Block title="Kaynakça">
          {asset.sources.map((source, i) => (
            <View key={source.sourceId} style={styles.source}>
              <Text color="textSecondary" style={styles.sourceNumber}>
                {i + 1}
              </Text>
              <Text style={[styles.small, { flex: 1 }]}>
                {source.title}
                {source.pages ? `, s. ${source.pages}` : ""}
              </Text>
              {source.url && <Ionicons name="link-outline" size={15} color={a.textSecondary} aria-hidden />}
            </View>
          ))}
        </Block>
      )}
    </View>
  );
}

/* ───────────── Pieces ───────────── */

const VERDICT = { folk_belief: "Halk inanışı", refuted_by_source: "Kaynaklarca çürütülmüş", unverified: "Doğrulanmamış" } as const;
const TIP_ORIGIN = { field_visit: "Saha ziyareti", visitor_reviews_summary: "Ziyaretçi yorumlarından", official: "Resmî" } as const;
const LANGUAGE: Record<string, string | undefined> = { ar: "Arapça", fa: "Farsça", tr: "Türkçe", "tr-ottoman": "Osmanlı Türkçesi", el: "Rumca", other: "Diğer" };
const MEDIA_KIND = { photo: "Fotoğraf", archive_photo: "Arşiv fotoğrafı", drawing: "Çizim", audio: "Ses", video: "Video", document: "Belge" } as const;
const ACCESS: Record<string, { label: string; tone: Tone }> = {
  yes: { label: "Var", tone: "green" },
  partial: { label: "Kısmen", tone: "gold" },
  no: { label: "Yok", tone: "red" },
  unknown: { label: "Bilinmiyor", tone: "grey" },
};

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.itemHead}>
        <Text style={styles.itemTitle}>{title}</Text>
        {hint && (
          <Text color="textSecondary" style={{ fontSize: 12.5 }}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </Card>
  );
}

type Confidence = AssetDetail["sections"][number]["confidence"] | null | undefined;

/** Label and value rows; empty values are left out. */
function Info({ rows, empty }: { rows: Array<[string, string | null | undefined, Confidence?]>; empty?: string }) {
  const a = useAdminColors();
  const shown = rows.filter(([, value]) => value && value.trim());
  if (shown.length === 0) {
    return (
      <Text color="textSecondary" style={styles.small}>
        {empty ?? "Henüz eklenmedi. “Düzenle” ile ekleyebilirsin; uygulamada bu kısım görünmez."}
      </Text>
    );
  }
  return (
    <View style={[styles.info, { backgroundColor: a.well }]}>
      {shown.map(([label, value, confidence], i) => (
        <View key={label + i} style={[styles.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: a.line }]}>
          <Text color="textSecondary" style={styles.infoLabel}>
            {label}
          </Text>
          <View style={styles.infoValue}>
            <Text style={styles.small}>{value}</Text>
            <Confidence value={confidence} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Shown only when a statement is less than certain. */
function Confidence({ value }: { value: Confidence }) {
  if (!value || value.code === "certain") return null;
  return <Badge tone={value.code === "probable" ? "blue" : value.code === "legend" ? "gold" : "red"} label={value.label} />;
}

function Sources({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <Text color="textSecondary" style={{ fontSize: 12 }} numberOfLines={2}>
      Kaynak: {sources.map((source) => (source.pages ? `${source.title}, s. ${source.pages}` : source.title)).join(" · ")}
    </Text>
  );
}

function Order({ value }: { value: number }) {
  const a = useAdminColors();
  return (
    <View style={[styles.number, { backgroundColor: a.ink }]}>
      <Text colorValue={a.onInk} style={styles.numberText}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  const a = useAdminColors();
  return (
    <View style={[styles.chip, { backgroundColor: a.well }]}>
      <Text style={{ fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function Line({ title, body }: { title: string; body?: string | null }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.lineTitle}>{title}</Text>
      {body ? (
        <Text color="textSecondary" style={styles.small}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  const a = useAdminColors();
  return (
    <View style={[styles.quote, { borderLeftColor: a.goldMark }]}>
      <Text color="textSecondary" style={{ fontSize: 11.5, fontFamily: fontFamily.sansSemiBold }}>
        {label}
      </Text>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

function Access({ label, value }: { label: string; value: string }) {
  const a = useAdminColors();
  const look = ACCESS[value] ?? ACCESS.unknown!;
  return (
    <View style={[styles.accessItem, { backgroundColor: a.well }]}>
      <Text style={{ fontSize: 12.5, fontFamily: fontFamily.sansMedium }}>{label}</Text>
      <Badge tone={look.tone} label={look.label} />
    </View>
  );
}

/** A tab with nothing in it: the app leaves the part out, and "Düzenle" is where it is added. */
function Nothing({ text }: { text: string }) {
  return (
    <Card>
      <Empty icon="document-outline" title={text} body="Uygulamada bu kısım görünmez. “Düzenle” ile ekleyebilirsin." />
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, marginBottom: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -10, marginBottom: 18 },
  stack: { gap: 16 },
  overview: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  cover: { width: 260, height: 180, borderRadius: 18, overflow: "hidden" },
  coverEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  subtitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 15 },
  body: { fontSize: 14, lineHeight: 22 },
  small: { fontSize: 13.5, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  itemTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, letterSpacing: -0.2 },
  lineTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  number: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: fontFamily.sansBold, fontSize: 12 },
  info: { borderRadius: 16, overflow: "hidden" },
  infoRow: { flexDirection: "row", gap: 16, paddingHorizontal: 14, paddingVertical: 11, flexWrap: "wrap" },
  infoLabel: { width: 170, fontSize: 13, fontFamily: fontFamily.sansMedium },
  infoValue: { flex: 1, minWidth: 200, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  event: { flexDirection: "row", gap: 14 },
  year: { width: 64, fontFamily: fontFamily.sansBold, fontSize: 15, fontVariant: ["tabular-nums"] },
  quote: { borderLeftWidth: 3, paddingLeft: 12, gap: 4 },
  access: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  accessItem: { flexGrow: 1, flexBasis: 180, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  photo: { width: 220, borderRadius: 16, overflow: "hidden" },
  photoImage: { height: 150 },
  photoBadge: { position: "absolute", top: 8, left: 8 },
  photoCaption: { fontSize: 12.5, fontFamily: fontFamily.sansMedium },
  source: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sourceNumber: { width: 20, fontSize: 12.5, fontFamily: fontFamily.sansSemiBold, textAlign: "right" },
  previewColumn: { width: 480, flexGrow: 0, borderLeftWidth: 1 },
  previewContent: { alignItems: "center", paddingTop: 28, paddingBottom: 28, gap: 16 },
  samples: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 16, marginBottom: 16 },
  problems: { gap: 4, padding: 14, borderRadius: 16, marginBottom: 16 },
  problemsTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 13.5, marginBottom: 2 },
  previewHead: { alignItems: "center", gap: 4 },
  editor: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  // Sticky (web): the list stays in view while a long part scrolls.
  nav: { width: 236, flexGrow: 0, flexShrink: 0, borderRadius: 22, padding: 10, gap: 10, position: "sticky", top: 0 },
  navHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 8, paddingTop: 4 },
  navTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 14 },
  progress: { height: 4, borderRadius: 2, marginHorizontal: 8, overflow: "hidden" },
  navGroup: { fontFamily: fontFamily.sansSemiBold, fontSize: 10.5, letterSpacing: 0.8, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  navLabel: { flex: 1, fontSize: 13.5 },
  navCount: { fontFamily: fontFamily.sansSemiBold, fontSize: 11.5 },
  navEmpty: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, opacity: 0.5, marginRight: 2 },
  panel: { flex: 1, minWidth: 0 },
  panelHead: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  panelIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  panelTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 19, letterSpacing: -0.3 },
  panelFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 4 },
  previewTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 17 },
  phone: { borderRadius: 64, padding: BEZEL, backgroundColor: palette.gece1000, borderWidth: 2, borderColor: "#3A3F47", boxShadow: "0 30px 60px rgba(6,8,13,0.28)" },
  phoneScreen: { width: SCREEN.width, height: SCREEN.height, borderRadius: 52, overflow: "hidden", backgroundColor: palette.gece950 },
  button: { position: "absolute", width: 4, borderRadius: 2, backgroundColor: "#3A3F47" },
  island: { position: "absolute", top: 11, alignSelf: "center", width: 124, height: 36, borderRadius: 18, backgroundColor: "#000" },
  homeBar: { position: "absolute", bottom: 8, alignSelf: "center", width: 136, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)" },
});

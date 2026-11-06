import Ionicons from "@expo/vector-icons/Ionicons";
import { AdminAssetRecordInputSchema, type AdminAssetRecord, type AssetDetail } from "@vagabonds/contracts";
import { fontFamily, palette, Text } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { DossierView } from "@/app/dossier";
import { AssetDetailView } from "@/components/asset-detail";
import { createAssetRecord, fetchAssetPreview, fetchAssetRecord, fetchMetaEnums, fetchPanelAssets, saveAssetRecord } from "@/data/admin";
import { withBlocks } from "@/lib/dossier-custom";
import { mergePhotos, placementsIn } from "@/lib/dossier-photos";
import { fieldIn, FRAME_ROOT_ID, InFrame, revealNode, type Frame, type FrameEditing } from "@/lib/in-frame";

import { Badge, Button, Card, Confirm, errorText, Failed, formatDate, Loading, PageHeader, Segments, Toast, useAdminColors, useLoad, useToast } from "./kit";
import { SECTION_TITLE, STEPS, type Section, type Step, type StepProps } from "./asset-steps";
import { previewOf, SAMPLE_TEXTS } from "./record-preview";
import { fieldId } from "./record-fields";
import { PageBody } from "./shell";

/**
 * An asset's page in the panel: questions one at a time, next to the app's page in a phone that
 * shows where each answer goes and follows every keystroke. The questions go through the asset's
 * pages, then its dossier; any can be skipped, and the last screen says what is filled and saves.
 * Pressing a part of the phone, or a step in the list of steps, goes straight to its question.
 * A new asset starts empty, with faded sample texts where nothing is filled in yet.
 */

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
  customBlocks: [],
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
  // Unsaved changes; null while the form shows the record as saved.
  const [draft, setDraft] = useState<AdminAssetRecord | null>(null);
  const [at, setAt] = useState(0);
  const [focus, setFocus] = useState<FrameEditing["focus"]>(null);
  // The one field being edited, picked on the phone or in the form; null for the question as a whole.
  const [field, setField] = useState<string | null>(null);
  // A field picked on the phone, for the form to open and focus.
  const [target, setTarget] = useState<{ field: string; n: number } | null>(null);
  // What the phone shows: the asset's pages, or its dossier open over them.
  const [view, setView] = useState<Section>("pages");
  const [showSteps, setShowSteps] = useState(false);
  const [samples, setSamples] = useState(creating);
  // After a save is stopped, what is still wrong is checked again as the form changes.
  const [checked, setChecked] = useState(false);
  const [leaving, setLeaving] = useState<"back" | "discard" | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();
  const colors = useAdminColors();
  const preview = useLoad(() => (id ? fetchAssetPreview(id) : Promise.resolve(null)), [id]);
  const loaded = useLoad(() => (id ? fetchAssetRecord(id) : Promise.resolve(null)), [id]);
  const meta = useLoad(fetchMetaEnums);
  const assets = useLoad(fetchPanelAssets);

  const saved = creating ? EMPTY : (loaded.data?.record ?? null);
  const record = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const problems = useMemo(() => (checked && record ? problemsOf(record) : []), [checked, record]);
  const steps = useMemo(() => (record ? STEPS.filter((step) => !step.when || step.when(record)) : STEPS), [record]);
  // The phone follows the form a beat behind the keys, so typing stays quick.
  const typed = useDeferredValue(record);
  // Photos set between the dossier's blocks and the blocks the admin adds: both are the record's own
  // (media[].dossierAfter, customBlocks), so they are saved with it and come back with it.
  const placements = useMemo(() => placementsIn(typed), [typed]);
  const customBlocks = useMemo(
    () => (typed?.customBlocks ?? []).map((b) => ({ id: b.id, title: b.title.tr, body: b.body.tr, after: b.after })),
    [typed],
  );
  const phone = useMemo(
    () => (typed ? previewOf(typed, { id: id ?? "yeni-eser", meta: meta.data, base: preview.data, samples, placements, customBlocks }) : null),
    [typed, id, meta.data, preview.data, samples, placements, customBlocks],
  );

  const reload = () => {
    preview.reload();
    loaded.reload();
  };

  /** Shows a place on the phone: the pages or the dossier, scrolled to the field. */
  const showOnPhone = (section: Section, place: string | undefined) => {
    setView(section);
    if (place) setFocus({ field: place, n: Date.now() });
  };
  /** Goes to a step (or past the last one, to the end), and the phone to where its answer shows. */
  const go = (index: number) => {
    const next = Math.max(0, Math.min(index, steps.length));
    setAt(next);
    setShowSteps(false);
    setField(null);
    const step = steps[next];
    if (step) showOnPhone(step.section, step.phone[step.section]);
    else setView("pages");
  };
  const goToStep = (key: string) => go(steps.findIndex((s) => s.key === key));
  const stepOf = (name: string) => steps.findIndex((s) => s.fields.some((f) => fieldIn(name, f)));

  const step: Step | undefined = steps[at];
  // The phone keeps the field being typed into, or else the question's place, in view as the answer changes.
  const shown = field ?? (step ? (step.phone[view] ?? step.phone[step.section]) : undefined);
  const typing = useRef(typed);
  useEffect(() => {
    if (typing.current === typed) return;
    typing.current = typed;
    if (shown) setFocus({ field: shown, n: Date.now(), soft: true });
  }, [typed, shown]);
  // Pressing into any field of the question shows its place on the phone: the nearest place named
  // on the field or around it, else the question's own, on the screen (pages or dossier) it is on.
  const onFormFocus = useRef<(node: HTMLElement) => void>(() => {});
  onFormFocus.current = (node) => {
    if (!step) return;
    let name: string | null = null;
    for (let el: HTMLElement | null = node; el && !name && el.dataset.question === undefined; el = el.parentElement) {
      if (el.id.startsWith(fieldId(""))) name = el.id.slice(fieldId("").length);
      else if (el.dataset.phone) name = el.dataset.phone;
    }
    const place = name ? (PLACE_ALIAS[name] ?? name) : null;
    const on = place ? screensOf(place) : [];
    // A place left empty is not drawn on the screen shown; the question's place stands in for it.
    const drawn = (field: string) => [...document.querySelectorAll<HTMLElement>(`#${FRAME_ROOT_ID} [data-edit-field]`)].some((el) => fieldIn(el.dataset.editField ?? "", field) || fieldIn(field, el.dataset.editField ?? ""));
    const screen = on.includes(view) ? (drawn(place!) ? view : null) : (on[0] ?? null);
    const section = screen ?? (step.phone[view] ? view : step.section);
    const shownPlace = screen ? place! : step.phone[section];
    if (section !== view) setView(section);
    setField(shownPlace ?? null);
    if (shownPlace) setFocus({ field: shownPlace, n: Date.now(), soft: true });
  };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onFocus = (event: FocusEvent) => {
      const node = event.target as HTMLElement | null;
      if (node?.closest("[data-question]")) onFormFocus.current(node);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
  const frameEditing: FrameEditing = {
    state: (name) => (field && (fieldIn(name, field) || fieldIn(field, name)) ? "field" : step?.fields.some((f) => fieldIn(name, f)) ? "step" : null),
    // A piece pressed on the phone opens its question, with its own field picked.
    pick: (name) => {
      const index = stepOf(name);
      if (index < 0) return;
      if (index !== at) {
        setAt(index);
        setShowSteps(false);
      }
      setField(name);
      setTarget({ field: name === "cover:year" ? "year" : name, n: Date.now() });
    },
    focus,
    samples,
  };

  const save = async () => {
    if (!record) return;
    const found = problemsOf(record);
    setChecked(true);
    if (found.length > 0) {
      goToStep(found[0]!.step);
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        const created = await createAssetRecord(record);
        router.replace(`/admin/assets/${created.id}`);
        return;
      }
      const result = await saveAssetRecord(id, record);
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

  /**
   * After a photo is uploaded or removed (the server keeps it at once): the record and the phone are
   * read again, and changes not saved yet stay on top of them, so a later save does not undo it.
   */
  const photosChanged = async () => {
    if (!id) return;
    const fresh = await fetchAssetRecord(id);
    loaded.setData(fresh);
    preview.reload();
    setDraft((current) => (current ? { ...current, media: mergePhotos(current.media, fresh.record.media) } : null));
  };

  const back = () => router.push("/admin/assets");
  const confirmLeave = () => {
    const was = leaving;
    setLeaving(null);
    if (was === "back" || creating) back();
    else {
      setDraft(null);
      setChecked(false);
    }
  };

  if ((preview.error && !preview.data) || (loaded.error && !loaded.data)) {
    return (
      <PageBody>
        <BackLink onPress={back} />
        <Card>
          <Failed message={preview.error ?? loaded.error ?? ""} onRetry={reload} />
        </Card>
      </PageBody>
    );
  }
  if (!record || (!creating && !preview.data)) {
    return (
      <PageBody>
        <Loading />
      </PageBody>
    );
  }

  const asset = preview.data;
  const title = record.name.tr.trim() || (creating ? "Yeni eser" : (asset?.name ?? ""));
  const props: StepProps = { record, set: (change) => setDraft({ ...record, ...change }), meta: meta.data, base: asset, assets: assets.data ?? [], placements: placementsIn(record), setPlacements: (next) => setDraft({ ...record, media: record.media.map((m) => ({ ...m, dossierAfter: next[m.key] ?? null })) }), customBlocks: record.customBlocks, setCustomBlocks: (customBlocks) => setDraft(withBlocks(record, customBlocks)), assetId: id, onPhotosChanged: photosChanged, showPlace: (section, place) => {
      setView(section);
      setField(place);
      setFocus({ field: place, n: Date.now(), soft: true });
    } };

  // One quiet line under the title: where the asset comes from and when it was last saved.
  const about = creating
    ? "Taslakken yalnızca panelde görünür; “Yayında” seçip eklersen uygulamada da görünür."
    : [
        loaded.data!.origin === "panel" ? "Panelden eklendi" : "Veri setinden",
        `son kayıt ${formatDate(asset!.updatedAt)}`,
        loaded.data!.origin === "dataset" ? "veri seti yeniden yüklenince değişiklikler silinir" : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const actions = (
    <>
      <Segments
        label="Uygulamada görünsün mü?"
        value={record.status === "published" ? "published" : "draft"}
        onChange={(status) => setDraft({ ...record, status })}
        options={[
          { value: "draft", label: "Taslak" },
          { value: "published", label: "Yayında" },
        ]}
      />
      {dirty && <Button label="Vazgeç" kind="ghost" onPress={() => setLeaving("discard")} />}
      <Button label={creating ? "Eseri ekle" : "Kaydet"} icon="checkmark" kind="primary" busy={busy} disabled={!dirty && !creating} onPress={() => void save()} />
    </>
  );

  const details = (
    <>
      <BackLink onPress={() => (dirty ? setLeaving("back") : back())} />
      <PageHeader title={title} hint={about} actions={actions} tools={false} />
      {dirty && (
        <View style={styles.statusRow}>
          <Badge tone="gold" label="Kaydedilmemiş değişiklikler" icon="create-outline" />
        </View>
      )}
      <Progress steps={steps} at={at} record={record} open={showSteps} onToggle={() => setShowSteps(!showSteps)} onPick={go} />
      {step ? (
        <Question key={step.key} step={step} props={props} problems={problems.filter((p) => p.step === step.key)} target={target} onShow={(section) => showOnPhone(section, step.phone[section])} />
      ) : (
        <Finish steps={steps} record={record} problems={problems} creating={creating} busy={busy} dirty={dirty} onPick={go} onSave={() => void save()} />
      )}
      {step && (
        <View style={styles.foot}>
          {at > 0 ? <Button kind="ghost" icon="arrow-back" label="Geri" onPress={() => go(at - 1)} /> : <View />}
          <View style={{ flexDirection: "row", gap: 10 }}>
            {!step.done(record) && !step.required && <Button kind="secondary" label="Atla" onPress={() => go(at + 1)} />}
            <Button kind="primary" label={at === steps.length - 1 ? "Bitir" : "İleri"} icon="arrow-forward" onPress={() => go(at + 1)} />
          </View>
        </View>
      )}
      {!split && phone && (
        <View style={{ alignItems: "center", marginTop: 28 }}>
          <PhoneView view={view} onView={setView} samples={samples} onSamples={setSamples}>
            <Phone asset={phone} faded={samples} edit={frameEditing} view={view} onView={setView} />
          </PhoneView>
        </View>
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
            <View style={[styles.previewColumn, { borderLeftColor: colors.line }]}>
              <PhoneView view={view} onView={setView} samples={samples} onSamples={setSamples}>
                <Phone asset={phone} faded={samples} edit={frameEditing} view={view} onView={setView} />
              </PhoneView>
            </View>
          )}
        </View>
      ) : (
        <PageBody>{details}</PageBody>
      )}
      {leaving && (
        <Confirm
          title="Değişiklikler kaydedilmedi"
          body={leaving === "back" ? "Çıkarsan yaptığın değişiklikler kaybolur." : "Yaptığın değişiklikler silinir, eser kayıtlı hâline döner."}
          confirmLabel={leaving === "back" ? "Kaydetmeden çık" : "Değişiklikleri sil"}
          danger
          onConfirm={confirmLeave}
          onCancel={() => setLeaving(null)}
        />
      )}
      <Toast toast={toast} />
    </View>
  );
}

/* ───────────── Steps ───────────── */


/** What each question writes that has an English beside its Turkish. */
const ENGLISH_OF: Record<string, (r: AdminAssetRecord) => Array<Pair | null>> = {
  name: (r) => [r.name, r.subtitle, ...r.alternateNames.map((n) => n.name)],
  summary: (r) => [r.summary],
  built: (r) => [r.dating.display, r.dating.basis],
  facts: (r) => r.facts.map((f) => f.label),
  media: (r) => r.media.flatMap((m) => [m.caption, m.alt]),
  sections: (r) => r.sections.flatMap((x) => [x.title, x.body]),
  highlights: (r) => r.highlights.flatMap((h) => [h.title, h.hint]),
  visit: (r) => [r.visit.notes],
  audio: (r) => [r.accessibility.audioDescription, r.ambientSound.caption],
  tips: (r) => r.tips.map((t) => t.text),
  timeline: (r) => r.timeline.map((e) => e.title),
  people: (r) => r.people.map((p) => p.role),
  inscriptions: (r) => r.inscriptions.flatMap((n) => [n.location, n.translation]),
  waqf: (r) => [r.waqf.deedExcerpt, r.waqf.conditions, r.waqf.landNote],
  legends: (r) => r.legends.flatMap((l) => [l.title, l.body]),
  access: (r) => [r.accessibility.notes],
};

type Pair = { tr: string; en: string | null };

/** Form fields whose answer shows under another name on the phone. */
const PLACE_ALIAS: Record<string, string> = { coords: "visit", dating: "year" };

/** The phone's marked places, on the pages and in the dossier. */
const PAGE_PLACES = ["type", "name", "subtitle", "cover:year", "place", "media", "summary", "founder", "year", "fact", "highlight", "section", "visit", "audio", "tip"];
const DOSSIER_PLACES = ["custom", "photo-in", "year", "founder", "architect", "altNames", "address", "parent", "section", "event", "person", "inscription", "fact", "legend", "waqf", "access"];

/** The screens a place is marked on, the pages first. */
function screensOf(place: string): Section[] {
  const on: Section[] = [];
  if (PAGE_PLACES.some((p) => fieldIn(place, p))) on.push("pages");
  if (DOSSIER_PLACES.some((p) => fieldIn(place, p))) on.push("dossier");
  return on;
}

/** Where the questions are: the step and its part of the app, a bar, and every step to jump to. */
function Progress({ steps, at, record, open, onToggle, onPick }: { steps: Step[]; at: number; record: AdminAssetRecord; open: boolean; onToggle: () => void; onPick: (index: number) => void }) {
  const a = useAdminColors();
  const step = steps[at];
  const questions = steps.filter((s) => !s.intro);
  return (
    <View style={{ gap: 10, marginBottom: 18 }}>
      <View style={styles.progressHead}>
        <Text color="textSecondary" style={styles.progressText}>
          {step ? (step.intro ? SECTION_TITLE[step.section] : `Soru ${questions.indexOf(step) + 1} / ${questions.length}  ·  ${SECTION_TITLE[step.section]}`) : "Son kontrol"}
        </Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.allSteps}>
          <Ionicons name="list-outline" size={15} color={a.text} aria-hidden />
          <Text style={styles.allStepsText}>Tüm sorular</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={a.textSecondary} aria-hidden />
        </Pressable>
      </View>
      <View style={[styles.bar, { backgroundColor: a.line }]}>
        <View style={{ width: `${(Math.min(at, steps.length) / steps.length) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: a.goldMark }} />
      </View>
      {open && <StepList steps={steps} at={at} record={record} onPick={onPick} />}
    </View>
  );
}

/** Every question, in its section, with a tick when answered. */
function StepList({ steps, at, record, onPick, problems = [] }: { steps: Step[]; at: number; record: AdminAssetRecord; onPick: (index: number) => void; problems?: Problem[] }) {
  const a = useAdminColors();
  return (
    <View style={[styles.stepList, { backgroundColor: a.card }]}>
      {(["pages", "dossier"] as const).map((section) => (
        <View key={section} style={{ flexGrow: 1, flexBasis: 260, gap: 2 }}>
          <Text color="textSecondary" style={styles.stepSection}>
            {SECTION_TITLE[section].toLocaleUpperCase("tr")}
          </Text>
          {steps.map((step, index) => {
            if (step.section !== section || step.intro) return null;
            const done = step.done(record);
            const wrong = problems.some((p) => p.step === step.key);
            return (
              <Pressable
                key={step.key}
                accessibilityRole="button"
                aria-current={index === at ? "step" : undefined}
                onPress={() => onPick(index)}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.stepRow, { backgroundColor: index === at ? a.well : hovered ? a.hover : "transparent" }]}
              >
                <Ionicons
                  name={wrong ? "alert-circle" : done ? "checkmark-circle" : "ellipse-outline"}
                  size={17}
                  color={wrong ? a.warning : done ? a.success : a.textSecondary}
                  aria-label={wrong ? "Düzeltilmeli" : done ? "Cevaplandı" : "Boş"}
                />
                <Text style={{ flex: 1, fontSize: 13.5 }}>{step.title}</Text>
                {step.required && !done && (
                  <Text colorValue={a.warning} style={styles.required}>
                    Gerekli
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** One question: what is asked, why, its fields, and its rarer details under them. */
function Question({ step, props, problems, target, onShow }: { step: Step; props: StepProps; problems: Problem[]; target: { field: string; n: number } | null; onShow: (section: Section) => void }) {
  const a = useAdminColors();
  const { Body, More } = step;
  // A field picked on the phone: bring its input into view and focus it.
  useEffect(() => {
    if (!target || Platform.OS !== "web" || !step.fields.some((f) => fieldIn(target.field, f))) return;
    const timer = setTimeout(() => {
      const id = fieldId(target.field);
      const node = document.getElementById(id) ?? document.querySelector<HTMLElement>(`[id^="${id}:"]`);
      if (!node) return;
      revealNode(node);
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [target, step]);
  return (
    <View {...({ dataSet: { question: "" } } as object)} style={[styles.question, { backgroundColor: a.well, borderColor: a.line, boxShadow: a.shadow }]}>
      <View style={[styles.band, { backgroundColor: a.card, borderBottomColor: a.line }]}>
        <Text color="textSecondary" style={styles.showsTitle}>
          Bu bilgiler nerede görünüyor?
        </Text>
        <View style={styles.shows}>
          {step.shows.map((where) => (
            <Where key={where.in} section={where.in} place={where.place} onPress={() => onShow(where.in)} />
          ))}
        </View>
      </View>
      <View style={styles.questionBody}>
        <View style={{ gap: 4 }}>
          <Text headingLevel={2} style={styles.questionText}>
            {step.question}
            {step.required && <Text colorValue={a.warning} style={styles.questionText}>{" *"}</Text>}
          </Text>
          <Text color="textSecondary" style={styles.help}>
            {step.help}
          </Text>
        </View>
        {problems.length > 0 && (
          <View style={[styles.problems, { backgroundColor: a.redSoft }]}>
            {problems.map((problem) => (
              <Text key={problem.text} colorValue={a.warning} style={{ fontSize: 13 }}>
                {problem.text}
              </Text>
            ))}
          </View>
        )}
        <View style={{ gap: 12 }}>
          <Body {...props} />
        </View>
        {More && (
          <View style={[styles.more, { borderTopColor: a.line }]}>
            <Text color="textSecondary" style={styles.moreTitle}>
              Ayrıntılar · isteğe bağlı
            </Text>
            <More {...props} />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Where an answer shows in the app, in the colour of its screen: gold for the asset's pages, blue
 * for its dossier. Pressed, the phone goes there.
 */
function Where({ section, place, onPress }: { section: Section; place: string; onPress: () => void }) {
  const a = useAdminColors();
  const dossier = section === "dossier";
  const color = dossier ? a.primary : a.gold;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dossier ? "Eserin dosyasında" : "Kaydırmalı sayfalarda"} görünür: ${place}. Telefonda göster`}
      onPress={onPress}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.where, { backgroundColor: dossier ? a.blueSoft : a.goldSoft }, hovered && { opacity: 0.8 }]}
    >
      <Ionicons name={dossier ? "document-text-outline" : "swap-vertical-outline"} size={15} color={color} aria-hidden />
      <Text colorValue={color} style={styles.whereSection}>
        {dossier ? "Eserin dosyasında" : "Kaydırmalı sayfalarda"}
      </Text>
      <Text colorValue={color} style={styles.wherePlace}>
        {place}
      </Text>
    </Pressable>
  );
}

/** Past the last question: what is answered, what is left, and the save. */
function Finish({ steps, record, problems, creating, busy, dirty, onPick, onSave }: { steps: Step[]; record: AdminAssetRecord; problems: Problem[]; creating: boolean; busy: boolean; dirty: boolean; onPick: (index: number) => void; onSave: () => void }) {
  const a = useAdminColors();
  const questions = steps.filter((s) => !s.intro);
  const done = questions.filter((s) => s.done(record)).length;
  const missing = questions.filter((s) => s.required && !s.done(record));
  // Turkish written without its English: the app in English would show the Turkish instead.
  const untranslated = questions.flatMap((s) => {
    const count = (ENGLISH_OF[s.key]?.(record) ?? []).filter((text) => !!text?.tr.trim() && !text.en?.trim()).length;
    return count > 0 ? [{ label: count > 1 ? `${s.title} (${count})` : s.title, step: s.key }] : [];
  });
  return (
    <View style={[styles.question, styles.questionBody, { backgroundColor: a.well, borderColor: a.line, boxShadow: a.shadow }]}>
      <View style={{ gap: 6 }}>
        <Text headingLevel={2} style={styles.questionText}>
          {missing.length > 0 ? "Birkaç zorunlu soru kaldı" : "Hepsi bu kadar"}
        </Text>
        <Text color="textSecondary" style={styles.help}>
          {missing.length > 0
            ? `${missing.map((s) => s.title.toLocaleLowerCase("tr")).join(", ")} olmadan eser kaydedilemez.`
            : `${questions.length} sorudan ${done} tanesi cevaplandı. Boş bıraktıkların uygulamada görünmez; istediğin zaman geri gelip doldurabilirsin.`}
        </Text>
      </View>
      {untranslated.length > 0 && (
        <View style={[styles.english, { backgroundColor: a.goldSoft }]}>
          <Ionicons name="language-outline" size={18} color={a.gold} aria-hidden />
          <Text style={{ fontSize: 13.5 }}>İngilizcesi yazılmamış:</Text>
          {untranslated.map((item) => (
            <Pressable key={item.label} accessibilityRole="link" onPress={() => onPick(steps.findIndex((s) => s.key === item.step))}>
              <Text colorValue={a.gold} style={styles.englishLink}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <StepList steps={steps} at={-1} record={record} onPick={onPick} problems={problems} />
      <View style={{ alignItems: "flex-start" }}>
        <Button kind="primary" icon="checkmark" label={creating ? "Eseri ekle" : "Kaydet"} busy={busy} disabled={!dirty && !creating} onPress={onSave} />
      </View>
    </View>
  );
}

/** What stops a record from being saved, in Turkish, with the question to fix it in. */
interface Problem {
  step: string;
  text: string;
}

const FIELD: Record<string, { step: string; label: string }> = {
  name: { step: "name", label: "Adı" },
  type: { step: "type", label: "Türü" },
  city: { step: "place", label: "İl" },
  district: { step: "place", label: "İlçe" },
  coordinates: { step: "place", label: "Konum" },
  summary: { step: "summary", label: "Kısa tanıtım" },
  dating: { step: "built", label: "Yapım tarihi" },
  architect: { step: "built", label: "Mimar adayları" },
  alternateNames: { step: "name", label: "Başka adları" },
  facts: { step: "facts", label: "Sayılar" },
  media: { step: "media", label: "Fotoğraflar" },
  sections: { step: "sections", label: "Hikâye" },
  highlights: { step: "highlights", label: "Bakılacak yerler" },
  visit: { step: "visit", label: "Ziyaret" },
  accessibility: { step: "access", label: "Erişim" },
  ambientSound: { step: "audio", label: "Ortam sesi" },
  tips: { step: "tips", label: "İpuçları" },
  timeline: { step: "timeline", label: "Önemli tarihler" },
  people: { step: "people", label: "Kişiler" },
  inscriptions: { step: "inscriptions", label: "Kitabeler" },
  waqf: { step: "waqf", label: "Vakıf" },
  legends: { step: "legends", label: "Rivayetler" },
  customBlocks: { step: "custom", label: "Yeni bölümler" },
};

const MESSAGE: Record<string, string> = {
  "name is required": "boş olamaz",
  "summary is required": "boş olamaz",
  "district is required": "boş olamaz",
  "a section needs a title and a text": "başlığı ve metni yazılmalı",
  "a block needs a title and a text": "başlığı ve Türkçe metni yazılmalı",
  "ids must be unique": "aynı kimlik iki kez kullanılmış",
  "an event needs a title": "ne olduğu yazılmalı",
  "a fact needs a label and a value": "ne olduğu ve kaç olduğu yazılmalı",
  "a legend needs a title and a text": "başlığı ve anlatılanı yazılmalı",
  "a person needs a name": "adı yazılmalı",
  "an inscription needs a place": "nerede olduğu yazılmalı",
  "a tip needs a text": "ipucu yazılmalı",
  "a highlight needs a title": "ne olduğu yazılmalı",
  "a name is required": "ad yazılmalı",
  "only one cover": "yalnızca bir kapak seçilebilir",
  "the end year comes after the start": "bitiş yılı başlangıçtan önce olamaz",
};

function problemsOf(record: AdminAssetRecord): Problem[] {
  const result = AdminAssetRecordInputSchema.safeParse(record);
  if (result.success) return [];
  const seen = new Set<string>();
  return result.error.issues.flatMap((issue) => {
    const [key, index] = issue.path;
    const field = FIELD[String(key)] ?? { step: "name", label: String(key) };
    const what = typeof index === "number" ? `${field.label}, ${index + 1}. sıradaki` : field.label;
    const text = `${what}: ${MESSAGE[issue.message] ?? (key === "type" || key === "city" ? "seçilmeli" : "eksik ya da hatalı")}`;
    if (seen.has(text)) return [];
    seen.add(text);
    return [{ step: field.step, text }];
  });
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

/* ───────────── Preview ───────────── */

/** The phone with its switch between the asset's pages and its dossier, and the sample texts' switch. */
function PhoneView({ view, onView, samples, onSamples, children }: { view: Section; onView: (view: Section) => void; samples: boolean; onSamples: (on: boolean) => void; children: ReactNode }) {
  const a = useAdminColors();
  return (
    <View style={styles.previewContent}>
      <View style={styles.previewHead}>
        <Segments
          label="Telefonda göster"
          value={view}
          onChange={onView}
          options={[
            { value: "pages", label: "Kaydırmalı sayfalar" },
            { value: "dossier", label: "Eserin dosyası" },
          ]}
        />
      </View>
      {children}
      <View style={styles.previewFoot}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Ionicons name="hand-left-outline" size={13} color={a.textSecondary} aria-hidden />
          <Text color="textSecondary" style={{ fontSize: 12.5 }}>
            Bir yere tıklarsan onun sorusu açılır
          </Text>
        </View>
        <SamplesSwitch samples={samples} onSamples={onSamples} />
      </View>
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


/**
 * The app's own asset page laid out on a phone's real screen size, with its safe areas, then the
 * whole phone scaled to fit the window: proportions and text stay as in the app. Its parts are
 * picked to be edited; closing does nothing here.
 */
function Phone({ asset, faded = false, edit, view, onView }: { asset: AssetDetail; faded?: boolean; edit: FrameEditing; view: Section; onView: (view: Section) => void }) {
  const { height } = useWindowDimensions();
  const screen = useFadedSamples(faded);
  const scale = Math.min(1, Math.max(0.5, (height - 215) / FRAME.height));
  const dossier = view === "dossier";
  // The dossier opens inside the phone; links that would leave the page (camera, assistant) do nothing here.
  const frame: Frame = {
    open: (href) => {
      const path = typeof href === "string" ? href.split("?")[0] : href.pathname;
      if (path === "/dossier") onView("dossier");
    },
    back: () => onView("pages"),
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
        <View ref={screen} nativeID={FRAME_ROOT_ID} style={styles.phoneScreen}>
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

const styles = StyleSheet.create({
  progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  progressText: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  allSteps: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  allStepsText: { fontFamily: fontFamily.sansSemiBold, fontSize: 13 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  stepList: { flexDirection: "row", flexWrap: "wrap", gap: 16, borderRadius: 20, padding: 12 },
  stepSection: { fontFamily: fontFamily.sansSemiBold, fontSize: 10.5, letterSpacing: 0.8, paddingHorizontal: 8, paddingBottom: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 7 },
  required: { fontFamily: fontFamily.sansSemiBold, fontSize: 11.5 },
  // Above the buttons under it, so a list opened near its bottom covers them.
  question: { borderRadius: 24, borderWidth: 1, zIndex: 2 },
  english: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  englishLink: { fontFamily: fontFamily.sansSemiBold, fontSize: 13.5, textDecorationLine: "underline" },
  band: { borderTopLeftRadius: 23, borderTopRightRadius: 23, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 6, paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1 },
  questionBody: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 22, gap: 18 },
  questionText: { fontFamily: fontFamily.sansSemiBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  help: { flex: 1, fontSize: 14, lineHeight: 20 },
  more: { gap: 12, borderTopWidth: 1, paddingTop: 16, marginTop: 4 },
  moreTitle: { fontFamily: fontFamily.sansBold, fontSize: 11.5, letterSpacing: 0.6, textTransform: "uppercase" },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 },
  fill: { flex: 1, minHeight: 0 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, marginBottom: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -10, marginBottom: 18 },
  previewColumn: { width: 480, flexGrow: 0, borderLeftWidth: 1 },
  previewContent: { alignItems: "center", paddingTop: 24, paddingBottom: 20, gap: 14 },
  samples: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  previewFoot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12 },
  problems: { gap: 4, padding: 14, borderRadius: 16, marginBottom: 16 },
  previewHead: { alignItems: "center", gap: 8 },
  showsTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 12.5 },
  shows: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  where: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  whereSection: { fontFamily: fontFamily.sansBold, fontSize: 12.5 },
  wherePlace: { fontFamily: fontFamily.sansMedium, fontSize: 12.5 },
  phone: { borderRadius: 64, padding: BEZEL, backgroundColor: palette.gece1000, borderWidth: 2, borderColor: "#3A3F47", boxShadow: "0 30px 60px rgba(6,8,13,0.28)" },
  phoneScreen: { width: SCREEN.width, height: SCREEN.height, borderRadius: 52, overflow: "hidden", backgroundColor: palette.gece950 },
  button: { position: "absolute", width: 4, borderRadius: 2, backgroundColor: "#3A3F47" },
  island: { position: "absolute", top: 11, alignSelf: "center", width: 124, height: 36, borderRadius: 18, backgroundColor: "#000" },
  homeBar: { position: "absolute", bottom: 8, alignSelf: "center", width: 136, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)" },
});

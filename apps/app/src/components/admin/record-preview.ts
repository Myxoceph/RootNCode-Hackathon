import type { AdminAssetRecord, AssetDetail, Confidence, MetaEnumsResponse } from "@vagabonds/contracts";

import { yearOfDating } from "@/lib/dating";
import { withCustomBlocks, type CustomBlock } from "@/lib/dossier-custom";
import { withDossierAfter, type DossierPlacements } from "@/lib/dossier-photos";

/**
 * The editor's record as the app's asset page reads it, so the phone preview follows every keystroke.
 * It mirrors the API's mapper for what the record holds; what only the server knows (photo URLs,
 * sources, the complex's buildings, the ambient recording) comes from the asset as last saved.
 *
 * With `samples`, empty fields read as faded sample text, so a new asset shows where everything goes.
 */

/** Sample texts for empty fields; the preview fades whatever text equals one of them. */
export const SAMPLES = {
  name: "Eser adı",
  subtitle: "Kısa bir alt başlık",
  summary: "Eserin kısa tanıtımı burada görünür: ne olduğu, ne zaman ve kimin için yapıldığı, bir iki cümleyle.",
  district: "İlçe",
  type: "Tür",
  city: "İl",
  year: "Yıl",
  founder: "Bânînin adı",
  sectionTitle: "Bölüm başlığı",
  sectionBody: "Bölümün metni burada görünür. Eserin tarihini, mimarisini ya da hikâyesini anlatan bir iki paragraf yaz; ilk cümlesi kısa sayfada da görünür.",
  highlightTitle: "Öne çıkan bir ayrıntı",
  highlightHint: "Ziyaretçinin bakması gereken yer",
};

export const SAMPLE_TEXTS = new Set(Object.values(SAMPLES));

const blank = (text: string | null | undefined) => !text || text.trim() === "";
const pick = (text: { tr: string; en: string | null } | null | undefined) => (text && !blank(text.tr) ? text.tr.trim() : null);

export function previewOf(record: AdminAssetRecord, { id, meta, base, samples, placements = {}, customBlocks = [] }: { id: string; meta: MetaEnumsResponse | null; base: AssetDetail | null; samples: boolean; placements?: DossierPlacements; customBlocks?: CustomBlock[] }): AssetDetail {
  const confidence = (code: string | null): Confidence | null => {
    if (!code) return null;
    return meta?.confidence.find((c) => c.code === code) ?? { code: code as Confidence["code"], label: code };
  };
  const required = (code: string) => confidence(code)!;
  const labelOf = (list: Array<{ code: string; label: string }> | undefined, code: string, fallback = "") => ({
    code,
    label: list?.find((item) => item.code === code)?.label ?? (code || (samples ? fallback : "")),
  });
  const sample = (text: string | null, fallback: string) => text ?? (samples ? fallback : "");
  const sourcesOf = <T extends { sources: AssetDetail["sources"] }>(list: T[] | undefined, find: (item: T) => boolean) => list?.find(find)?.sources ?? [];

  // Photos in the record's order, with its captions and cover.
  const byKey = new Map((base?.media ?? []).map((m) => [m.key, m]));
  const media = record.media.flatMap((m) => {
    const photo = byKey.get(m.key);
    return photo ? [withDossierAfter({ ...photo, caption: pick(m.caption), alt: pick(m.alt) ?? photo.alt, isCover: m.isCover }, placements[m.key] ?? null)] : [];
  });
  const cover = media.find((m) => m.isCover) ?? null;

  const display = pick(record.dating.display);
  const hasDating = display !== null || [record.dating.startYear, record.dating.endYear, record.dating.hijriYear, record.dating.century].some((v) => v !== null);
  const yearLabel = yearOfDating(display) ?? (record.dating.startYear !== null ? String(record.dating.startYear) : record.dating.century ? `${toRoman(record.dating.century)}. yüzyıl` : null);

  let sections = record.sections
    .filter((s) => !blank(s.body.tr) || !blank(s.title.tr) || samples)
    .map((s) => ({
      id: s.id,
      title: sample(pick(s.title), SAMPLES.sectionTitle),
      body: sample(pick(s.body), SAMPLES.sectionBody),
      confidence: required(s.confidence),
      sources: sourcesOf(base?.sections, (b) => b.id === s.id),
    }));
  if (sections.length === 0 && samples) sections = [{ id: "ornek", title: SAMPLES.sectionTitle, body: SAMPLES.sectionBody, confidence: required("certain"), sources: [] }];
  sections = sections.filter((s) => s.body);

  const highlights = record.highlights
    .filter((h) => !blank(h.title.tr) || samples)
    .map((h) => ({ feature: h.feature || "diger", title: sample(pick(h.title), SAMPLES.highlightTitle), hint: sample(pick(h.hint), SAMPLES.highlightHint) || null, sectionId: h.sectionId }));

  const counted = sections.length + highlights.length + record.legends.length + record.people.length + record.timeline.length + record.inscriptions.length;
  const architectName = record.architect.name?.trim() || null;
  const candidates = record.architect.candidates.filter((c) => !blank(c.name)).map((c) => ({ name: c.name.trim(), note: c.note }));
  const waqf = {
    name: record.waqf.name,
    deedExcerpt: pick(record.waqf.deedExcerpt),
    deedDate: record.waqf.deedDate,
    conditions: pick(record.waqf.conditions),
    landNote: pick(record.waqf.landNote),
    confidence: confidence(record.waqf.confidence),
    sources: base?.waqf?.sources ?? [],
  };

  const asset: AssetDetail = {
    id,
    name: sample(pick(record.name), SAMPLES.name) || id,
    subtitle: pick(record.subtitle) ?? (samples ? SAMPLES.subtitle : null),
    type: labelOf(meta?.assetTypes, record.type, SAMPLES.type),
    era: record.era ? labelOf(meta?.eras, record.era) : null,
    city: labelOf(meta?.cities, record.city, SAMPLES.city),
    district: sample(record.district.trim() || null, SAMPLES.district),
    coordinates: record.coordinates ? { ...record.coordinates, verified: false, source: "manual", approximate: false } : null,
    summary: sample(pick(record.summary), SAMPLES.summary),
    datingDisplay: display,
    yearLabel: yearLabel ?? (samples ? SAMPLES.year : null),
    cover,
    parentId: record.parentId,
    prominence: counted,
    alternateNames: record.alternateNames.filter((n) => !blank(n.name.tr)).map((n) => ({ name: n.name.tr.trim(), note: n.note })),
    secondaryTypes: record.secondaryTypes.map((code) => labelOf(meta?.assetTypes, code)),
    tags: record.tags,
    neighborhood: record.neighborhood,
    address: record.address,
    parent: record.parentId === base?.parent?.id ? (base?.parent ?? null) : null,
    children: base?.children ?? [],
    dating: hasDating
      ? {
          display,
          startYear: record.dating.startYear,
          endYear: record.dating.endYear,
          hijriYear: record.dating.hijriYear,
          century: record.dating.century,
          basis: pick(record.dating.basis),
          confidence: confidence(record.dating.confidence),
          sources: base?.dating?.sources ?? [],
        }
      : null,
    founder: record.founder.name?.trim()
      ? { name: record.founder.name.trim(), role: record.founder.role, confidence: confidence(record.founder.confidence), sources: base?.founder?.sources ?? [] }
      : samples
        ? { name: SAMPLES.founder, role: null, confidence: null, sources: [] }
        : null,
    architect: architectName || candidates.length > 0 ? { name: architectName, candidates, confidence: confidence(record.architect.confidence), sources: base?.architect?.sources ?? [] } : null,
    waqf: [waqf.name, waqf.deedExcerpt, waqf.conditions, waqf.landNote].some((v) => v) ? waqf : null,
    sections,
    facts: record.facts
      .filter((f) => !blank(f.label.tr) && !blank(f.value))
      .map((f) => {
        const number = Number(f.value.replace(",", "."));
        return {
          key: f.key,
          label: f.label.tr.trim(),
          value: f.value.trim(),
          valueNum: Number.isFinite(number) ? number : null,
          unit: f.unit,
          note: pick(f.note),
          confidence: required(f.confidence),
          sources: sourcesOf(base?.facts, (b) => b.key === f.key),
        };
      }),
    timeline: record.timeline
      .filter((e) => !blank(e.title.tr))
      .map((e) => ({
        id: e.id,
        year: e.year,
        date: e.date,
        hijri: e.hijri,
        type: labelOf(meta?.timelineEventTypes, e.type),
        title: e.title.tr.trim(),
        note: pick(e.note),
        confidence: required(e.confidence),
        sources: sourcesOf(base?.timeline, (b) => b.id === e.id),
      })),
    legends: record.legends
      .filter((l) => !blank(l.title.tr) && !blank(l.body.tr))
      .map((l) => ({ id: l.id, title: l.title.tr.trim(), body: l.body.tr.trim(), verdict: l.verdict, sources: sourcesOf(base?.legends, (b) => b.id === l.id) })),
    inscriptions: record.inscriptions
      .filter((n) => !blank(n.location.tr))
      .map((n) => {
        const was = base?.inscriptions.find((b) => b.id === n.id);
        return {
          id: n.id,
          location: n.location.tr.trim(),
          language: n.language,
          script: n.script,
          transliteration: n.transliteration,
          translation: pick(n.translation),
          author: n.author,
          hijriYear: n.hijriYear,
          gregorian: n.gregorian,
          note: pick(n.note),
          arTargetMediaKey: was?.arTargetMediaKey ?? null,
          arTarget: was?.arTarget ?? null,
          sources: was?.sources ?? [],
        };
      }),
    people: record.people.filter((p) => !blank(p.name)).map((p) => ({ name: p.name.trim(), role: pick(p.role) })),
    highlights,
    media,
    visitorTips: record.tips.filter((t) => !blank(t.text.tr)).map((t) => ({ text: t.text.tr.trim(), origin: t.origin, collectedAt: t.collectedAt })),
    accessibility: {
      wheelchair: record.accessibility.wheelchair,
      stepFree: record.accessibility.stepFree,
      ramp: record.accessibility.ramp,
      toilet: record.accessibility.toilet,
      verified: record.accessibility.verified,
      notes: pick(record.accessibility.notes),
      audioDescription: pick(record.accessibility.audioDescription),
    },
    ambientSound: base?.ambientSound ? { ...base.ambientSound, caption: pick(record.ambientSound.caption) ?? base.ambientSound.caption } : null,
    visit: { setting: record.visit.setting, durationMin: record.visit.durationMin, entranceFee: record.visit.entranceFee, notes: pick(record.visit.notes) },
    sources: base?.sources ?? [],
    updatedAt: base?.updatedAt ?? new Date().toISOString(),
  };
  return withCustomBlocks(asset, customBlocks);
}

function toRoman(n: number): string {
  const numerals: Array<[number, string]> = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, letter] of numerals) while (n >= value) (out += letter), (n -= value);
  return out;
}

import type { AdminAssetRecord } from "@vagabonds/contracts";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.ts";
import { PANEL_PREFIX } from "./panel-asset.ts";

/**
 * The panel's whole-asset record, read from and written to the asset's tables.
 *
 * A write replaces the asset's columns and its lists (sections, timeline, facts, legends, people,
 * highlights, inscriptions, visitor tips) together, in one transaction. Photos stay: only their
 * captions, order and cover change. Sources cited for an item stay with it as long as its id does.
 * For a dataset asset this lives in the database only, until the next `import_to_db.py`; a panel
 * asset's `source_json` is rewritten as a `data/eserler` file, so it can be exported later.
 */

export const recordSelect = {
  id: true,
  status: true,
  prepared_by: true,
  created_at: true,
  type_code: true,
  secondary_types: true,
  parent_id: true,
  era_code: true,
  tags: true,
  name_tr: true,
  name_en: true,
  subtitle_tr: true,
  subtitle_en: true,
  alternate_names: true,
  summary_tr: true,
  summary_en: true,
  city_code: true,
  district: true,
  neighborhood: true,
  address: true,
  lat: true,
  lng: true,
  dating_display_tr: true,
  dating_display_en: true,
  start_year: true,
  end_year: true,
  hijri_year: true,
  century: true,
  dating_basis_tr: true,
  dating_basis_en: true,
  dating_confidence: true,
  founder_name: true,
  founder_role: true,
  founder_confidence: true,
  architect_name: true,
  architect_candidates: true,
  architect_confidence: true,
  waqf_name: true,
  waqf_deed: true,
  waqf_conditions_tr: true,
  waqf_conditions_en: true,
  waqf_land_note_tr: true,
  waqf_land_note_en: true,
  waqf_confidence: true,
  visit_setting: true,
  visit_duration_min: true,
  entrance_fee: true,
  visit_notes_tr: true,
  visit_notes_en: true,
  a11y_wheelchair: true,
  a11y_step_free: true,
  a11y_ramp: true,
  a11y_toilet: true,
  a11y_verified: true,
  a11y_notes_tr: true,
  a11y_notes_en: true,
  audio_description_tr: true,
  audio_description_en: true,
  ambient_sound_key: true,
  ambient_caption_tr: true,
  ambient_caption_en: true,
  asset_section: { orderBy: { sort_order: "asc" } },
  asset_custom_block: { orderBy: { sort_order: "asc" } },
  asset_highlight: { orderBy: { sort_order: "asc" } },
  timeline_event: { orderBy: [{ year: "asc" }, { slug: "asc" }] },
  asset_fact: { orderBy: { sort_order: "asc" } },
  asset_legend: { orderBy: { sort_order: "asc" } },
  asset_person: { orderBy: { sort_order: "asc" } },
  inscription: { orderBy: { sort_order: "asc" } },
  visitor_tip: { orderBy: { id: "asc" } },
} satisfies Prisma.assetSelect;

/** The asset's rows, and its photos (read on their own: the one-cover index makes Prisma see one). */
export type AssetRecordRow = Prisma.assetGetPayload<{ select: typeof recordSelect }> & {
  media: Array<{ media_key: string; caption_tr: string; caption_en: string | null; alt_tr: string; alt_en: string | null; is_cover: boolean; dossier_after: string | null }>;
};

const AlternateNames = z.array(z.object({ tr: z.string(), en: z.string().nullish(), note: z.string().nullish(), note_en: z.string().nullish() }));
const Candidates = z.array(z.object({ name: z.string(), note: z.string().nullish(), note_en: z.string().nullish() }));
const Deed = z.object({ excerpt: z.object({ tr: z.string().nullish(), en: z.string().nullish() }).nullish(), date_display: z.string().nullish() }).nullish();

const nonEmpty = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);
const text = (tr: string | null | undefined, en: string | null | undefined) => ({ tr: tr ?? "", en: nonEmpty(en) });
const optionalText = (tr: string | null | undefined, en: string | null | undefined) => (nonEmpty(tr) || nonEmpty(en) ? text(tr, en) : null);
/** A note in a JSON column: `note` and `note_en`, each only when there is one. */
const noteFields = (note: { tr: string; en: string | null } | null) => ({
  ...(nonEmpty(note?.tr) && { note: nonEmpty(note?.tr) }),
  ...(nonEmpty(note?.en) && { note_en: nonEmpty(note?.en) }),
});
const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
type Confidence = AdminAssetRecord["sections"][number]["confidence"];
const confidence = (value: string | null): Confidence | null => (value ? (value as Confidence) : null);

export function toAssetRecord(row: AssetRecordRow): AdminAssetRecord {
  const deed = Deed.parse(row.waqf_deed);
  return {
    status: row.status as AdminAssetRecord["status"],
    name: text(row.name_tr, row.name_en),
    subtitle: optionalText(row.subtitle_tr, row.subtitle_en),
    type: row.type_code,
    secondaryTypes: row.secondary_types,
    era: row.era_code,
    parentId: row.parent_id,
    tags: row.tags,
    alternateNames: AlternateNames.parse(row.alternate_names).map((n) => ({ name: text(n.tr, n.en), note: optionalText(n.note, n.note_en) })),
    city: row.city_code,
    district: row.district,
    neighborhood: nonEmpty(row.neighborhood),
    address: nonEmpty(row.address),
    coordinates: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    summary: text(row.summary_tr, row.summary_en),
    dating: {
      display: optionalText(row.dating_display_tr, row.dating_display_en),
      startYear: row.start_year,
      endYear: row.end_year,
      hijriYear: row.hijri_year,
      century: row.century,
      basis: optionalText(row.dating_basis_tr, row.dating_basis_en),
      confidence: confidence(row.dating_confidence),
    },
    founder: { name: nonEmpty(row.founder_name), role: nonEmpty(row.founder_role), confidence: confidence(row.founder_confidence) },
    architect: {
      name: nonEmpty(row.architect_name),
      candidates: Candidates.parse(row.architect_candidates).map((c) => ({ name: c.name, note: optionalText(c.note, c.note_en) })),
      confidence: confidence(row.architect_confidence),
    },
    waqf: {
      name: nonEmpty(row.waqf_name),
      deedDate: nonEmpty(deed?.date_display),
      deedExcerpt: optionalText(deed?.excerpt?.tr, deed?.excerpt?.en),
      conditions: optionalText(row.waqf_conditions_tr, row.waqf_conditions_en),
      landNote: optionalText(row.waqf_land_note_tr, row.waqf_land_note_en),
      confidence: confidence(row.waqf_confidence),
    },
    customBlocks: row.asset_custom_block.map((b) => ({ id: b.slug, title: text(b.title_tr, b.title_en), body: text(b.body_tr, b.body_en), after: b.after_block })),
    sections: row.asset_section.map((s) => ({ id: s.slug, title: text(s.title_tr, s.title_en), body: text(s.body_tr, s.body_en), confidence: s.confidence as Confidence })),
    highlights: row.asset_highlight.map((h) => ({ feature: h.feature, title: text(h.title_tr, h.title_en), hint: text(h.hint_tr, h.hint_en), sectionId: h.section_slug })),
    timeline: row.timeline_event.map((e) => ({
      id: e.slug,
      year: e.year,
      date: isoDate(e.date),
      hijri: nonEmpty(e.hijri),
      type: e.type_code,
      title: text(e.title_tr, e.title_en),
      note: optionalText(e.note_tr, e.note_en),
      confidence: e.confidence as Confidence,
    })),
    facts: row.asset_fact.map((f) => ({
      key: f.key,
      label: text(f.label_tr, f.label_en),
      value: f.value,
      unit: nonEmpty(f.unit),
      note: optionalText(f.note_tr, f.note_en),
      confidence: f.confidence as Confidence,
    })),
    legends: row.asset_legend.map((l) => ({
      id: l.slug,
      title: text(l.title_tr, l.title_en),
      body: text(l.body_tr, l.body_en),
      verdict: l.source_verdict as AdminAssetRecord["legends"][number]["verdict"],
    })),
    people: row.asset_person.map((p) => ({ name: p.name, role: text(p.role_tr, p.role_en) })),
    inscriptions: row.inscription.map((n) => ({
      id: n.slug,
      location: text(n.location_tr, n.location_en),
      language: n.language as AdminAssetRecord["inscriptions"][number]["language"],
      script: nonEmpty(n.script),
      transliteration: nonEmpty(n.transliteration),
      translation: optionalText(n.translation_tr, n.translation_en),
      author: nonEmpty(n.author),
      hijriYear: n.hijri_year,
      gregorian: nonEmpty(n.gregorian),
      note: optionalText(n.note_tr, n.note_en),
    })),
    visit: {
      setting: (nonEmpty(row.visit_setting) as AdminAssetRecord["visit"]["setting"]) ?? null,
      durationMin: row.visit_duration_min,
      entranceFee: (nonEmpty(row.entrance_fee) as AdminAssetRecord["visit"]["entranceFee"]) ?? null,
      notes: optionalText(row.visit_notes_tr, row.visit_notes_en),
    },
    tips: row.visitor_tip.map((t) => ({ text: text(t.text_tr, t.text_en), origin: t.origin as AdminAssetRecord["tips"][number]["origin"], collectedAt: isoDate(t.collected_at) })),
    accessibility: {
      wheelchair: row.a11y_wheelchair as AdminAssetRecord["accessibility"]["wheelchair"],
      stepFree: row.a11y_step_free as AdminAssetRecord["accessibility"]["wheelchair"],
      ramp: row.a11y_ramp as AdminAssetRecord["accessibility"]["wheelchair"],
      toilet: row.a11y_toilet as AdminAssetRecord["accessibility"]["wheelchair"],
      verified: row.a11y_verified,
      notes: optionalText(row.a11y_notes_tr, row.a11y_notes_en),
      audioDescription: optionalText(row.audio_description_tr, row.audio_description_en),
    },
    ambientSound: { key: nonEmpty(row.ambient_sound_key), caption: optionalText(row.ambient_caption_tr, row.ambient_caption_en) },
    media: row.media.map((m) => ({ key: m.media_key, caption: text(m.caption_tr, m.caption_en), alt: text(m.alt_tr, m.alt_en), isCover: m.is_cover, dossierAfter: m.dossier_after })),
  };
}

const orNull = (text: string | null | undefined) => nonEmpty(text);

/** The asset's own columns from a record; `id`, `prepared_by` and `source_json` are the caller's. */
export function assetColumns(r: AdminAssetRecord) {
  return {
    status: r.status,
    type_code: r.type,
    secondary_types: r.secondaryTypes,
    parent_id: r.parentId,
    era_code: r.era,
    tags: r.tags,
    name_tr: r.name.tr,
    name_en: orNull(r.name.en),
    subtitle_tr: orNull(r.subtitle?.tr),
    subtitle_en: orNull(r.subtitle?.en),
    alternate_names: r.alternateNames.map((n) => ({ tr: n.name.tr, en: n.name.en, ...noteFields(n.note) })),
    summary_tr: r.summary.tr,
    summary_en: orNull(r.summary.en),
    city_code: r.city,
    district: r.district,
    neighborhood: orNull(r.neighborhood),
    address: orNull(r.address),
    lat: r.coordinates?.lat ?? null,
    lng: r.coordinates?.lng ?? null,
    dating_display_tr: orNull(r.dating.display?.tr),
    dating_display_en: orNull(r.dating.display?.en),
    start_year: r.dating.startYear,
    end_year: r.dating.endYear,
    hijri_year: r.dating.hijriYear,
    century: r.dating.century,
    dating_basis_tr: orNull(r.dating.basis?.tr),
    dating_basis_en: orNull(r.dating.basis?.en),
    dating_confidence: r.dating.confidence,
    founder_name: orNull(r.founder.name),
    founder_role: orNull(r.founder.role),
    founder_confidence: r.founder.confidence,
    architect_name: orNull(r.architect.name),
    architect_candidates: r.architect.candidates.filter((c) => c.name.trim()).map((c) => ({ name: c.name, ...noteFields(c.note) })),
    architect_confidence: r.architect.confidence,
    waqf_name: orNull(r.waqf.name),
    waqf_deed:
      r.waqf.deedDate || r.waqf.deedExcerpt
        ? { date_display: r.waqf.deedDate, excerpt: r.waqf.deedExcerpt ? { tr: orNull(r.waqf.deedExcerpt.tr), en: orNull(r.waqf.deedExcerpt.en) } : null }
        : undefined,
    waqf_conditions_tr: orNull(r.waqf.conditions?.tr),
    waqf_conditions_en: orNull(r.waqf.conditions?.en),
    waqf_land_note_tr: orNull(r.waqf.landNote?.tr),
    waqf_land_note_en: orNull(r.waqf.landNote?.en),
    waqf_confidence: r.waqf.confidence,
    visit_setting: r.visit.setting,
    visit_duration_min: r.visit.durationMin,
    entrance_fee: r.visit.entranceFee,
    visit_notes_tr: orNull(r.visit.notes?.tr),
    visit_notes_en: orNull(r.visit.notes?.en),
    a11y_wheelchair: r.accessibility.wheelchair,
    a11y_step_free: r.accessibility.stepFree,
    a11y_ramp: r.accessibility.ramp,
    a11y_toilet: r.accessibility.toilet,
    a11y_verified: r.accessibility.verified,
    a11y_notes_tr: orNull(r.accessibility.notes?.tr),
    a11y_notes_en: orNull(r.accessibility.notes?.en),
    audio_description_tr: orNull(r.accessibility.audioDescription?.tr),
    audio_description_en: orNull(r.accessibility.audioDescription?.en),
    ambient_sound_key: orNull(r.ambientSound.key),
    ambient_caption_tr: orNull(r.ambientSound.caption?.tr),
    ambient_caption_en: orNull(r.ambientSound.caption?.en),
  } satisfies Omit<Prisma.assetUncheckedCreateInput, "id" | "source_json">;
}

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/**
 * Replaces the asset's lists with the record's, in a transaction already open. Inscriptions keep
 * their AR target photo by id; citations of items that are gone are dropped, the rest stay.
 */
export async function writeLists(tx: Prisma.TransactionClient, id: string, r: AdminAssetRecord): Promise<void> {
  const arTargets = new Map(
    (await tx.inscription.findMany({ where: { asset_id: id }, select: { slug: true, ar_target_media_key: true } })).map((n) => [n.slug, n.ar_target_media_key]),
  );
  // Highlights point at sections, so they go first and come back last.
  await tx.asset_highlight.deleteMany({ where: { asset_id: id } });
  await tx.inscription.deleteMany({ where: { asset_id: id } });
  await Promise.all([
    tx.asset_section.deleteMany({ where: { asset_id: id } }),
    tx.asset_custom_block.deleteMany({ where: { asset_id: id } }),
    tx.timeline_event.deleteMany({ where: { asset_id: id } }),
    tx.asset_fact.deleteMany({ where: { asset_id: id } }),
    tx.asset_legend.deleteMany({ where: { asset_id: id } }),
    tx.asset_person.deleteMany({ where: { asset_id: id } }),
    tx.visitor_tip.deleteMany({ where: { asset_id: id } }),
  ]);

  await tx.asset_section.createMany({
    data: r.sections.map((s, i) => ({ asset_id: id, slug: s.id, sort_order: i + 1, title_tr: s.title.tr, title_en: orNull(s.title.en), body_tr: s.body.tr, body_en: orNull(s.body.en), confidence: s.confidence })),
  });
  await tx.asset_custom_block.createMany({
    data: r.customBlocks.map((b, i) => ({ asset_id: id, slug: b.id, sort_order: i, after_block: b.after, title_tr: b.title.tr, title_en: orNull(b.title.en), body_tr: b.body.tr, body_en: orNull(b.body.en) })),
  });
  const sectionIds = new Set(r.sections.map((s) => s.id));
  await tx.asset_highlight.createMany({
    data: r.highlights.map((h, i) => ({
      asset_id: id,
      sort_order: i,
      feature: h.feature || "diger",
      title_tr: h.title.tr,
      title_en: orNull(h.title.en),
      hint_tr: h.hint.tr,
      hint_en: orNull(h.hint.en),
      section_slug: h.sectionId && sectionIds.has(h.sectionId) ? h.sectionId : null,
    })),
  });
  await tx.timeline_event.createMany({
    data: r.timeline.map((e) => ({
      asset_id: id,
      slug: e.id,
      year: e.year,
      date: day(e.date),
      hijri: orNull(e.hijri),
      type_code: e.type,
      title_tr: e.title.tr,
      title_en: orNull(e.title.en),
      note_tr: orNull(e.note?.tr),
      note_en: orNull(e.note?.en),
      confidence: e.confidence,
    })),
  });
  await tx.asset_fact.createMany({
    data: r.facts.map((f, i) => {
      const number = Number(f.value.replace(",", "."));
      return {
        asset_id: id,
        key: f.key,
        sort_order: i,
        label_tr: f.label.tr,
        label_en: orNull(f.label.en),
        value: f.value,
        value_num: f.value.trim() !== "" && Number.isFinite(number) ? number : null,
        unit: orNull(f.unit),
        note_tr: orNull(f.note?.tr),
        note_en: orNull(f.note?.en),
        confidence: f.confidence,
      };
    }),
  });
  await tx.asset_legend.createMany({
    data: r.legends.map((l, i) => ({ asset_id: id, slug: l.id, sort_order: i, title_tr: l.title.tr, title_en: orNull(l.title.en), body_tr: l.body.tr, body_en: orNull(l.body.en), source_verdict: l.verdict })),
  });
  await tx.asset_person.createMany({ data: r.people.map((p, i) => ({ asset_id: id, sort_order: i, name: p.name, role_tr: p.role.tr, role_en: orNull(p.role.en) })) });
  await tx.inscription.createMany({
    data: r.inscriptions.map((n, i) => ({
      asset_id: id,
      slug: n.id,
      sort_order: i,
      location_tr: n.location.tr,
      location_en: orNull(n.location.en),
      language: n.language,
      script: orNull(n.script),
      transliteration: orNull(n.transliteration),
      translation_tr: orNull(n.translation?.tr),
      translation_en: orNull(n.translation?.en),
      author: orNull(n.author),
      hijri_year: n.hijriYear,
      gregorian: orNull(n.gregorian),
      note_tr: orNull(n.note?.tr),
      note_en: orNull(n.note?.en),
      ar_target_media_key: arTargets.get(n.id) ?? null,
    })),
  });
  await tx.visitor_tip.createMany({ data: r.tips.map((t) => ({ asset_id: id, text_tr: t.text.tr, text_en: orNull(t.text.en), origin: t.origin, collected_at: day(t.collectedAt) })) });

  // Photos: captions, order, the cover and their place in the dossier; the one-cover index needs the old cover cleared first.
  await tx.asset_media.updateMany({ where: { asset_id: id }, data: { is_cover: false } });
  for (const [i, m] of r.media.entries()) {
    await tx.asset_media.updateMany({
      where: { asset_id: id, media_key: m.key },
      data: { sort_order: i, is_cover: m.isCover, caption_tr: m.caption.tr, caption_en: orNull(m.caption.en), alt_tr: m.alt.tr, alt_en: orNull(m.alt.en), dossier_after: m.dossierAfter },
    });
  }

  const kept: Record<string, string[]> = {
    section: r.sections.map((s) => s.id),
    timeline: r.timeline.map((e) => e.id),
    fact: r.facts.map((f) => f.key),
    legend: r.legends.map((l) => l.id),
    inscription: r.inscriptions.map((n) => n.id),
  };
  for (const [entity, keys] of Object.entries(kept)) {
    await tx.source_citation.deleteMany({ where: { asset_id: id, entity, entity_key: { notIn: keys } } });
  }
}

/** The record as a `data/eserler/<city>/<district>/<id>.json` file, for a panel asset's `source_json`. */
export function datasetJson(
  id: string,
  r: AdminAssetRecord,
  { region, username, createdAt, today, todos }: { region: string; username: string; createdAt: string; today: string; todos: string[] },
): Prisma.InputJsonObject {
  const i18n = (t: { tr: string; en: string | null } | null | undefined) => (t && (orNull(t.tr) || orNull(t.en)) ? { tr: t.tr, en: orNull(t.en) } : null);
  const refs = { source_refs: [] };
  return {
    schema_version: "1.0",
    id,
    meta: {
      status: r.status,
      created_at: createdAt,
      updated_at: today,
      prepared_by: `${PANEL_PREFIX}${username}`,
      reviewed_by: r.status === "published" ? username : null,
      from: "Yönetim paneli",
      todos,
    },
    name: i18n(r.name),
    subtitle: i18n(r.subtitle),
    type: r.type,
    secondary_types: r.secondaryTypes,
    parent_id: r.parentId,
    era: r.era,
    tags: r.tags,
    alternate_names: r.alternateNames.map((n) => ({ tr: n.name.tr, en: n.name.en, ...noteFields(n.note) })),
    location: {
      region,
      city: r.city,
      district: r.district,
      neighborhood: orNull(r.neighborhood),
      address: orNull(r.address),
      ...(r.coordinates && { coordinates: { ...r.coordinates, source: "manual", verified: false } }),
    },
    summary: i18n(r.summary),
    dating: r.dating.display || r.dating.startYear !== null ? { display: i18n(r.dating.display), start_year: r.dating.startYear, end_year: r.dating.endYear, hijri_year: r.dating.hijriYear, century: r.dating.century, basis: i18n(r.dating.basis), confidence: r.dating.confidence ?? "certain", ...refs } : null,
    founder: r.founder.name ? { name: r.founder.name, role: r.founder.role, confidence: r.founder.confidence ?? "certain", ...refs } : null,
    architect: r.architect.name || r.architect.candidates.length ? { name: r.architect.name, candidates: r.architect.candidates.map((c) => ({ name: c.name, ...noteFields(c.note) })), confidence: r.architect.confidence ?? "probable", ...refs } : null,
    waqf: r.waqf.name || r.waqf.conditions ? { name: r.waqf.name, deed: r.waqf.deedDate || r.waqf.deedExcerpt ? { date_display: r.waqf.deedDate, excerpt: i18n(r.waqf.deedExcerpt) } : null, conditions: i18n(r.waqf.conditions), land_note: i18n(r.waqf.landNote), confidence: r.waqf.confidence ?? "certain", ...refs } : null,
    custom_blocks: r.customBlocks.map((b) => ({ id: b.id, after: b.after, title: i18n(b.title), body: i18n(b.body) })),
    sections: r.sections.map((s, i) => ({ id: s.id, order: i + 1, title: i18n(s.title), body: i18n(s.body), confidence: s.confidence, ...refs })),
    highlights: r.highlights.map((h) => ({ feature: h.feature, title: i18n(h.title), hint: i18n(h.hint), section_id: h.sectionId })),
    timeline: r.timeline.map((e) => ({ id: e.id, year: e.year, date: e.date, hijri: e.hijri, type: e.type, title: i18n(e.title), note: i18n(e.note), confidence: e.confidence, ...refs })),
    facts: r.facts.map((f) => ({ key: f.key, label: i18n(f.label), value: f.value, unit: f.unit, note: i18n(f.note), confidence: f.confidence, ...refs })),
    legends: r.legends.map((l) => ({ id: l.id, title: i18n(l.title), body: i18n(l.body), source_verdict: l.verdict, ...refs })),
    people: r.people.map((p) => ({ name: p.name, role: i18n(p.role) })),
    inscriptions: r.inscriptions.map((n) => ({
      id: n.id,
      location: i18n(n.location),
      language: n.language,
      script: n.script,
      transliteration: n.transliteration,
      translation: i18n(n.translation),
      author: n.author,
      date: { hijri_year: n.hijriYear, gregorian: n.gregorian },
      note: i18n(n.note),
      ...refs,
    })),
    visit: {
      setting: r.visit.setting,
      estimated_duration_min: r.visit.durationMin,
      entrance_fee: r.visit.entranceFee,
      notes: i18n(r.visit.notes),
      visitor_tips: r.tips.map((t) => ({ text: i18n(t.text), origin: t.origin, collected_at: t.collectedAt })),
    },
    accessibility: {
      wheelchair_access: r.accessibility.wheelchair,
      step_free_entrance: r.accessibility.stepFree,
      ramp: r.accessibility.ramp,
      accessible_toilet: r.accessibility.toilet,
      verified: r.accessibility.verified,
      notes: i18n(r.accessibility.notes),
      audio_description: i18n(r.accessibility.audioDescription),
    },
    ambient_sound: r.ambientSound.key ? { sound_key: r.ambientSound.key, caption: i18n(r.ambientSound.caption) } : null,
    media: [],
  };
}

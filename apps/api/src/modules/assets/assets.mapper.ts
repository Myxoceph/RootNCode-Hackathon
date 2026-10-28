import {
  AR_MINDAR_VERSION,
  AccessibilityStatusSchema,
  arTargetMindKey,
  LegendVerdictSchema,
  MediaKindSchema,
  VisitorTipSchemaV2,
  type ArTarget,
  type AssetDetail,
  type AssetRef,
  type AssetRelation,
  type AssetSummary,
  type Confidence,
  type Coordinates,
  type LabeledCode,
  type Lang,
  type Media,
  type NamedNote,
  type SourceRef,
} from "@vagabonds/contracts";
import { z } from "zod";
import { toConfidence } from "../../lib/enums.ts";
import { nonEmpty, pick } from "../../lib/lang.ts";
import type { DirectedRelation } from "./assets.network.ts";
import {
  relationCitationKey,
  type AssetDetailRecord,
  type AssetMediaRecord,
  type AssetSummaryRecord,
  type CitationRecord,
  type LabelRecord,
} from "./assets.repository.ts";

export interface MapperContext {
  lang: Lang;
  mediaBaseUrl: string;
  /** Statuses served under the current visibility, used to hide unpublished parents. */
  statuses: string[];
}

// JSON columns: shapes come from data/schema/eser.schema.json.
const AlternateNamesSchema = z.array(
  z.object({ tr: z.string(), en: z.string().nullish(), note: z.string().nullish() }),
);
const CandidatesSchema = z.array(z.object({ name: z.string(), note: z.string().nullish() }));
const WaqfDeedSchema = z
  .object({
    excerpt: z.object({ tr: z.string().nullish(), en: z.string().nullish() }).nullish(),
    date_display: z.string().nullish(),
  })
  .nullish();

function label(record: LabelRecord, lang: Lang): LabeledCode {
  return { code: record.code, label: pick(record.label_tr, record.label_en, lang) };
}

/** Section, fact and timeline rows always carry a confidence (NOT NULL in the schema). */
export function requiredConfidence(code: string, lang: Lang): Confidence {
  const confidence = toConfidence(code, lang);
  if (!confidence) throw new Error("confidence is required");
  return confidence;
}

function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function toCoordinates(
  record: Pick<AssetSummaryRecord, "lat" | "lng" | "coord_verified" | "coord_source">,
): Coordinates | null {
  if (record.lat === null || record.lng === null) return null;
  return {
    lat: record.lat,
    lng: record.lng,
    verified: record.coord_verified,
    source: nonEmpty(record.coord_source),
  };
}

export function toMedia(record: AssetMediaRecord, { lang, mediaBaseUrl }: MapperContext): Media {
  const { media } = record;
  const sources: Media["sources"] = { webp: [], jpg: [] };
  for (const variant of media.media_variant) {
    if (variant.format !== "webp" && variant.format !== "jpg") continue;
    sources[variant.format].push({ url: `${mediaBaseUrl}/${variant.key}`, width: variant.width, height: variant.height });
  }
  return {
    key: record.media_key,
    kind: MediaKindSchema.parse(media.kind),
    isCover: record.is_cover,
    width: media.width,
    height: media.height,
    aspectRatio: Number(media.aspect_ratio),
    dominantColor: nonEmpty(media.dominant_color),
    lqip: nonEmpty(media.lqip),
    focalPoint: record.focal_x !== null && record.focal_y !== null ? { x: record.focal_x, y: record.focal_y } : null,
    caption: pick(record.caption_tr, record.caption_en, lang),
    alt: pick(record.alt_tr, record.alt_en, lang),
    credit: media.credit,
    photographer: nonEmpty(media.photographer),
    license: media.license,
    archiveYear: record.archive_year,
    sources,
  };
}

/**
 * An inscription's AR target. Its `.mind` file is compiled next to the target photo's
 * variants (data/tools/compile_ar_targets.mts); the import drops a target whose file is
 * not compiled yet, so a key here always has one.
 */
function toArTarget(mediaKey: string | null, media: AssetMediaRecord[], mediaBaseUrl: string): ArTarget | null {
  const variant = media.find((m) => m.media_key === mediaKey)?.media.media_variant[0];
  if (!variant) return null;
  return { mindUrl: `${mediaBaseUrl}/${arTargetMindKey(variant.key)}`, mindarVersion: AR_MINDAR_VERSION };
}

export function toAssetSummary(
  record: AssetSummaryRecord,
  cover: AssetMediaRecord | undefined,
  context: MapperContext,
): AssetSummary {
  const { lang } = context;
  return {
    id: record.id,
    name: pick(record.name_tr, record.name_en, lang),
    subtitle: pick(record.subtitle_tr, record.subtitle_en, lang),
    type: label(record.asset_type, lang),
    era: record.era ? label(record.era, lang) : null,
    city: label(record.city, lang),
    district: record.district,
    coordinates: toCoordinates(record),
    summary: pick(record.summary_tr, record.summary_en, lang),
    datingDisplay: pick(record.dating_display_tr, record.dating_display_en, lang),
    cover: cover ? toMedia(cover, context) : null,
  };
}

function toAssetRef(record: { id: string; name_tr: string; name_en: string | null; asset_type: LabelRecord }, lang: Lang): AssetRef {
  return { id: record.id, name: pick(record.name_tr, record.name_en, lang), type: label(record.asset_type, lang) };
}

function toSourceRef(citation: AssetDetailRecord["source_citation"][number], lang: Lang): SourceRef {
  return {
    sourceId: citation.source.id,
    title: pick(citation.source.title_tr, citation.source.title_en, lang),
    pages: nonEmpty(citation.pages),
    url: nonEmpty(citation.source.url),
  };
}

/**
 * One link as the client sees it. `citations` may hold citations of other links:
 * only those recorded on the link's source asset under its key are used.
 */
export function toAssetRelation(
  { relation, direction }: DirectedRelation,
  other: AssetSummaryRecord,
  otherCover: AssetMediaRecord | undefined,
  citations: CitationRecord[],
  context: MapperContext,
): AssetRelation {
  const { lang } = context;
  const key = relationCitationKey(relation);
  return {
    type: label(relation.relation_type, lang),
    direction,
    asset: toAssetSummary(other, otherCover, context),
    description: pick(relation.description_tr, relation.description_en, lang),
    confidence: requiredConfidence(relation.confidence, lang),
    sources: citations
      .filter((citation) => citation.asset_id === relation.source_asset_id && citation.entity_key === key)
      .map((citation) => toSourceRef(citation, lang)),
  };
}

/** Citations grouped by the content item they belong to (`entity:entity_key`). */
function groupCitations(record: AssetDetailRecord, lang: Lang) {
  const byItem = new Map<string, SourceRef[]>();
  const bibliography = new Map<string, SourceRef>();
  for (const citation of record.source_citation) {
    const ref = toSourceRef(citation, lang);
    const key = `${citation.entity}:${citation.entity_key}`;
    byItem.set(key, [...(byItem.get(key) ?? []), ref]);
    if (!bibliography.has(ref.sourceId)) bibliography.set(ref.sourceId, { ...ref, pages: null });
  }
  return {
    sourcesOf: (entity: string, key = ""): SourceRef[] => byItem.get(`${entity}:${key}`) ?? [],
    bibliography: [...bibliography.values()],
  };
}

function toNamedNotes(names: { name: string; note?: string | null | undefined }[]): NamedNote[] {
  return names.map(({ name, note }) => ({ name, note: nonEmpty(note) }));
}

export function toAssetDetail(
  record: AssetDetailRecord,
  media: AssetMediaRecord[],
  secondaryTypes: LabelRecord[],
  context: MapperContext,
): AssetDetail {
  const { lang } = context;
  const { sourcesOf, bibliography } = groupCitations(record, lang);
  const cover = media.find((m) => m.is_cover);

  const alternateNames = AlternateNamesSchema.parse(record.alternate_names).map((n) => ({
    name: pick(n.tr, n.en, lang),
    note: nonEmpty(n.note),
  }));
  const candidates = toNamedNotes(CandidatesSchema.parse(record.architect_candidates));
  const deed = WaqfDeedSchema.parse(record.waqf_deed);

  const dating = {
    display: pick(record.dating_display_tr, record.dating_display_en, lang),
    startYear: record.start_year,
    endYear: record.end_year,
    hijriYear: record.hijri_year,
    century: record.century,
    basis: pick(record.dating_basis_tr, record.dating_basis_en, lang),
    confidence: toConfidence(record.dating_confidence, lang),
    sources: sourcesOf("dating"),
  };
  const hasDating = [dating.display, dating.startYear, dating.endYear, dating.hijriYear, dating.century].some(
    (value) => value !== null,
  );

  const architectName = nonEmpty(record.architect_name);
  const architectConfidence = toConfidence(record.architect_confidence, lang);

  const waqf = {
    name: nonEmpty(record.waqf_name),
    deedExcerpt: pick(deed?.excerpt?.tr, deed?.excerpt?.en, lang),
    deedDate: nonEmpty(deed?.date_display),
    conditions: pick(record.waqf_conditions_tr, record.waqf_conditions_en, lang),
    landNote: pick(record.waqf_land_note_tr, record.waqf_land_note_en, lang),
    confidence: toConfidence(record.waqf_confidence, lang),
    sources: sourcesOf("waqf"),
  };
  const hasWaqf = [waqf.name, waqf.deedExcerpt, waqf.conditions, waqf.landNote].some((value) => value !== null);

  const parent = record.asset && context.statuses.includes(record.asset.status) ? toAssetRef(record.asset, lang) : null;
  const ambientKey = nonEmpty(record.ambient_sound_key) ?? nonEmpty(record.asset_type.ambient_sound);
  const accessibility = (value: string) => AccessibilityStatusSchema.parse(value);
  const founderName = nonEmpty(record.founder_name);

  return {
    ...toAssetSummary(record, cover, context),
    alternateNames,
    secondaryTypes: secondaryTypes.map((t) => label(t, lang)),
    tags: record.tags,
    neighborhood: nonEmpty(record.neighborhood),
    address: nonEmpty(record.address),
    parent,
    children: record.other_asset.map((child) => toAssetRef(child, lang)),
    dating: hasDating ? dating : null,
    founder: founderName
      ? {
          name: founderName,
          role: nonEmpty(record.founder_role),
          confidence: toConfidence(record.founder_confidence, lang),
          sources: sourcesOf("founder"),
        }
      : null,
    architect:
      architectName || candidates.length > 0
        ? { name: architectName, candidates, confidence: architectConfidence, sources: sourcesOf("architect") }
        : null,
    waqf: hasWaqf ? waqf : null,
    sections: record.asset_section.map((s) => ({
      id: s.slug,
      title: pick(s.title_tr, s.title_en, lang),
      body: pick(s.body_tr, s.body_en, lang),
      confidence: requiredConfidence(s.confidence, lang),
      sources: sourcesOf("section", s.slug),
    })),
    facts: record.asset_fact.map((f) => ({
      key: f.key,
      label: pick(f.label_tr, f.label_en, lang),
      value: nonEmpty(f.value),
      valueNum: f.value_num === null ? null : Number(f.value_num),
      unit: nonEmpty(f.unit),
      note: pick(f.note_tr, f.note_en, lang),
      confidence: requiredConfidence(f.confidence, lang),
      sources: sourcesOf("fact", f.key),
    })),
    timeline: record.timeline_event.map((e) => ({
      id: e.slug,
      year: e.year,
      date: isoDate(e.date),
      hijri: nonEmpty(e.hijri),
      type: label(e.timeline_event_type, lang),
      title: pick(e.title_tr, e.title_en, lang),
      note: pick(e.note_tr, e.note_en, lang),
      confidence: requiredConfidence(e.confidence, lang),
      sources: sourcesOf("timeline", e.slug),
    })),
    legends: record.asset_legend.map((l) => ({
      id: l.slug,
      title: pick(l.title_tr, l.title_en, lang),
      body: pick(l.body_tr, l.body_en, lang),
      verdict: LegendVerdictSchema.parse(l.source_verdict),
      sources: sourcesOf("legend", l.slug),
    })),
    inscriptions: record.inscription.map((i) => ({
      id: i.slug,
      location: pick(i.location_tr, i.location_en, lang),
      language: i.language,
      script: nonEmpty(i.script),
      transliteration: nonEmpty(i.transliteration),
      translation: pick(i.translation_tr, i.translation_en, lang),
      author: nonEmpty(i.author),
      hijriYear: i.hijri_year,
      gregorian: nonEmpty(i.gregorian),
      note: pick(i.note_tr, i.note_en, lang),
      arTargetMediaKey: nonEmpty(i.ar_target_media_key),
      arTarget: toArTarget(i.ar_target_media_key, media, context.mediaBaseUrl),
      sources: sourcesOf("inscription", i.slug),
    })),
    people: record.asset_person.map((p) => ({ name: p.name, role: pick(p.role_tr, p.role_en, lang) })),
    highlights: record.asset_highlight.map((h) => ({
      feature: h.feature,
      title: pick(h.title_tr, h.title_en, lang),
      hint: pick(h.hint_tr, h.hint_en, lang),
      sectionId: nonEmpty(h.section_slug),
    })),
    media: media.map((m) => toMedia(m, context)),
    visitorTips: record.visitor_tip.map((t) => ({
      text: pick(t.text_tr, t.text_en, lang),
      origin: VisitorTipSchemaV2.shape.origin.parse(t.origin),
      collectedAt: isoDate(t.collected_at),
    })),
    accessibility: {
      wheelchair: accessibility(record.a11y_wheelchair),
      stepFree: accessibility(record.a11y_step_free),
      ramp: accessibility(record.a11y_ramp),
      toilet: accessibility(record.a11y_toilet),
      verified: record.a11y_verified,
      notes: pick(record.a11y_notes_tr, record.a11y_notes_en, lang),
      audioDescription: pick(record.audio_description_tr, record.audio_description_en, lang),
    },
    ambientSound: ambientKey
      ? { key: ambientKey, caption: pick(record.ambient_caption_tr, record.ambient_caption_en, lang) }
      : null,
    visit: {
      setting: nonEmpty(record.visit_setting),
      durationMin: record.visit_duration_min,
      entranceFee: nonEmpty(record.entrance_fee),
      notes: pick(record.visit_notes_tr, record.visit_notes_en, lang),
    },
    sources: bibliography,
    updatedAt: record.updated_at.toISOString(),
  };
}

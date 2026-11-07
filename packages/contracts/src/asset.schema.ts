import { z } from "zod";

/**
 * Vagabonds API data contract for waqf assets (`/assets`), v0.2.
 *
 * Mirrors the dataset model in data/README.md with camelCase fields. Texts are
 * already resolved to one language (`tr` or `en`; English falls back to Turkish
 * when missing). Every content item carries its confidence and sources, so the
 * client can never present an unverified claim as certain. Objects are strict
 * so a renamed or misspelled field fails loudly instead of being dropped.
 */

export const LangSchema = z.enum(["tr", "en"]);

export const AssetIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be lowercase kebab-case");

/** A code from data/enums.json with its label in the requested language. */
export const LabeledCodeSchema = z.strictObject({
  code: z.string().min(1),
  label: z.string().min(1),
});

export const ConfidenceCodeSchema = z.enum(["certain", "probable", "disputed", "legend"]);

/** `probable`, `disputed` and `legend` must be shown with a badge, never as plain fact. */
export const ConfidenceSchema = z.strictObject({
  code: ConfidenceCodeSchema,
  label: z.string().min(1),
});

export const AccessibilityStatusSchema = z.enum(["yes", "partial", "no", "unknown"]);

export const LegendVerdictSchema = z.enum(["folk_belief", "refuted_by_source", "unverified"]);

export const MediaKindSchema = z.enum(["photo", "archive_photo", "drawing", "audio", "video", "document"]);

/** Where a piece of content comes from, e.g. "Bursa Vakıf Eserleri – I. Cilt", pages "52-55". */
export const SourceRefSchema = z.strictObject({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  pages: z.string().min(1).nullable(),
  url: z.url().nullable(),
});

/** One line of a recording's captions: every sound event in brackets, from second `at`. */
export const SoundCaptionSchema = z.strictObject({
  at: z.number().min(0),
  text: z.string().min(1),
});

/** A published ambient recording (Sesli Zaman Kapsülü), from data/sounds.json. */
export const SoundRecordingSchema = z.strictObject({
  url: z.url(),
  durationSeconds: z.number().positive(),
  /** In time order; show them while the sound plays. */
  captions: z.array(SoundCaptionSchema).min(1),
  license: z.enum(["CC0-1.0", "CC-BY-4.0"]),
  /** Show it wherever the recording plays, e.g. "Ses: Ayşe Yılmaz (CC BY 4.0)". */
  credit: z.string().min(1),
  /** Where the recording comes from, e.g. its freesound.org page. */
  sourceUrl: z.url(),
});

/** Null when the location is not known yet; such assets are left off the map and out of nearby results. */
export const CoordinatesSchema = z.strictObject({
  lat: z.number().min(35.5).max(42.5),
  lng: z.number().min(25.5).max(45),
  /** False for coordinates taken from photo GPS or geocoding that nobody has checked on site. */
  verified: z.boolean(),
  source: z.string().min(1).nullable(),
  /**
   * True when the point is only the centre of the asset's neighbourhood or village (`source: "osm_area"`):
   * show the asset as roughly there, e.g. with a different marker. Visits to it are not position-checked.
   */
  approximate: z.boolean().default(false),
});

export const ImageSourceSchema = z.strictObject({
  url: z.url(),
  width: z.int().positive(),
  height: z.int().positive(),
});

/** A place in the dossier: a block's name, or `section:<id>` / `custom:<id>`. */
export const DossierPlaceSchema = z
  .string()
  .max(120)
  .regex(/^[a-z_]+(?::[a-z0-9_-]+)?$/, "must be a block, section:<id> or custom:<id>");

/** One image with responsive variants. The photo's own GPS position is never part of the contract. */
export const MediaSchema = z.strictObject({
  key: z.string().min(1),
  kind: MediaKindSchema,
  isCover: z.boolean(),
  width: z.int().positive(),
  height: z.int().positive(),
  aspectRatio: z.number().positive(),
  dominantColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
  /** Tiny blurred preview (data URI) shown while the image loads. */
  lqip: z.string().min(1).nullable(),
  focalPoint: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable(),
  caption: z.string().min(1).nullable(),
  alt: z.string().min(1),
  credit: z.string().min(1),
  photographer: z.string().min(1).nullable(),
  license: z.string().min(1),
  /** Year of an archive photo. */
  archiveYear: z.int().nullable(),
  /**
   * What the photo shows, from the dataset: `exterior`, `portal`, `inscription`, `mihrab`,
   * `ornament_detail`… Ziyaret Mührü picks a specific part of the monument by it. Null when unknown.
   */
  subject: z.string().min(1).nullable().default(null),
  /**
   * Where the admin put the photo in the asset's dossier: under a block (`identity`, `timeline`…), a
   * chapter (`section:<id>`) or an added block (`custom:<id>`). Null: not placed by hand.
   */
  dossierAfter: DossierPlaceSchema.nullable().default(null),
  sources: z.strictObject({
    webp: z.array(ImageSourceSchema),
    jpg: z.array(ImageSourceSchema),
  }),
});

/** Fields shared by the list item and the detail. */
export const AssetSummarySchema = z.strictObject({
  id: AssetIdSchema,
  name: z.string().min(1),
  subtitle: z.string().min(1).nullable(),
  type: LabeledCodeSchema,
  era: LabeledCodeSchema.nullable(),
  city: LabeledCodeSchema,
  district: z.string().min(1),
  coordinates: CoordinatesSchema.nullable(),
  summary: z.string().min(1),
  datingDisplay: z.string().min(1).nullable(),
  /**
   * When it was built, short, for a card: the Gregorian year the dating names ("1399"), else the
   * record's start year, else its century ("XV. yüzyıl"); null when the book gives none. Never a
   * Hijri year or an unrelated date (a founder's death, a rebuilding) the dating also mentions.
   */
  yearLabel: z.string().min(1).nullable().default(null),
  /** Null when the asset has no processed photo yet; show a placeholder. */
  cover: MediaSchema.nullable(),
  /**
   * The complex (külliye) this asset is a building of; null when it stands on its own or its
   * complex is not published. The map shows a complex's buildings as the complex alone.
   */
  parentId: AssetIdSchema.nullable(),
  /**
   * How much the record tells about the asset: its sections, highlights, legends, people,
   * timeline events and inscriptions, counted. The data has no measure of fame; this stands in
   * for it, and the map keeps the better-known assets longest as it zooms out.
   */
  prominence: z.number().int().min(0),
});

export const AssetRefSchema = z.strictObject({
  id: AssetIdSchema,
  name: z.string().min(1),
  type: LabeledCodeSchema,
});

export const NamedNoteSchema = z.strictObject({
  name: z.string().min(1),
  note: z.string().min(1).nullable(),
});

/**
 * A block the admin added to the dossier. `body` is plain text with a few marks (`## heading`,
 * `**bold**`, `_italic_`, `- item`, `> quote`), never HTML; the app draws it. `after` is the block it follows.
 */
export const CustomBlockSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  after: DossierPlaceSchema,
});

export const AssetSectionSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1).nullable(),
  body: z.string().min(1),
  confidence: ConfidenceSchema,
  sources: z.array(SourceRefSchema),
});

export const AssetFactSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1).nullable(),
  valueNum: z.number().nullable(),
  unit: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
  confidence: ConfidenceSchema,
  sources: z.array(SourceRefSchema),
});

export const TimelineEventSchema = z.strictObject({
  id: z.string().min(1),
  year: z.int().nullable(),
  date: z.string().min(1).nullable(),
  hijri: z.string().min(1).nullable(),
  type: LabeledCodeSchema,
  title: z.string().min(1),
  note: z.string().min(1).nullable(),
  confidence: ConfidenceSchema,
  sources: z.array(SourceRefSchema),
});

/** Legends are kept apart from the history sections and always shown as legends. */
export const AssetLegendSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  verdict: LegendVerdictSchema,
  sources: z.array(SourceRefSchema),
});

/**
 * MindAR release the AR target files (`.mind`) are compiled with. A `.mind` file only
 * loads in the release that compiled it, so the data pipeline, the API and the app share this.
 */
export const AR_MINDAR_VERSION = "1.2.5";

/** Storage key of an AR target's `.mind` file, next to the variants of the photo it was compiled from. */
export function arTargetMindKey(photoVariantKey: string): string {
  return `${photoVariantKey.slice(0, photoVariantKey.lastIndexOf("/"))}/target-mindar-${AR_MINDAR_VERSION}.mind`;
}

/** The compiled AR marker of an inscription (Taşın Dili). */
export const ArTargetSchema = z.strictObject({
  /** MindAR `.mind` file of the target photo. */
  mindUrl: z.url(),
  /** MindAR release that compiled it; a tracker of another release cannot load it. */
  mindarVersion: z.string().min(1),
});

export const InscriptionSchemaV2 = z.strictObject({
  id: z.string().min(1),
  location: z.string().min(1).nullable(),
  language: z.string().min(1),
  script: z.string().min(1).nullable(),
  transliteration: z.string().min(1).nullable(),
  translation: z.string().min(1).nullable(),
  author: z.string().min(1).nullable(),
  hijriYear: z.int().nullable(),
  gregorian: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
  /** Key of the photo in `media` used as the AR marker (Taşın Dili), if any. */
  arTargetMediaKey: z.string().min(1).nullable(),
  /** Null when the inscription has no target, or its `.mind` file is not compiled yet. */
  arTarget: ArTargetSchema.nullable(),
  sources: z.array(SourceRefSchema),
});

export const AssetPersonSchema = z.strictObject({
  name: z.string().min(1),
  role: z.string().min(1).nullable(),
});

export const AssetHighlightSchema = z.strictObject({
  feature: z.string().min(1),
  title: z.string().min(1),
  hint: z.string().min(1).nullable(),
  sectionId: z.string().min(1).nullable(),
});

export const VisitorTipSchemaV2 = z.strictObject({
  text: z.string().min(1),
  origin: z.enum(["field_visit", "visitor_reviews_summary", "official"]),
  collectedAt: z.iso.date().nullable(),
});

export const AssetDetailSchema = AssetSummarySchema.extend({
  alternateNames: z.array(NamedNoteSchema),
  secondaryTypes: z.array(LabeledCodeSchema),
  tags: z.array(z.string().min(1)),
  neighborhood: z.string().min(1).nullable(),
  address: z.string().min(1).nullable(),
  parent: AssetRefSchema.nullable(),
  children: z.array(AssetRefSchema),
  dating: z
    .strictObject({
      display: z.string().min(1).nullable(),
      startYear: z.int().nullable(),
      endYear: z.int().nullable(),
      hijriYear: z.int().nullable(),
      century: z.int().nullable(),
      basis: z.string().min(1).nullable(),
      confidence: ConfidenceSchema.nullable(),
      sources: z.array(SourceRefSchema),
    })
    .nullable(),
  founder: z
    .strictObject({
      name: z.string().min(1),
      role: z.string().min(1).nullable(),
      confidence: ConfidenceSchema.nullable(),
      sources: z.array(SourceRefSchema),
    })
    .nullable(),
  architect: z
    .strictObject({
      name: z.string().min(1).nullable(),
      candidates: z.array(NamedNoteSchema),
      confidence: ConfidenceSchema.nullable(),
      sources: z.array(SourceRefSchema),
    })
    .nullable(),
  waqf: z
    .strictObject({
      name: z.string().min(1).nullable(),
      deedExcerpt: z.string().min(1).nullable(),
      deedDate: z.string().min(1).nullable(),
      conditions: z.string().min(1).nullable(),
      landNote: z.string().min(1).nullable(),
      confidence: ConfidenceSchema.nullable(),
      sources: z.array(SourceRefSchema),
    })
    .nullable(),
  sections: z.array(AssetSectionSchema),
  customBlocks: z.array(CustomBlockSchema).default([]),
  facts: z.array(AssetFactSchema),
  timeline: z.array(TimelineEventSchema),
  legends: z.array(AssetLegendSchema),
  inscriptions: z.array(InscriptionSchemaV2),
  people: z.array(AssetPersonSchema),
  highlights: z.array(AssetHighlightSchema),
  media: z.array(MediaSchema),
  visitorTips: z.array(VisitorTipSchemaV2),
  accessibility: z.strictObject({
    wheelchair: AccessibilityStatusSchema,
    stepFree: AccessibilityStatusSchema,
    ramp: AccessibilityStatusSchema,
    toilet: AccessibilityStatusSchema,
    /** False until someone has checked on site; "unknown" must read as "no information", never "accessible". */
    verified: z.boolean(),
    notes: z.string().min(1).nullable(),
    audioDescription: z.string().min(1).nullable(),
  }),
  /** Ambient sound loop key (Sesli Zaman Kapsülü); falls back to the asset type's default. */
  ambientSound: z
    .strictObject({
      key: z.string().min(1),
      caption: z.string().min(1).nullable(),
      /** The key's published recording; null until the data team adds one (the app plays its own sound for the key). */
      recording: SoundRecordingSchema.nullable(),
    })
    .nullable(),
  visit: z.strictObject({
    setting: z.string().min(1).nullable(),
    durationMin: z.int().nullable(),
    entranceFee: z.string().min(1).nullable(),
    notes: z.string().min(1).nullable(),
  }),
  /** Every source cited anywhere in this asset, for a bibliography list. */
  sources: z.array(SourceRefSchema),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const ContractVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver (x.y.z)");

/** Response body of `GET /assets`. */
export const AssetListResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  total: z.int().min(0),
  limit: z.int().positive(),
  offset: z.int().min(0),
  items: z.array(AssetSummarySchema),
});

/** `outgoing`: the link is recorded on this asset; `incoming`: on the other asset. */
export const RelationDirectionSchema = z.enum(["outgoing", "incoming"]);

/** A link between two assets (Kentsel Ağ). `asset` is the other end; its coordinates draw the line on the map. */
export const AssetRelationSchema = z.strictObject({
  type: LabeledCodeSchema,
  direction: RelationDirectionSchema,
  asset: AssetSummarySchema,
  description: z.string().min(1),
  confidence: ConfidenceSchema,
  sources: z.array(SourceRefSchema),
});

/**
 * A link to a place the dataset has no record of, e.g. the Istanbul complex a Bursa han was built to fund:
 * shown by the name the source gives, not on the map. Always recorded on this asset.
 */
export const OutsideRelationSchema = z.strictObject({
  type: LabeledCodeSchema,
  /** As the source names it, e.g. "II. Bayezid Külliyesi (İstanbul)". */
  name: z.string().min(1),
  description: z.string().min(1),
  confidence: ConfidenceSchema,
  sources: z.array(SourceRefSchema),
});

/** Response body of `GET /assets/:id/relations`. */
export const AssetRelationsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  assetId: AssetIdSchema,
  items: z.array(AssetRelationSchema),
  /** Links to places outside the dataset, by name (Kentsel Ağ beyond the map). */
  outside: z.array(OutsideRelationSchema),
  /** Links to assets not published yet, or to outside places the source does not name: counted, never returned. */
  unavailableCount: z.int().min(0),
});

export const NearbyAssetSchema = z.strictObject({
  /** Straight-line (great-circle) distance, not walking distance. */
  distanceMeters: z.int().min(0),
  asset: AssetSummarySchema,
});

/** Response body of `GET /assets/:id/nearby`. */
export const NearbyAssetsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  assetId: AssetIdSchema,
  /** Null when this asset has no coordinates yet; `items` is then empty. */
  origin: CoordinatesSchema.nullable(),
  radiusMeters: z.int().positive(),
  /** Nearest first. Assets without coordinates are never included. */
  items: z.array(NearbyAssetSchema),
});

/**
 * One inscription the camera can find (Taşın Dili), with where it is: enough for the app to pick
 * the ones near the visitor and fetch their `.mind` files without asking for every asset first.
 */
export const ArTargetEntrySchema = z.strictObject({
  assetId: AssetIdSchema,
  inscriptionId: z.string().min(1),
  /** `cities` code of the asset. */
  city: z.string().min(1),
  /** The asset's, or for a building without its own its complex's; null when neither has one. */
  coordinates: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
  mindUrl: z.url(),
  mindarVersion: z.string().min(1),
});

/** Response body of `GET /ar-targets`: every inscription with a compiled target, in no set order. */
export const ArTargetsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  items: z.array(ArTargetEntrySchema),
});

export type Lang = z.infer<typeof LangSchema>;
export type LabeledCode = z.infer<typeof LabeledCodeSchema>;
export type ConfidenceCode = z.infer<typeof ConfidenceCodeSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type AccessibilityStatus = z.infer<typeof AccessibilityStatusSchema>;
export type LegendVerdict = z.infer<typeof LegendVerdictSchema>;
export type MediaKind = z.infer<typeof MediaKindSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type ImageSource = z.infer<typeof ImageSourceSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type AssetSummary = z.infer<typeof AssetSummarySchema>;
export type AssetRef = z.infer<typeof AssetRefSchema>;
export type NamedNote = z.infer<typeof NamedNoteSchema>;
export type AssetSection = z.infer<typeof AssetSectionSchema>;
export type AssetFact = z.infer<typeof AssetFactSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type AssetLegend = z.infer<typeof AssetLegendSchema>;
export type ArTarget = z.infer<typeof ArTargetSchema>;
export type ArTargetEntry = z.infer<typeof ArTargetEntrySchema>;
export type ArTargetsResponse = z.infer<typeof ArTargetsResponseSchema>;
export type SoundCaption = z.infer<typeof SoundCaptionSchema>;
export type SoundRecording = z.infer<typeof SoundRecordingSchema>;
export type InscriptionV2 = z.infer<typeof InscriptionSchemaV2>;
export type AssetPerson = z.infer<typeof AssetPersonSchema>;
export type AssetHighlight = z.infer<typeof AssetHighlightSchema>;
export type VisitorTipV2 = z.infer<typeof VisitorTipSchemaV2>;
export type AssetDetail = z.infer<typeof AssetDetailSchema>;
export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;
export type RelationDirection = z.infer<typeof RelationDirectionSchema>;
export type AssetRelation = z.infer<typeof AssetRelationSchema>;
export type OutsideRelation = z.infer<typeof OutsideRelationSchema>;
export type AssetRelationsResponse = z.infer<typeof AssetRelationsResponseSchema>;
export type NearbyAsset = z.infer<typeof NearbyAssetSchema>;
export type NearbyAssetsResponse = z.infer<typeof NearbyAssetsResponseSchema>;

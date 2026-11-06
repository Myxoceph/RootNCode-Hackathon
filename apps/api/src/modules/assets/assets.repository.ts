import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

export type AssetVisibility = "published" | "preview";

/** Statuses served for each visibility. Drafts are never served. */
export function visibleStatuses(visibility: AssetVisibility): string[] {
  return visibility === "preview" ? ["published", "in_review"] : ["published"];
}

/** Every status, drafts included: only for the admin panel's preview. */
export const ALL_ASSET_STATUSES = ["draft", "in_review", "published"];

const labelSelect = { code: true, label_tr: true, label_en: true } as const;

export const summarySelect = {
  id: true,
  name_tr: true,
  name_en: true,
  subtitle_tr: true,
  subtitle_en: true,
  district: true,
  lat: true,
  lng: true,
  coord_verified: true,
  coord_source: true,
  summary_tr: true,
  summary_en: true,
  dating_display_tr: true,
  dating_display_en: true,
  start_year: true,
  century: true,
  asset_type: { select: labelSelect },
  era: { select: labelSelect },
  city: { select: labelSelect },
  // The complex this asset belongs to, and whether it may be shown.
  parent_id: true,
  asset: { select: { status: true } },
  // What the record tells about it: the asset's prominence.
  _count: { select: { asset_section: true, asset_highlight: true, asset_legend: true, asset_person: true, timeline_event: true, inscription: true } },
} satisfies Prisma.assetSelect;

/**
 * Image fields served to clients. `media.capture_lat` / `capture_lng` (where the
 * photo was taken) are deliberately not selected: they must never leave the server.
 */
export const assetMediaSelect = {
  asset_id: true,
  media_key: true,
  sort_order: true,
  is_cover: true,
  focal_x: true,
  focal_y: true,
  caption_tr: true,
  caption_en: true,
  alt_tr: true,
  alt_en: true,
  archive_year: true,
  subject: true,
  dossier_after: true,
  media: {
    select: {
      kind: true,
      width: true,
      height: true,
      aspect_ratio: true,
      dominant_color: true,
      lqip: true,
      credit: true,
      photographer: true,
      license: true,
      media_variant: { select: { format: true, width: true, height: true, key: true }, orderBy: { width: "asc" } },
    },
  },
} satisfies Prisma.asset_mediaSelect;

const assetRefSelect = { id: true, name_tr: true, name_en: true, asset_type: { select: labelSelect } } as const;

const citationSelect = {
  entity: true,
  entity_key: true,
  pages: true,
  source: { select: { id: true, title_tr: true, title_en: true, url: true } },
} satisfies Prisma.source_citationSelect;

function detailArgs(statuses: string[]) {
  return {
    omit: { source_json: true },
    include: {
      asset_type: { select: { ...labelSelect, ambient_sound: true } },
      era: { select: labelSelect },
      city: { select: labelSelect },
      asset: { select: { ...assetRefSelect, status: true } },
      other_asset: { where: { status: { in: statuses } }, select: assetRefSelect, orderBy: { name_tr: "asc" } },
      asset_section: { orderBy: { sort_order: "asc" } },
      asset_custom_block: { orderBy: { sort_order: "asc" } },
      asset_legend: { orderBy: { sort_order: "asc" } },
      asset_fact: { orderBy: { sort_order: "asc" } },
      asset_person: { orderBy: { sort_order: "asc" } },
      timeline_event: {
        include: { timeline_event_type: { select: labelSelect } },
        orderBy: [{ year: "asc" }, { slug: "asc" }],
      },
      asset_highlight: { orderBy: { sort_order: "asc" } },
      inscription: { orderBy: { sort_order: "asc" } },
      visitor_tip: { orderBy: { id: "asc" } },
      source_citation: { select: citationSelect, orderBy: { id: "asc" } },
    },
  } as const satisfies Omit<Prisma.assetFindFirstArgs, "where">;
}

export type AssetSummaryRecord = Prisma.assetGetPayload<{ select: typeof summarySelect }>;
export type AssetMediaRecord = Prisma.asset_mediaGetPayload<{ select: typeof assetMediaSelect }>;
export type AssetDetailRecord = Prisma.assetGetPayload<ReturnType<typeof detailArgs>>;
export type LabelRecord = { code: string; label_tr: string; label_en: string | null };

const relationSelect = {
  source_asset_id: true,
  target_asset_id: true,
  description_tr: true,
  description_en: true,
  confidence: true,
  target_name_tr: true,
  target_name_en: true,
  relation_type: { select: labelSelect },
} satisfies Prisma.asset_relationSelect;

const locationSelect = { id: true, lat: true, lng: true, coord_verified: true, coord_source: true } as const;

export type RelationRecord = Prisma.asset_relationGetPayload<{ select: typeof relationSelect }>;
export type CitationRecord = Prisma.source_citationGetPayload<{ select: typeof citationSelect & { asset_id: true } }>;
export type LocationRecord = Prisma.assetGetPayload<{ select: typeof locationSelect }>;

export interface AssetListFilters {
  city?: string | undefined;
  type?: string | undefined;
  era?: string | undefined;
  q?: string | undefined;
  /** minLng, minLat, maxLng, maxLat */
  bbox?: [number, number, number, number] | undefined;
  limit: number;
  offset: number;
}

const TURKISH_TO_ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/**
 * ASCII form of a search term, matching how asset ids are written
 * ("Kurşunlu Han" → "kursunlu-han"), so users can search without Turkish characters.
 */
export function toIdFragment(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (ch) => TURKISH_TO_ASCII[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface AssetsRepository {
  findMany(filters: AssetListFilters): Promise<{ total: number; items: AssetSummaryRecord[] }>;
  findById(id: string): Promise<AssetDetailRecord | null>;
  /** Images of the given assets, ordered; with `coversOnly`, just each asset's cover. */
  findMedia(assetIds: string[], options?: { coversOnly?: boolean }): Promise<AssetMediaRecord[]>;
  findAssetTypes(codes: string[]): Promise<LabelRecord[]>;
  /** Visible assets among `ids`, in no particular order. */
  findSummaries(ids: string[]): Promise<AssetSummaryRecord[]>;
  /** Coordinates of a visible asset, or null when the asset is not visible. */
  findLocation(id: string): Promise<LocationRecord | null>;
  /**
   * Every link recorded on this asset or pointing at it, whatever the other end's
   * status; the caller drops links to assets it cannot show.
   */
  findRelations(id: string): Promise<RelationRecord[]>;
  /** The ids that have a record in the dataset, whatever their status. */
  findExistingIds(ids: string[]): Promise<Set<string>>;
  /** Citations of the given relations, keyed in the dataset as `<target id>:<type>` on the source asset. */
  findRelationCitations(relations: RelationRecord[]): Promise<CitationRecord[]>;
  /** Visible assets with coordinates inside the box, except `excludeId`. */
  findLocatedInBox(bbox: [number, number, number, number], excludeId: string): Promise<AssetSummaryRecord[]>;
}

/** `entity_key` of a relation citation, as written by data/tools/db_rows.py. */
export function relationCitationKey(relation: Pick<RelationRecord, "target_asset_id" | "relation_type">): string {
  return `${relation.target_asset_id}:${relation.relation_type.code}`;
}

export function createAssetsRepository(
  prisma: PrismaClient,
  visibility: AssetVisibility,
  statuses: string[] = visibleStatuses(visibility),
): AssetsRepository {

  return {
    async findMany({ city, type, era, q, bbox, limit, offset }) {
      const idFragment = q ? toIdFragment(q) : "";
      const where: Prisma.assetWhereInput = {
        status: { in: statuses },
        ...(city && { city_code: city }),
        ...(type && { type_code: type }),
        ...(era && { era_code: era }),
        ...(q && {
          OR: [
            { name_tr: { contains: q, mode: "insensitive" } },
            { name_en: { contains: q, mode: "insensitive" } },
            ...(idFragment ? [{ id: { contains: idFragment } }] : []),
          ],
        }),
        ...(bbox && { lng: { gte: bbox[0], lte: bbox[2] }, lat: { gte: bbox[1], lte: bbox[3] } }),
      };
      const [total, items] = await Promise.all([
        prisma.asset.count({ where }),
        prisma.asset.findMany({
          where,
          select: summarySelect,
          orderBy: [{ name_tr: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
        }),
      ]);
      return { total, items };
    },

    findById(id) {
      return prisma.asset.findFirst({ where: { id, status: { in: statuses } }, ...detailArgs(statuses) });
    },

    findMedia(assetIds, { coversOnly = false } = {}) {
      if (assetIds.length === 0) return Promise.resolve([]);
      return prisma.asset_media.findMany({
        where: {
          asset_id: { in: assetIds },
          media: { status: "published" },
          ...(coversOnly && { is_cover: true }),
        },
        select: assetMediaSelect,
        orderBy: [{ asset_id: "asc" }, { sort_order: "asc" }, { media_key: "asc" }],
      });
    },

    findAssetTypes(codes) {
      if (codes.length === 0) return Promise.resolve([]);
      return prisma.asset_type.findMany({ where: { code: { in: codes } }, select: labelSelect });
    },

    findSummaries(ids) {
      if (ids.length === 0) return Promise.resolve([]);
      return prisma.asset.findMany({ where: { id: { in: ids }, status: { in: statuses } }, select: summarySelect });
    },

    findLocation(id) {
      return prisma.asset.findFirst({ where: { id, status: { in: statuses } }, select: locationSelect });
    },

    findRelations(id) {
      return prisma.asset_relation.findMany({
        where: { OR: [{ source_asset_id: id }, { target_asset_id: id }] },
        select: relationSelect,
        orderBy: { id: "asc" },
      });
    },

    async findExistingIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true } });
      return new Set(rows.map((row) => row.id));
    },

    findRelationCitations(relations) {
      if (relations.length === 0) return Promise.resolve([]);
      return prisma.source_citation.findMany({
        where: {
          entity: "relation",
          OR: relations.map((relation) => ({
            asset_id: relation.source_asset_id,
            entity_key: relationCitationKey(relation),
          })),
        },
        select: { ...citationSelect, asset_id: true },
        orderBy: { id: "asc" },
      });
    },

    findLocatedInBox([minLng, minLat, maxLng, maxLat], excludeId) {
      return prisma.asset.findMany({
        where: {
          id: { not: excludeId },
          status: { in: statuses },
          lng: { gte: minLng, lte: maxLng },
          lat: { gte: minLat, lte: maxLat },
        },
        select: summarySelect,
      });
    },
  };
}

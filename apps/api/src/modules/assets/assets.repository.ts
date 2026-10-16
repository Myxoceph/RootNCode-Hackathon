import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

export type AssetVisibility = "published" | "preview";

/** Statuses served for each visibility. Drafts are never served. */
export function visibleStatuses(visibility: AssetVisibility): string[] {
  return visibility === "preview" ? ["published", "in_review"] : ["published"];
}

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
  asset_type: { select: labelSelect },
  era: { select: labelSelect },
  city: { select: labelSelect },
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
}

export function createAssetsRepository(prisma: PrismaClient, visibility: AssetVisibility): AssetsRepository {
  const statuses = visibleStatuses(visibility);

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
  };
}

import type { AdminAssetRecord } from "@vagabonds/contracts";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import { assetMediaSelect, type AssetMediaRecord } from "../assets/assets.repository.ts";
import { assetColumns, recordSelect, writeLists, type AssetRecordRow } from "./asset-record.ts";
import { PANEL_PREFIX } from "./panel-asset.ts";

const adminUserSelect = {
  id: true,
  nickname: true,
  username: true,
  role: true,
  created_at: true,
  banned_at: true,
  _count: { select: { contributions: true } },
} satisfies Prisma.app_userSelect;

export type AdminUserRecord = Prisma.app_userGetPayload<{ select: typeof adminUserSelect }>;

const panelAssetSelect = {
  id: true,
  name_tr: true,
  district: true,
  status: true,
  prepared_by: true,
  updated_at: true,
  asset_type: { select: { label_tr: true } },
  city: { select: { label_tr: true } },
} satisfies Prisma.assetSelect;

export type PanelAssetRecord = Prisma.assetGetPayload<{ select: typeof panelAssetSelect }>;


export interface AdminSummary {
  pendingNotes: number;
  pendingPhotos: number;
  users: number;
  accounts: number;
  banned: number;
  panelAssets: number;
}

export interface NewPanelPhoto {
  assetId: string;
  mediaKey: string;
  photo: {
    sha256: string;
    originalKey: string;
    originalBytes: number;
    width: number;
    height: number;
    aspectRatio: number;
    lqip: string;
    dominantColor: string;
    credit: string;
    license: string;
    variants: Array<{ key: string; format: string; width: number; height: number; bytes: number }>;
  };
  caption: { tr: string; en: string | null };
  alt: { tr: string; en: string | null };
  isCover: boolean;
}

export interface AdminRepository {
  /** Whether this photo is stored at all, and whether this asset already has it. */
  knownPhoto(sha256: string, assetId: string): Promise<{ exists: boolean; onAsset: boolean }>;
  /** Adds the photo after the asset's others. It becomes the cover when asked, or when the asset has none. */
  addPanelPhoto(data: NewPanelPhoto): Promise<AssetMediaRecord>;
  /** Removes an uploaded photo, with its files' keys when no other asset has it. The next photo takes over as cover. */
  removePanelPhoto(assetId: string, key: string): Promise<{ fileKeys: string[] } | "not_found" | "dataset">;
  summary(): Promise<AdminSummary>;
  listUsers(query: { q?: string | undefined; role?: string | undefined; limit: number; offset: number }): Promise<{
    total: number;
    items: AdminUserRecord[];
  }>;
  setRole(id: string, role: string): Promise<AdminUserRecord | null>;
  unban(id: string): Promise<AdminUserRecord | null>;
  /** Whether the type and era exist, and the city's region (null for an unknown city). */
  findCodes(codes: { type: string; city: string; era: string | null }): Promise<{
    type: boolean;
    region: string | null;
    era: boolean;
  }>;
  assetExists(id: string): Promise<boolean>;
  /** Every asset, panel and dataset, last changed first. */
  listAssets(): Promise<PanelAssetRecord[]>;
  deletePanelAsset(id: string): Promise<boolean>;
  /** Every table row the panel's editor shows, or null for an unknown id. */
  readRecord(id: string): Promise<AssetRecordRow | null>;
  /**
   * Writes a whole record: the asset's columns and its lists, in one transaction. A new asset gets
   * `prepared_by` and `source_json`; an update rewrites `source_json` only when given (panel assets).
   */
  writeRecord(
    id: string,
    record: AdminAssetRecord,
    options: {
      mode: "create" | "update";
      /** Who saves it: a published asset needs a reviewer, and this is them when it has none. */
      reviewer: string;
      preparedBy?: string;
      sourceJson?: Prisma.InputJsonObject;
      todos?: string[];
    },
  ): Promise<PanelAssetRecord>;
}

const isPanelAsset = { prepared_by: { startsWith: PANEL_PREFIX } } satisfies Prisma.assetWhereInput;

export function createAdminRepository(prisma: PrismaClient): AdminRepository {
  return {
    async summary() {
      const [pendingNotes, pendingPhotos, users, accounts, banned, panelAssets] = await Promise.all([
        prisma.contribution.count({ where: { status: "pending", kind: { not: "photo" } } }),
        prisma.contribution.count({ where: { status: "pending", kind: "photo" } }),
        prisma.app_user.count(),
        prisma.app_user.count({ where: { username: { not: null } } }),
        prisma.app_user.count({ where: { banned_at: { not: null } } }),
        prisma.asset.count({ where: isPanelAsset }),
      ]);
      return { pendingNotes, pendingPhotos, users, accounts, banned, panelAssets };
    },

    async listUsers({ q, role, limit, offset }) {
      const where: Prisma.app_userWhereInput = {
        ...(role && { role }),
        ...(q && {
          OR: [{ nickname: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase() } }],
        }),
      };
      const [total, items] = await Promise.all([
        prisma.app_user.count({ where }),
        prisma.app_user.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip: offset,
          take: limit,
          select: adminUserSelect,
        }),
      ]);
      return { total, items };
    },

    async setRole(id, role) {
      const { count } = await prisma.app_user.updateMany({ where: { id }, data: { role } });
      return count === 0 ? null : prisma.app_user.findUnique({ where: { id }, select: adminUserSelect });
    },

    async unban(id) {
      const { count } = await prisma.app_user.updateMany({ where: { id }, data: { banned_at: null } });
      return count === 0 ? null : prisma.app_user.findUnique({ where: { id }, select: adminUserSelect });
    },

    async findCodes({ type, city, era }) {
      const [typeRow, cityRow, eraRow] = await Promise.all([
        prisma.asset_type.findUnique({ where: { code: type }, select: { code: true } }),
        prisma.city.findUnique({ where: { code: city }, select: { region_code: true } }),
        era ? prisma.era.findUnique({ where: { code: era }, select: { code: true } }) : null,
      ]);
      return { type: typeRow !== null, region: cityRow?.region_code ?? null, era: era === null || eraRow !== null };
    },

    async assetExists(id) {
      return (await prisma.asset.findUnique({ where: { id }, select: { id: true } })) !== null;
    },

    listAssets() {
      return prisma.asset.findMany({ orderBy: [{ updated_at: "desc" }, { name_tr: "asc" }], select: panelAssetSelect });
    },


    async knownPhoto(sha256, assetId) {
      const media = await prisma.media.findUnique({ where: { sha256 }, select: { id: true } });
      if (!media) return { exists: false, onAsset: false };
      return { exists: true, onAsset: (await prisma.asset_media.count({ where: { asset_id: assetId, media_id: media.id } })) > 0 };
    },

    addPanelPhoto({ assetId, mediaKey, photo, caption, alt, isCover }) {
      return prisma.$transaction(async (tx) => {
        const { variants, ...file } = photo;
        const media = await tx.media.upsert({
          where: { sha256: file.sha256 },
          update: {},
          create: {
            sha256: file.sha256,
            kind: "photo",
            original_key: file.originalKey,
            original_bytes: file.originalBytes,
            width: file.width,
            height: file.height,
            aspect_ratio: file.aspectRatio,
            dominant_color: file.dominantColor,
            lqip: file.lqip,
            credit: file.credit,
            license: file.license,
            source_provider: "panel",
          },
          select: { id: true, media_variant: { select: { key: true }, take: 1 } },
        });
        // A photo another asset already has keeps its own files.
        if (media.media_variant.length === 0) await tx.media_variant.createMany({ data: variants.map((v) => ({ media_id: media.id, ...v })) });
        const hasCover = (await tx.asset_media.count({ where: { asset_id: assetId, is_cover: true } })) > 0;
        const cover = isCover || !hasCover;
        if (cover) await tx.asset_media.updateMany({ where: { asset_id: assetId }, data: { is_cover: false } });
        const last = await tx.asset_media.aggregate({ where: { asset_id: assetId }, _max: { sort_order: true } });
        return tx.asset_media.create({
          data: {
            asset_id: assetId,
            media_key: mediaKey,
            media_id: media.id,
            sort_order: (last._max.sort_order ?? -1) + 1,
            is_cover: cover,
            caption_tr: caption.tr,
            caption_en: caption.en,
            alt_tr: alt.tr,
            alt_en: alt.en,
            panel_upload: true,
          },
          select: assetMediaSelect,
        });
      });
    },

    removePanelPhoto(assetId, key) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.asset_media.findFirst({
          where: { asset_id: assetId, media_key: key },
          select: { media_id: true, is_cover: true, panel_upload: true },
        });
        if (!row) return "not_found" as const;
        if (!row.panel_upload) return "dataset" as const;
        await tx.inscription.updateMany({ where: { asset_id: assetId, ar_target_media_key: key }, data: { ar_target_media_key: null } });
        await tx.asset_media.deleteMany({ where: { asset_id: assetId, media_key: key } });
        if (row.is_cover) {
          const next = await tx.asset_media.findFirst({ where: { asset_id: assetId }, orderBy: [{ sort_order: "asc" }, { media_key: "asc" }], select: { media_key: true } });
          if (next) await tx.asset_media.updateMany({ where: { asset_id: assetId, media_key: next.media_key }, data: { is_cover: true } });
        }
        if ((await tx.asset_media.count({ where: { media_id: row.media_id } })) > 0) return { fileKeys: [] };
        const variants = await tx.media_variant.findMany({ where: { media_id: row.media_id }, select: { key: true } });
        await tx.media.delete({ where: { id: row.media_id } });
        return { fileKeys: variants.map((v) => v.key) };
      });
    },

    async readRecord(id) {
      const [row, media] = await Promise.all([
        prisma.asset.findUnique({ where: { id }, select: recordSelect }),
        prisma.asset_media.findMany({ where: { asset_id: id }, orderBy: [{ sort_order: "asc" }, { media_key: "asc" }] }),
      ]);
      return row && { ...row, media };
    },

    writeRecord(id, record, { mode, reviewer, preparedBy, sourceJson, todos }) {
      const { waqf_deed, ...columns } = assetColumns(record);
      const deed = waqf_deed ?? Prisma.DbNull;
      return prisma.$transaction(async (tx) => {
        if (mode === "create") {
          const reviewed_by = record.status === "published" ? reviewer : null;
          await tx.asset.create({ data: { id, ...columns, waqf_deed: deed, reviewed_by, prepared_by: preparedBy ?? null, todos: todos ?? [], source_json: sourceJson ?? {} } });
        } else {
          const current = await tx.asset.findUniqueOrThrow({ where: { id }, select: { reviewed_by: true } });
          const reviewed_by = record.status === "published" ? (current.reviewed_by ?? reviewer) : current.reviewed_by;
          await tx.asset.update({ where: { id }, data: { ...columns, waqf_deed: deed, reviewed_by, ...(sourceJson && { source_json: sourceJson }), updated_at: new Date() } });
        }
        await writeLists(tx, id, record);
        return tx.asset.findUniqueOrThrow({ where: { id }, select: panelAssetSelect });
      }, { timeout: 20_000 });
    },

    async deletePanelAsset(id) {
      const { count } = await prisma.asset.deleteMany({ where: { id, ...isPanelAsset } });
      return count > 0;
    },
  };
}

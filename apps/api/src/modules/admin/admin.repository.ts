import type { AdminAssetRecord } from "@vagabonds/contracts";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
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

export interface AdminRepository {
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

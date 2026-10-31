import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
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
  listPanelAssets(): Promise<PanelAssetRecord[]>;
  /** A panel asset's stored record, or null when the id is not a panel asset. */
  findPanelAsset(id: string): Promise<{ source_json: Prisma.JsonValue; created_at: Date } | null>;
  /** Writes the asset row and its one section together. */
  savePanelAsset(
    row: Prisma.assetUncheckedCreateInput,
    section: Prisma.asset_sectionUncheckedCreateInput,
    mode: "create" | "update",
  ): Promise<PanelAssetRecord>;
  deletePanelAsset(id: string): Promise<boolean>;
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

    listPanelAssets() {
      return prisma.asset.findMany({ where: isPanelAsset, orderBy: { created_at: "desc" }, select: panelAssetSelect });
    },

    findPanelAsset(id) {
      return prisma.asset.findFirst({ where: { id, ...isPanelAsset }, select: { source_json: true, created_at: true } });
    },

    savePanelAsset(row, section, mode) {
      return prisma.$transaction(async (tx) => {
        if (mode === "create") {
          await tx.asset.create({ data: row });
        } else {
          const { id, ...fields } = row;
          await tx.asset.update({ where: { id }, data: { ...fields, updated_at: new Date() } });
          await tx.asset_section.deleteMany({ where: { asset_id: id } });
        }
        await tx.asset_section.create({ data: section });
        return tx.asset.findUniqueOrThrow({ where: { id: row.id }, select: panelAssetSelect });
      });
    },

    async deletePanelAsset(id) {
      const { count } = await prisma.asset.deleteMany({ where: { id, ...isPanelAsset } });
      return count > 0;
    },
  };
}

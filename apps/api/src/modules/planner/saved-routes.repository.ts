import { SAVED_ROUTES_KEPT } from "@vagabonds/contracts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

export interface SavedRouteRecord {
  id: string;
  kind: string;
  route: Prisma.JsonValue;
  saved_at: Date;
}

export interface SavedRoutesRepository {
  /** Last saved first. */
  list(userId: string): Promise<SavedRouteRecord[]>;
  /**
   * Keeps a route: one with the same key (the same plan) or id is replaced, and the user's oldest
   * beyond `SAVED_ROUTES_KEPT` are dropped.
   */
  save(userId: string, route: { id: string; key: string; kind: string; body: Prisma.InputJsonValue }): Promise<SavedRouteRecord>;
  /** False when the user has no route with this id. */
  remove(userId: string, id: string): Promise<boolean>;
}

const routeSelect = { id: true, kind: true, route: true, saved_at: true } satisfies Prisma.user_routeSelect;

export function createSavedRoutesRepository(prisma: PrismaClient): SavedRoutesRepository {
  return {
    list: (userId) =>
      prisma.user_route.findMany({ where: { user_id: userId }, orderBy: [{ saved_at: "desc" }, { id: "asc" }], select: routeSelect }),

    save: (userId, { id, key, kind, body }) =>
      prisma.$transaction(async (tx) => {
        await tx.user_route.deleteMany({ where: { user_id: userId, OR: [{ key }, { id }] } });
        const saved = await tx.user_route.create({ data: { user_id: userId, id, key, kind, route: body }, select: routeSelect });
        const old = await tx.user_route.findMany({
          where: { user_id: userId },
          orderBy: [{ saved_at: "desc" }, { id: "asc" }],
          skip: SAVED_ROUTES_KEPT,
          select: { id: true },
        });
        if (old.length > 0) await tx.user_route.deleteMany({ where: { user_id: userId, id: { in: old.map((row) => row.id) } } });
        return saved;
      }),

    async remove(userId, id) {
      return (await prisma.user_route.deleteMany({ where: { user_id: userId, id } })).count > 0;
    },
  };
}

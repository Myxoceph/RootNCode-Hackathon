import type { MonumentsPayload } from "@vagabonds/contracts";
import { monumentTypeToDb, relationTypeToDb, tipStatusToDb } from "./enums.ts";
import type { PrismaClient } from "./prisma.ts";

export interface SeedSummary {
  monuments: number;
  relations: number;
  cityCuisines: number;
}

/**
 * Writes a contract payload into the database.
 *
 * - Idempotent: every row is upserted on a natural key, so it can be re-run safely.
 * - Runs in a single transaction; a failure leaves the database unchanged.
 * - Relations appear on both monuments in the payload; only the outgoing side is stored.
 *
 * Used by the development seed (prisma/seed.ts) and the integration tests.
 */
export async function seedDatabase(prisma: PrismaClient, payload: MonumentsPayload): Promise<SeedSummary> {
  return prisma.$transaction(async (tx) => {
    const idBySlug = new Map<string, string>();

    for (const m of payload.monuments) {
      const data = {
        name: m.name,
        city: m.city,
        monumentType: monumentTypeToDb[m.monumentType],
        latitude: m.latitude,
        longitude: m.longitude,
        period: m.period,
        archivePhotoUrl: m.archivePhotoUrl,
        archiveYear: m.archiveYear,
        markerImageUrl: m.markerImageUrl,
        audioCapsuleUrl: m.audioCapsuleUrl,
        accessibilityAudioDesc: m.accessibilityAudioDesc,
        hasRamp: m.hasRamp,
        stepFreeAccess: m.stepFreeAccess,
      };
      const row = await tx.monument.upsert({
        where: { slug: m.slug },
        create: { id: m.id, slug: m.slug, ...data },
        update: data,
      });
      idBySlug.set(m.slug, row.id);

      for (const i of m.inscriptions) {
        const inscription = {
          transcription: i.transcription,
          modernTurkish: i.modernTurkish,
          waqfCondition: i.waqfCondition,
        };
        await tx.inscription.upsert({
          where: { id: i.id },
          create: { id: i.id, monumentId: row.id, ...inscription },
          update: inscription,
        });
      }

      for (const t of m.visitorTips) {
        const tip = { tipText: t.tipText, status: tipStatusToDb[t.status], createdAt: new Date(t.createdAt) };
        await tx.visitorTip.upsert({
          where: { id: t.id },
          create: { id: t.id, monumentId: row.id, ...tip },
          update: tip,
        });
      }
    }

    let relations = 0;
    for (const m of payload.monuments) {
      for (const r of m.relations.filter((rel) => rel.direction === "outgoing")) {
        const sourceId = idBySlug.get(m.slug);
        const targetId = idBySlug.get(r.relatedMonumentSlug);
        if (!sourceId || !targetId) {
          throw new Error(`Relation ${m.slug} -> ${r.relatedMonumentSlug} references an unknown monument`);
        }
        const relationType = relationTypeToDb[r.relationType];
        await tx.monumentRelation.upsert({
          where: { sourceId_targetId_relationType: { sourceId, targetId, relationType } },
          create: { sourceId, targetId, relationType, note: r.note },
          update: { note: r.note },
        });
        relations++;
      }
    }

    for (const c of payload.cityCuisines) {
      const cuisine = { description: c.description, historicalContext: c.historicalContext };
      await tx.cityCuisine.upsert({
        where: { city_dishName: { city: c.city, dishName: c.dishName } },
        create: { id: c.id, city: c.city, dishName: c.dishName, ...cuisine },
        update: cuisine,
      });
    }

    return { monuments: payload.monuments.length, relations, cityCuisines: payload.cityCuisines.length };
  });
}

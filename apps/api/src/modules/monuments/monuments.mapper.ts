import {
  CityCuisineSchema,
  MonumentSchema,
  type CityCuisine,
  type Monument,
  type MonumentRelationSummary,
} from "@vagabonds/contracts";
import type { ZodError } from "zod";
import { monumentTypeFromDb, relationTypeFromDb, tipStatusFromDb } from "../../db/enums.ts";
import type { CityCuisine as CityCuisineRecord } from "../../generated/prisma/client.ts";
import type { MonumentRecord } from "./monuments.repository.ts";

/**
 * Raised when data read from the database does not satisfy the API contract
 * (e.g. a city outside CitySchema). Surfaces as a 500 so a broken record is
 * never sent to clients; the details are logged by the error handler.
 */
export class ContractViolationError extends Error {
  readonly statusCode = 500;

  constructor(entity: string, error: ZodError) {
    const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    super(`${entity} violates the API contract: ${issues}`);
    this.name = "ContractViolationError";
  }
}

const relationOrder = (a: MonumentRelationSummary, b: MonumentRelationSummary) =>
  a.relationType.localeCompare(b.relationType) ||
  a.direction.localeCompare(b.direction) ||
  a.relatedMonumentSlug.localeCompare(b.relatedMonumentSlug);

/** Database record -> contract `Monument`. Edges are stored once and returned from both ends. */
export function toMonument(record: MonumentRecord): Monument {
  const relations: MonumentRelationSummary[] = [
    ...record.outgoingRelations.map((r) => ({
      relatedMonumentId: r.target.id,
      relatedMonumentSlug: r.target.slug,
      relatedMonumentName: r.target.name,
      relationType: relationTypeFromDb[r.relationType],
      direction: "outgoing" as const,
      note: r.note,
    })),
    ...record.incomingRelations.map((r) => ({
      relatedMonumentId: r.source.id,
      relatedMonumentSlug: r.source.slug,
      relatedMonumentName: r.source.name,
      relationType: relationTypeFromDb[r.relationType],
      direction: "incoming" as const,
      note: r.note,
    })),
  ].sort(relationOrder);

  const result = MonumentSchema.safeParse({
    id: record.id,
    slug: record.slug,
    name: record.name,
    city: record.city,
    monumentType: monumentTypeFromDb[record.monumentType],
    latitude: record.latitude.toNumber(),
    longitude: record.longitude.toNumber(),
    period: record.period,
    archivePhotoUrl: record.archivePhotoUrl,
    archiveYear: record.archiveYear,
    markerImageUrl: record.markerImageUrl,
    audioCapsuleUrl: record.audioCapsuleUrl,
    accessibilityAudioDesc: record.accessibilityAudioDesc,
    hasRamp: record.hasRamp,
    stepFreeAccess: record.stepFreeAccess,
    inscriptions: record.inscriptions.map((i) => ({
      id: i.id,
      transcription: i.transcription,
      modernTurkish: i.modernTurkish,
      waqfCondition: i.waqfCondition,
    })),
    relations,
    visitorTips: record.visitorTips.map((t) => ({
      id: t.id,
      tipText: t.tipText,
      status: tipStatusFromDb[t.status],
      createdAt: t.createdAt.toISOString(),
    })),
  });

  if (!result.success) throw new ContractViolationError(`Monument "${record.slug}"`, result.error);
  return result.data;
}

export function toCityCuisine(record: CityCuisineRecord): CityCuisine {
  const result = CityCuisineSchema.safeParse({
    id: record.id,
    city: record.city,
    dishName: record.dishName,
    description: record.description,
    historicalContext: record.historicalContext,
  });

  if (!result.success) throw new ContractViolationError(`City cuisine "${record.dishName}"`, result.error);
  return result.data;
}

import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.ts";
import {
  ContractViolationError,
  toCityCuisine,
  toMonument,
} from "../src/modules/monuments/monuments.mapper.ts";
import type { MonumentRecord } from "../src/modules/monuments/monuments.repository.ts";

const SELIMIYE_ID = "3f2a9c1e-7b4d-4e8a-9c1f-0a1b2c3d4e02";
const SULEYMANIYE = { id: "3f2a9c1e-7b4d-4e8a-9c1f-0a1b2c3d4e01", slug: "suleymaniye-camii", name: "Süleymaniye Camii" };
const ARASTA = { id: "3f2a9c1e-7b4d-4e8a-9c1f-0a1b2c3d4e03", slug: "selimiye-arastasi", name: "Selimiye Arastası" };

function selimiyeRecord(overrides: Partial<MonumentRecord> = {}): MonumentRecord {
  return {
    id: SELIMIYE_ID,
    slug: "selimiye-camii",
    name: "Selimiye Camii",
    city: "Edirne",
    monumentType: "MOSQUE",
    latitude: new Prisma.Decimal("41.677778"),
    longitude: new Prisma.Decimal("26.559444"),
    period: "Klasik Osmanlı (16. yüzyıl)",
    archivePhotoUrl: "https://assets.example.com/archive/selimiye-camii-1900.jpg",
    archiveYear: 1900,
    markerImageUrl: null,
    audioCapsuleUrl: null,
    accessibilityAudioDesc: "Tek kubbeli cami.",
    hasRamp: true,
    stepFreeAccess: true,
    createdAt: new Date("2026-10-12T00:00:00Z"),
    updatedAt: new Date("2026-10-12T00:00:00Z"),
    inscriptions: [
      {
        id: "8b1d4f2a-6c3e-4a7b-8d9e-1f2a3b4c5d02",
        monumentId: SELIMIYE_ID,
        transcription: "transkripsiyon",
        modernTurkish: "meal",
        waqfCondition: null,
      },
    ],
    visitorTips: [
      {
        id: "c4e7a1b2-9d3f-4c5e-a6b7-2c3d4e5f6a03",
        monumentId: SELIMIYE_ID,
        tipText: "Kubbeye bakın.",
        status: "APPROVED",
        createdAt: new Date("2026-10-03T11:10:00Z"),
      },
    ],
    outgoingRelations: [],
    incomingRelations: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        sourceId: ARASTA.id,
        targetId: SELIMIYE_ID,
        relationType: "SAME_WAQF",
        note: null,
        source: ARASTA,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        sourceId: SULEYMANIYE.id,
        targetId: SELIMIYE_ID,
        relationType: "ARCHITECT",
        note: "Mimar Sinan",
        source: SULEYMANIYE,
      },
    ],
    ...overrides,
  };
}

describe("toMonument", () => {
  it("converts database types to the contract shape", () => {
    const monument = toMonument(selimiyeRecord());

    expect(monument.latitude).toBe(41.677778);
    expect(monument.longitude).toBe(26.559444);
    expect(monument.monumentType).toBe("mosque");
    expect(monument.visitorTips).toEqual([
      {
        id: "c4e7a1b2-9d3f-4c5e-a6b7-2c3d4e5f6a03",
        tipText: "Kubbeye bakın.",
        status: "approved",
        createdAt: "2026-10-03T11:10:00.000Z",
      },
    ]);
    expect(monument).not.toHaveProperty("createdAt");
  });

  it("returns stored edges from the monument's point of view, in a stable order", () => {
    const monument = toMonument(
      selimiyeRecord({
        outgoingRelations: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            sourceId: SELIMIYE_ID,
            targetId: ARASTA.id,
            relationType: "REVENUE",
            note: null,
            target: ARASTA,
          },
        ],
      }),
    );

    expect(monument.relations.map((r) => [r.relationType, r.direction, r.relatedMonumentSlug])).toEqual([
      ["architect", "incoming", "suleymaniye-camii"],
      ["revenue", "outgoing", "selimiye-arastasi"],
      ["same_waqf", "incoming", "selimiye-arastasi"],
    ]);
    expect(monument.relations[0]).toEqual({
      relatedMonumentId: SULEYMANIYE.id,
      relatedMonumentSlug: SULEYMANIYE.slug,
      relatedMonumentName: SULEYMANIYE.name,
      relationType: "architect",
      direction: "incoming",
      note: "Mimar Sinan",
    });
  });

  it("refuses records that violate the contract", () => {
    const record = selimiyeRecord({ city: "Istanbul" });

    expect(() => toMonument(record)).toThrow(ContractViolationError);
    expect(() => toMonument(record)).toThrow(/Monument "selimiye-camii" violates the API contract: city/);
  });
});

describe("toCityCuisine", () => {
  it("maps a cuisine record", () => {
    const record = {
      id: "e9a2b3c4-5d6e-4f7a-8b9c-3d4e5f6a7b02",
      city: "Edirne",
      dishName: "Tava Ciğer",
      description: "Kızartılmış ciğer.",
      historicalContext: "Esnaf lezzeti.",
    };

    expect(toCityCuisine(record)).toEqual(record);
  });
});

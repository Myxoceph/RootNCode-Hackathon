/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the imported dataset, including
 * data/sehirler. Every response is also parsed with the shared contract.
 */
import "dotenv/config";
import { CityDishesResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("gastronomy routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function get(url: string, status = 200) {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode, response.body).toBe(status);
    return response;
  }

  it("lists a city's dishes in order, each with its registration and source", async () => {
    const body = CityDishesResponseSchema.parse((await get("/cities/bursa/dishes")).json());
    expect(body.city).toEqual({ code: "bursa", label: "Bursa" });
    expect(body.dishes.length).toBeGreaterThan(5);
    const kofte = body.dishes.find((d) => d.id === "bursa-pideli-kofte");
    expect(kofte).toMatchObject({
      name: "Bursa Pideli Köfte",
      kind: { code: "main", label: "Ana yemek" },
      district: null,
      geographicalIndication: {
        type: { code: "mahrec", label: "Mahreç işareti" },
        registrationNumber: "930",
        registeredOn: "2021-10-25",
        registrant: "Bursa Ticaret Borsası",
        portalUrl: "https://ci.turkpatent.gov.tr/cografi-isaretler/detay/2405",
      },
      confidence: { code: "certain" },
    });
    expect(kofte?.sources[0]).toMatchObject({ sourceId: "turkpatent-ci", url: kofte?.geographicalIndication.documentUrl });
    expect(body.dishes.find((d) => d.id === "bursa-inegol-sutlu-kadayifi")?.district).toBe("İnegöl");
  });

  it("answers in English", async () => {
    const response = await get("/cities/hatay/dishes?lang=en");
    expect(response.headers["content-language"]).toBe("en");
    const body = CityDishesResponseSchema.parse(response.json());
    expect(body.dishes.find((d) => d.id === "hatay-antakya-kunefesi")).toMatchObject({
      name: "Antakya Künefe",
      kind: { code: "dessert", label: "Dessert" },
    });
  });

  it("returns an empty list for a city without dishes and 404 for an unknown city", async () => {
    const empty = CityDishesResponseSchema.parse((await get("/cities/konya/dishes")).json());
    expect(empty.dishes).toEqual([]);
    expect((await get("/cities/atlantis/dishes", 404)).json().error.code).toBe("CITY_NOT_FOUND");
    expect((await get("/cities/Bursa1/dishes", 400)).json().error.code).toBe("INVALID_QUERY");
  });
});

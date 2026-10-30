import type { AdminAssetInputSchema } from "@vagabonds/contracts";
import type { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.ts";
import { toIdFragment } from "../assets/assets.repository.ts";

/**
 * An asset added from the admin panel, in the dataset's own shape.
 *
 * The record is kept in `asset.source_json` exactly as a `data/eserler` file would be,
 * so it can be exported into the dataset later; the table columns the API reads are
 * filled from the same values. `prepared_by` marks it as a panel asset, which is what
 * lets the panel edit it: dataset assets are rebuilt by every import.
 */

export type PanelAssetInput = z.output<typeof AdminAssetInputSchema>;

export const PANEL_PREFIX = "admin:";
const SECTION_SLUG = "tanitim";
const TODO = "Panelden eklendi: kaynak, fotoğraf ve erişilebilirlik bilgisi eklenmeli.";

/** `<city>-<district>-<name>`, as dataset ids are written. */
export function panelAssetId(input: Pick<PanelAssetInput, "city" | "district" | "name">): string {
  return [input.city, toIdFragment(input.district), toIdFragment(input.name.tr)].filter(Boolean).join("-");
}

const i18n = (text: { tr: string; en?: string | null | undefined }) => ({ tr: text.tr, en: text.en ?? null });

/** The record as a `data/eserler/<city>/<district>/<id>.json` file. */
export function panelAssetJson(
  id: string,
  input: PanelAssetInput,
  { region, username, createdAt, today }: { region: string; username: string; createdAt: string; today: string },
): Prisma.InputJsonObject {
  return {
    schema_version: "1.0",
    id,
    meta: {
      status: input.status,
      created_at: createdAt,
      updated_at: today,
      prepared_by: `${PANEL_PREFIX}${username}`,
      reviewed_by: input.status === "published" ? username : null,
      from: "Yönetim paneli",
      todos: [TODO],
    },
    name: i18n(input.name),
    type: input.type,
    era: input.era ?? null,
    location: {
      region,
      city: input.city,
      district: input.district,
      neighborhood: null,
      address: input.address ?? null,
      ...(input.coordinates && { coordinates: { ...input.coordinates, source: "manual", verified: false } }),
    },
    summary: i18n(input.summary),
    dating: input.dating ? { display: i18n(input.dating), confidence: "certain" } : null,
    founder: input.founder ? { name: input.founder, confidence: "certain" } : null,
    sections: [
      {
        id: SECTION_SLUG,
        order: 1,
        title: { tr: "Tanıtım", en: "Introduction" },
        body: i18n(input.description),
        confidence: "certain",
        source_refs: [],
      },
    ],
    media: [],
  };
}

/** The `asset` columns the API reads, from the same input. */
export function panelAssetRow(
  id: string,
  input: PanelAssetInput,
  json: Prisma.InputJsonObject,
  username: string,
): Prisma.assetUncheckedCreateInput {
  return {
    id,
    status: input.status,
    type_code: input.type,
    era_code: input.era ?? null,
    name_tr: input.name.tr,
    name_en: input.name.en ?? null,
    summary_tr: input.summary.tr,
    summary_en: input.summary.en ?? null,
    city_code: input.city,
    district: input.district,
    address: input.address ?? null,
    lat: input.coordinates?.lat ?? null,
    lng: input.coordinates?.lng ?? null,
    coord_source: input.coordinates ? "manual" : null,
    coord_verified: false,
    dating_display_tr: input.dating?.tr ?? null,
    dating_display_en: input.dating?.en ?? null,
    dating_confidence: input.dating ? "certain" : null,
    founder_name: input.founder ?? null,
    founder_confidence: input.founder ? "certain" : null,
    prepared_by: `${PANEL_PREFIX}${username}`,
    reviewed_by: input.status === "published" ? username : null,
    todos: [TODO],
    source_json: json,
  };
}

export function panelAssetSection(id: string, input: PanelAssetInput): Prisma.asset_sectionUncheckedCreateInput {
  return {
    asset_id: id,
    slug: SECTION_SLUG,
    sort_order: 1,
    title_tr: "Tanıtım",
    title_en: "Introduction",
    body_tr: input.description.tr,
    body_en: input.description.en ?? null,
    confidence: "certain",
  };
}

/** The panel input an existing record was made from, so a PATCH can be applied on top of it. */
export function panelAssetInputOf(json: Prisma.JsonValue): PanelAssetInput {
  const r = json as Record<string, any>;
  const section = (r["sections"] as Array<Record<string, any>>)[0]!;
  return {
    name: r["name"],
    type: r["type"],
    city: r["location"]["city"],
    district: r["location"]["district"],
    era: r["era"] ?? null,
    summary: r["summary"],
    description: section["body"],
    dating: r["dating"]?.["display"] ?? null,
    founder: r["founder"]?.["name"] ?? null,
    address: r["location"]["address"] ?? null,
    coordinates: r["location"]["coordinates"]
      ? { lat: r["location"]["coordinates"]["lat"], lng: r["location"]["coordinates"]["lng"] }
      : null,
    status: r["meta"]["status"],
  };
}

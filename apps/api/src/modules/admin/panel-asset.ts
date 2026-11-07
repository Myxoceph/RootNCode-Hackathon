import type { AdminAssetInputSchema, AdminAssetPatchSchema, AdminAssetRecord } from "@vagabonds/contracts";
import type { z } from "zod";
import { toIdFragment } from "../assets/assets.repository.ts";

/**
 * An asset added from the admin panel. It is written like any other asset (see `asset-record.ts`)
 * and its record is kept in `asset.source_json` as a `data/eserler` file would be, so it can be
 * exported into the dataset later. `prepared_by` starting with `admin:` marks it as a panel asset.
 */

export type PanelAssetInput = z.output<typeof AdminAssetInputSchema>;
export type PanelAssetPatch = z.output<typeof AdminAssetPatchSchema>;

export const PANEL_PREFIX = "admin:";
export const PANEL_TODO = "Panelden eklendi: kaynak, fotoğraf ve erişilebilirlik bilgisi eklenmeli.";
const SECTION = { id: "tanitim", title: { tr: "Tanıtım", en: "Introduction" } };

/** `<city>-<district>-<name>`, as dataset ids are written. */
export function panelAssetId(input: { city: string; district: string; name: { tr: string } }): string {
  return [input.city, toIdFragment(input.district), toIdFragment(input.name.tr)].filter(Boolean).join("-");
}

const i18n = (text: { tr: string; en?: string | null | undefined }) => ({ tr: text.tr, en: text.en ?? null });

/** A record with nothing in it yet but what the short form asks. */
export function recordFromInput(input: PanelAssetInput): AdminAssetRecord {
  return {
    status: input.status,
    name: i18n(input.name),
    subtitle: null,
    type: input.type,
    secondaryTypes: [],
    era: input.era ?? null,
    parentId: null,
    tags: [],
    alternateNames: [],
    city: input.city,
    district: input.district,
    neighborhood: null,
    address: input.address ?? null,
    coordinates: input.coordinates ?? null,
    summary: i18n(input.summary),
    dating: { display: input.dating ? i18n(input.dating) : null, startYear: null, endYear: null, hijriYear: null, century: null, basis: null, confidence: input.dating ? "certain" : null },
    founder: { name: input.founder ?? null, role: null, confidence: input.founder ? "certain" : null },
    architect: { name: null, candidates: [], confidence: null },
    waqf: { name: null, deedDate: null, deedExcerpt: null, conditions: null, landNote: null, confidence: null },
    customBlocks: [],
    sections: [{ ...SECTION, body: i18n(input.description), confidence: "certain" }],
    highlights: [],
    timeline: [],
    facts: [],
    legends: [],
    people: [],
    inscriptions: [],
    visit: { setting: null, durationMin: null, entranceFee: null, notes: null },
    tips: [],
    accessibility: { wheelchair: "unknown", stepFree: "unknown", ramp: "unknown", toilet: "unknown", verified: false, notes: null, audioDescription: null },
    ambientSound: { key: null, caption: null },
    media: [],
  };
}

/** The short form's changes on top of a whole record; `description` is the first section's text. */
export function applyPatch(record: AdminAssetRecord, patch: PanelAssetPatch): AdminAssetRecord {
  const next = { ...record };
  if (patch.name) next.name = i18n(patch.name);
  if (patch.type) next.type = patch.type;
  if (patch.city) next.city = patch.city;
  if (patch.district) next.district = patch.district;
  if (patch.era !== undefined) next.era = patch.era;
  if (patch.summary) next.summary = { tr: patch.summary.tr, en: patch.summary.en ?? record.summary.en };
  if (patch.description) {
    const [first, ...rest] = record.sections;
    next.sections = first
      ? [{ ...first, body: { tr: patch.description.tr, en: patch.description.en ?? first.body.en } }, ...rest]
      : [{ ...SECTION, body: i18n(patch.description), confidence: "certain" }];
  }
  if (patch.dating !== undefined) next.dating = { ...record.dating, display: patch.dating ? i18n(patch.dating) : null };
  if (patch.founder !== undefined) next.founder = { ...record.founder, name: patch.founder };
  if (patch.address !== undefined) next.address = patch.address;
  if (patch.coordinates !== undefined) next.coordinates = patch.coordinates;
  if (patch.status) next.status = patch.status;
  return next;
}

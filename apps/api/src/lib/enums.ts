import { readFileSync } from "node:fs";
import {
  AccessibilityStatusSchema,
  ConfidenceCodeSchema,
  MediaKindSchema,
  type Confidence,
  type Lang,
} from "@vagabonds/contracts";
import { z } from "zod";

const LabelSchema = z.object({ tr: z.string().min(1), en: z.string().min(1).optional() });

const EnumsFileSchema = z.object({
  confidence: z.array(z.object({ code: ConfidenceCodeSchema, label: LabelSchema })),
  accessibility_status: z.array(z.object({ code: AccessibilityStatusSchema, label: LabelSchema })),
  media_types: z.array(z.object({ code: MediaKindSchema, label: LabelSchema })),
});

/**
 * Code lists from data/enums.json, the data team's single source for labels.
 * Lookup tables in PostgreSQL (city, asset_type, era…) carry their own labels;
 * confidence, accessibility status and media kinds have no table, so theirs come from here.
 */
const enums = EnumsFileSchema.parse(
  JSON.parse(readFileSync(new URL("../../../../data/enums.json", import.meta.url), "utf8")),
);

type Label = z.infer<typeof LabelSchema>;

const labelIn = (label: Label, lang: Lang) => (lang === "en" ? label.en : undefined) ?? label.tr;

/** The file-only code lists in data/enums.json order, labelled in `lang`. */
export function enumLabels(lang: Lang) {
  const labelled = <Code extends string>(items: { code: Code; label: Label }[]) =>
    items.map(({ code, label }) => ({ code, label: labelIn(label, lang) }));
  return {
    confidence: labelled(enums.confidence),
    accessibilityStatus: labelled(enums.accessibility_status),
    mediaKinds: labelled(enums.media_types),
  };
}

const confidenceLabels = new Map(enums.confidence.map((c) => [c.code, c.label]));

/** Confidence code with its label, or null when the dataset has no confidence for this item. */
export function toConfidence(code: string | null | undefined, lang: Lang): Confidence | null {
  if (code === null || code === undefined) return null;
  const parsed = ConfidenceCodeSchema.parse(code);
  const label = confidenceLabels.get(parsed);
  if (!label) throw new Error(`data/enums.json has no confidence label for "${parsed}"`);
  return { code: parsed, label: labelIn(label, lang) };
}

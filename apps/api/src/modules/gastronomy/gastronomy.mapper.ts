import { DishKindSchema, type CityDish, type DishKind, type Lang } from "@vagabonds/contracts";
import { pick } from "../../lib/lang.ts";
import { requiredConfidence } from "../assets/assets.mapper.ts";
import type { DishRecord } from "./gastronomy.repository.ts";

const REGISTRY_PORTAL = "https://ci.turkpatent.gov.tr/cografi-isaretler/detay";

const KIND_LABEL: Record<DishKind, Record<Lang, string>> = {
  main: { tr: "Ana yemek", en: "Main dish" },
  meze: { tr: "Meze", en: "Meze" },
  dessert: { tr: "Tatlı", en: "Dessert" },
  street: { tr: "Fırın ve sokak lezzeti", en: "Bakery and street food" },
};

const GI_TYPE_LABEL: Record<string, Record<Lang, string>> = {
  mense: { tr: "Menşe adı", en: "Designation of origin" },
  mahrec: { tr: "Mahreç işareti", en: "Geographical indication" },
};

export function toCityDish(record: DishRecord, lang: Lang): CityDish {
  const kind = DishKindSchema.parse(record.kind);
  const giType = GI_TYPE_LABEL[record.gi_type];
  if (!giType) throw new Error(`Unknown geographical indication type "${record.gi_type}" for ${record.id}`);
  return {
    id: record.id,
    name: pick(record.name_tr, record.name_en, lang),
    kind: { code: kind, label: KIND_LABEL[kind][lang] },
    description: pick(record.description_tr, record.description_en, lang),
    story: record.story_tr === null ? null : pick(record.story_tr, record.story_en, lang),
    district: record.district,
    geographicalIndication: {
      type: { code: record.gi_type, label: giType[lang] },
      registrationNumber: record.gi_registration_number,
      registeredOn: record.gi_registered_on.toISOString().slice(0, 10),
      registrant: record.gi_registrant,
      documentUrl: record.gi_document_url,
      portalUrl: `${REGISTRY_PORTAL}/${record.gi_portal_id}`,
    },
    sources: [
      {
        sourceId: record.source.id,
        title: pick(record.source.title_tr, record.source.title_en, lang),
        pages: null,
        url: record.source_url,
      },
    ],
    confidence: requiredConfidence(record.confidence, lang),
  };
}

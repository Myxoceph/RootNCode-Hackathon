import type { AssetDetail, SourceRef } from "@vagabonds/contracts";

import { DataError, type ResourceWithRetry } from "@/data";
import { transliterationLanguage } from "@/lib/language";

import { featuredInscription } from "./inscription-targets";
import { getMessages } from "@/i18n";

/** One inscription as Taşın Dili shows it, on the camera card and in the reading mode alike. */
export interface InscriptionText {
  /** The asset's and the inscription's ids, "bursa-osmangazi-ulucami/k1": one per inscription. */
  id: string;
  /** The asset alone: "Ulucami". */
  name: string;
  /** Where on it the inscription is, or null: "Minber kapısının üzerinde, ahşap oyma". */
  location: string | null;
  /** "H. 802 / 1399-1400", or null when the record has no date. */
  date: string | null;
  translation: string | null;
  transliteration: string | null;
  /** BCP 47 tag of `transliteration`. */
  transliterationLanguage: string | undefined;
  waqfName: string | null;
  waqfConditions: string | null;
  sources: SourceRef[];
  /** What "Sesli oku" says. */
  readAloud: string;
}

export function inscriptionText(asset: AssetDetail, inscriptionId: string): InscriptionText | null {
  const inscription = asset.inscriptions.find((item) => item.id === inscriptionId);
  if (!inscription) return null;
  const waqfConditions = asset.waqf?.conditions ?? null;
  const w = getMessages().reading;
  return {
    id: `${asset.id}/${inscription.id}`,
    name: asset.name,
    location: inscription.location ?? null,
    date: [inscription.hijriYear && w.hijri(inscription.hijriYear), inscription.gregorian].filter(Boolean).join(" / ") || null,
    translation: inscription.translation,
    transliteration: inscription.transliteration,
    transliterationLanguage: transliterationLanguage(inscription.language),
    waqfName: asset.waqf?.name ?? null,
    waqfConditions,
    sources: inscription.sources,
    readAloud: w.aloud(asset.name, inscription.translation, waqfConditions),
  };
}

/** One inscription of the loaded asset; `inscriptionId` null for the featured one (`featuredInscription`). */
export function inscriptionOf(
  asset: ResourceWithRetry<AssetDetail | null>,
  inscriptionId: string | null,
): ResourceWithRetry<InscriptionText> {
  if (asset.status !== "success") return asset;
  const id = inscriptionId ?? (asset.data && featuredInscription(asset.data)?.id);
  const text = asset.data && id ? inscriptionText(asset.data, id) : null;
  if (!text) {
    const error = new DataError("invalid", getMessages().reading.notFound, [`${asset.data?.id ?? "?"} / ${id ?? "?"}`]);
    return { status: "error", error, retry: asset.retry };
  }
  return { status: "success", data: text, retry: asset.retry };
}

/** The asset and where on it the inscription is: "Ulucami · Minber kapısının üzerinde, ahşap oyma". */
export const inscriptionPlace = (text: InscriptionText) => [text.name, text.location].filter(Boolean).join(" · ");

const READ_ALOUD = "inscription:";
/** The key "Sesli oku" reads an inscription under, on the camera card and in the reading mode alike. */
export const readAloudKey = (text: InscriptionText) => `${READ_ALOUD}${text.id}`;
/** Whether a reading is one of Taşın Dili's. */
export const isInscriptionReading = (key: string) => key.startsWith(READ_ALOUD);

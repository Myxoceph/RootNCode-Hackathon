import type { AssetDetail, SourceRef } from "@vagabonds/contracts";

import { DataError, type ResourceWithRetry } from "@/data";
import { transliterationLanguage } from "@/lib/language";

import { featuredInscription } from "./inscription-targets";

/** One inscription as Taşın Dili shows it, on the camera card and in the reading mode alike. */
export interface InscriptionText {
  /** The asset and where on it the inscription is: "Ulucami · Minber kapısının üzerinde, ahşap oyma". */
  place: string;
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
  return {
    place: [asset.name, inscription.location].filter(Boolean).join(" · "),
    name: asset.name,
    location: inscription.location ?? null,
    date: [inscription.hijriYear && `H. ${inscription.hijriYear}`, inscription.gregorian].filter(Boolean).join(" / ") || null,
    translation: inscription.translation,
    transliteration: inscription.transliteration,
    transliterationLanguage: transliterationLanguage(inscription.language),
    waqfName: asset.waqf?.name ?? null,
    waqfConditions,
    sources: inscription.sources,
    readAloud: [`${asset.name} kitabesi.`, inscription.translation, waqfConditions && `Vakfiyenin şartı: ${waqfConditions}`]
      .filter(Boolean)
      .join(" "),
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
    const error = new DataError("invalid", "Bu kitabenin kaydı bulunamadı.", [`${asset.data?.id ?? "?"} / ${id ?? "?"}`]);
    return { status: "error", error, retry: asset.retry };
  }
  return { status: "success", data: text, retry: asset.retry };
}

/** The key "Sesli oku" reads an inscription under, on the camera card and in the reading mode alike. */
export const readAloudKey = (text: InscriptionText) => `inscription:${text.place}`;

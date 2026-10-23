import type { AssetDetail, SourceRef } from "@vagabonds/contracts";

import { DataError, useAsset, type ResourceWithRetry } from "@/data";
import { transliterationLanguage } from "@/lib/language";

import type { InscriptionTarget } from "./inscription-targets";

/** One inscription as Taşın Dili shows it, on the camera card and in the reading mode alike. */
export interface InscriptionText {
  /** The asset and where on it the inscription is: "Ulucami · Minber kapısının üzerinde, ahşap oyma". */
  place: string;
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

/** The target's inscription, read from its asset's record. */
export function useInscription(target: InscriptionTarget): ResourceWithRetry<InscriptionText> {
  const asset = useAsset(target.assetId);
  if (asset.status !== "success") return asset;
  const text = asset.data && inscriptionText(asset.data, target.inscriptionId);
  if (!text) {
    const error = new DataError("invalid", "Bu kitabenin kaydı bulunamadı.", [`${target.assetId} / ${target.inscriptionId}`]);
    return { status: "error", error, retry: asset.retry };
  }
  return { status: "success", data: text, retry: asset.retry };
}

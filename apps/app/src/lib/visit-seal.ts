import { pickSealPhoto, type AssetDetail, type Lang, type Media } from "@vagabonds/contracts";

import { messages } from "@/i18n/messages";

export interface VisitSealTarget {
  photo: Media;
  /** What the photo shows, e.g. "Taçkapı". */
  part: string;
}

/**
 * The part of the monument the visitor shows the camera for Ziyaret Mührü: the photo of its most
 * telling detail, by the dataset's `subject`, and of several such photos the sharpest
 * (`pickSealPhoto`, shared with the data pipeline that compiles it ahead). `null` when the asset
 * has no photo to use.
 */
export function visitSealTarget(asset: AssetDetail, lang: Lang): VisitSealTarget | null {
  const picked = pickSealPhoto(asset.media);
  if (!picked) return null;
  const parts = messages[lang].seal.parts;
  return { photo: picked.photo, part: picked.subject ? parts[picked.subject] : parts.general };
}

import type { AssetDetail, Media } from "@vagabonds/contracts";

/**
 * The parts of a monument that can carry its seal, best first, with their names. A seal needs a
 * specific part, one a visitor has to walk up to and frame; a view of the whole building would be
 * recognised from across the square, or from a postcard.
 */
const SEAL_PARTS: ReadonlyArray<[subject: string, name: string]> = [
  ["portal", "Taçkapı"],
  ["inscription", "Kitabe"],
  ["ornament_detail", "Süsleme detayı"],
  ["fountain", "Çeşme"],
  ["mihrab", "Mihrap"],
  ["minber", "Minber"],
  ["window", "Pencere"],
  ["engraving", "Oyma"],
];

export interface VisitSealTarget {
  photo: Media;
  /** What the photo shows, e.g. "Taçkapı". */
  part: string;
}

/**
 * The part of the monument the visitor shows the camera for Ziyaret Mührü: the photo of its most
 * telling detail, by the dataset's `subject`. `null` when the asset has no such photo yet.
 */
export function visitSealTarget(asset: AssetDetail): VisitSealTarget | null {
  for (const [subject, part] of SEAL_PARTS) {
    const photo = asset.media.find((m) => m.kind === "photo" && m.subject === subject);
    if (photo) return { photo, part };
  }
  return null;
}

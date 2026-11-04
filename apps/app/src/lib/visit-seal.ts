import type { AssetDetail, Media } from "@vagabonds/contracts";

/**
 * The parts of a monument that can carry its seal, best first, with their names. A specific part is
 * best: one a visitor has to walk up to and frame. A view of the building comes after them, for the
 * many monuments whose photos show no such part; the cover photo is last, when no photo says what it
 * shows (book photos not yet sorted), as it is most often the building from outside.
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
  ["interior", "İç mekân"],
  ["portico", "Revak"],
  ["courtyard", "Avlu"],
  ["exterior", "Dış cephe"],
  ["minaret", "Minare"],
  ["dome", "Kubbe"],
  ["tomb", "Türbe"],
  ["sadirvan", "Şadırvan"],
];
/** Photos nobody has sorted yet; one from above (`aerial`) cannot be framed on the spot and is never used. */
const UNSORTED = new Set<string | null>(["photo", "other", null]);

export interface VisitSealTarget {
  photo: Media;
  /** What the photo shows, e.g. "Taçkapı". */
  part: string;
}

/** The photo with the most pixels: the camera has the most detail to recognise in it. The first on a tie. */
function sharpest(photos: Media[]): Media | undefined {
  return photos.reduce<Media | undefined>((best, m) => (!best || m.width * m.height > best.width * best.height ? m : best), undefined);
}

/**
 * The part of the monument the visitor shows the camera for Ziyaret Mührü: the photo of its most
 * telling detail, by the dataset's `subject`, and of several such photos the sharpest. `null` when
 * the asset has no photo to use.
 */
export function visitSealTarget(asset: AssetDetail): VisitSealTarget | null {
  for (const [subject, part] of SEAL_PARTS) {
    const photo = sharpest(asset.media.filter((m) => m.kind === "photo" && m.subject === subject));
    if (photo) return { photo, part };
  }
  const photos = asset.media.filter((m) => m.kind === "photo" && UNSORTED.has(m.subject));
  const cover = photos.find((m) => m.isCover) ?? photos[0];
  return cover ? { photo: cover, part: "Genel görünüm" } : null;
}

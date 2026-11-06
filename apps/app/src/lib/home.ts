import type { AssetSummary, Lang } from "@vagabonds/contracts";


/** Records whose cover is cut out on black, which looks broken at this size. */
const NOT_FOR_SHOWCASE = new Set(["konya-selcuklu-sultan-alaeddin-ulu-camii"]);

const byProminence = (a: AssetSummary, b: AssetSummary) => b.prominence - a.prominence || a.id.localeCompare(b.id);

/** The best-known assets with a photo, most prominent first; a complex's buildings stand behind the complex. */
export function showcaseAssets(assets: readonly AssetSummary[]): AssetSummary[] {
  return assets.filter((asset) => asset.cover && !asset.parentId && !NOT_FOR_SHOWCASE.has(asset.id)).sort(byProminence);
}

const ROMAN: Array<[number, string]> = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

function toRoman(value: number): string {
  let rest = value;
  let out = "";
  for (const [size, mark] of ROMAN) {
    while (rest >= size) {
      out += mark;
      rest -= size;
    }
  }
  return out;
}

/** The century a card's year stands in: "1399" is the 14th, "XV. yüzyıl" and "15th century" the 15th; null with no year. */
export function centuryOf(yearLabel: string | null): number | null {
  if (!yearLabel) return null;
  if (/^\d{3,4}$/.test(yearLabel)) return Math.floor((Number(yearLabel) - 1) / 100) + 1;
  const english = yearLabel.match(/^(\d{1,2})(?:st|nd|rd|th) century$/i)?.[1];
  if (english) return Number(english);
  const roman = yearLabel.match(/^([IVX]+)\./)?.[1];
  if (!roman) return null;
  for (let century = 1; century <= 30; century++) if (toRoman(century) === roman) return century;
  return null;
}

export interface Century {
  number: number;
  /** "XV". */
  roman: string;
  /** "1400'ler"; in English, "1400s". */
  decades: string;
  /** Most prominent first. */
  assets: AssetSummary[];
}

/** The centuries assets were built in, oldest first; assets with no known year are left out. */
export function centuriesOf(assets: readonly AssetSummary[], lang: Lang): Century[] {
  const byCentury = new Map<number, AssetSummary[]>();
  for (const asset of showcaseAssets(assets)) {
    const century = centuryOf(asset.yearLabel);
    if (century !== null) byCentury.set(century, [...(byCentury.get(century) ?? []), asset]);
  }
  return [...byCentury.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, items]) => ({ number, roman: toRoman(number), decades: lang === "en" ? `${(number - 1) * 100}s` : `${(number - 1) * 100}'ler`, assets: items }));
}

/** The century the journey opens on: the one with the best-known asset. */
export function firstCentury(centuries: readonly Century[]): Century | null {
  return centuries.reduce<Century | null>((best, century) => ((century.assets[0]?.prominence ?? 0) > (best?.assets[0]?.prominence ?? -1) ? century : best), null);
}

/** Which of the strip's centuries is under a finger: each has an equal share, whatever its photo's width just now. */
export function stripIndexAt(x: number, width: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}

import type { AssetSummary } from "@vagabonds/contracts";

import type { CityOption } from "@/data/source";

/** Lower case without Turkish marks, so "ulu cami", "ULUCAMİ" and "ulucamı" all find Ulucami. */
export function foldTurkish(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (letter) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[letter] ?? letter)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchResults {
  cities: CityOption[];
  assets: AssetSummary[];
}

const MAX_ASSETS = 8;

/**
 * How well a name answers the query: from the start of the name best, then from the start of
 * one of its words, then anywhere in it; also with the spaces left out ("ulu cami" → Ulucami).
 * 0 when it does not.
 */
function nameScore(name: string, query: string): number {
  const folded = foldTurkish(name);
  if (folded.startsWith(query)) return 4;
  if (folded.split(" ").some((word) => word.startsWith(query))) return 3;
  if (folded.includes(query)) return 2;
  if (folded.replace(/ /g, "").includes(query.replace(/ /g, ""))) return 2;
  return 0;
}

/**
 * Cities and assets for what was typed. Assets match on their name first, then on their type,
 * district or city ("hamam", "osmangazi"); the better match and the better-known asset come first.
 * With `inCity`, only that city's assets, and no cities.
 */
export function searchAssets(text: string, assets: AssetSummary[], cities: CityOption[], inCity?: string): SearchResults {
  const query = foldTurkish(text);
  if (query.length === 0) return { cities: [], assets: [] };

  const foundCities = inCity ? [] : cities.filter((city) => city.assetCount > 0 && nameScore(city.label, query) > 0);
  const foundAssets = assets
    .filter((asset) => !inCity || asset.city.code === inCity)
    .map((asset) => {
      const byName = nameScore(asset.name, query);
      const byPlace = Math.max(nameScore(asset.type.label, query), nameScore(asset.district, query), inCity ? 0 : nameScore(asset.city.label, query));
      return { asset, score: byName > 0 ? byName + 2 : byPlace > 0 ? 1 : 0 };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.asset.prominence - a.asset.prominence || a.asset.name.localeCompare(b.asset.name, "tr"))
    .slice(0, MAX_ASSETS)
    .map(({ asset }) => asset);

  return { cities: foundCities, assets: foundAssets };
}

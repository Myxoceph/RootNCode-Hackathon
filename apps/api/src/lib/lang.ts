import type { Lang } from "@vagabonds/contracts";

/**
 * Picks the response language: an explicit `?lang=` wins, then the best
 * supported match in `Accept-Language` (by q-value, then order), then Turkish.
 */
export function resolveLang(queryLang: Lang | undefined, acceptLanguage: string | undefined): Lang {
  if (queryLang) return queryLang;
  if (!acceptLanguage) return "tr";

  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { base: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { base } of ranked) {
    if (base === "tr" || base === "en") return base;
  }
  return "tr";
}

/** Empty strings in the dataset mean "no value"; the contract uses null for that. */
export function nonEmpty(value: string | null | undefined): string | null {
  return value === null || value === undefined || value.trim() === "" ? null : value;
}

/** Text in the requested language. English falls back to Turkish when it is missing. */
export function pick(tr: string, en: string | null | undefined, lang: Lang): string;
export function pick(tr: string | null | undefined, en: string | null | undefined, lang: Lang): string | null;
export function pick(tr: string | null | undefined, en: string | null | undefined, lang: Lang): string | null {
  return (lang === "en" ? nonEmpty(en) : null) ?? nonEmpty(tr);
}

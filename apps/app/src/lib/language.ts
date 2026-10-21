/**
 * BCP 47 tag of a transliteration: the original language written in Latin letters.
 * Keys are `inscriptions[].language` values from the dataset (data/enums.json).
 * Turkish needs no tag (it is the page language) and "other" has none to give.
 */
const transliterationTags: Record<string, string> = {
  ar: "ar-Latn",
  "tr-ottoman": "ota-Latn",
  el: "el-Latn",
};

export function transliterationLanguage(language: string): string | undefined {
  return transliterationTags[language];
}

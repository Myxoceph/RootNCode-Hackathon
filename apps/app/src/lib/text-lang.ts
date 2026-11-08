import type { Lang } from "@vagabonds/contracts";

/** Small words only Turkish has; one of them in a sentence is enough to tell. */
const TURKISH_WORDS = new Set(["ve", "bir", "ile", "olan", "olarak", "i\u00e7in", "bu", "da", "de", "ki", "veya", "gibi", "daha", "en", "sonra", "\u00f6nce", "kadar", "ise"]);
// Turkish-only letters and their capitals, written as codes: the app keeps such letters in the dictionary.
const TURKISH_LETTERS = /[\u00e7\u011f\u0131\u015f\u00f6\u00fc\u00c7\u011e\u0130\u015e\u00d6\u00dc]/;

/**
 * The language a piece of data is written in, when it is not the page's: the API gives the Turkish
 * text where the English is not written yet, and says nothing of it. On an English page, a text
 * whose words are Turkish is marked Turkish, so a screen reader
 * says it as Turkish (WCAG 3.1.2). An English sentence that only names Turkish places is not.
 * `undefined`: the page's own language.
 */
export function dataLanguage(text: string | null | undefined, lang: Lang): "tr" | undefined {
  if (lang !== "en" || !text) return undefined;
  const words = text.toLocaleLowerCase("tr").split(/[^\p{L}']+/u).filter(Boolean);
  if (words.length === 0) return undefined;
  if (words.some((word) => TURKISH_WORDS.has(word) && word !== "en")) return "tr";
  const turkish = words.filter((word) => TURKISH_LETTERS.test(word)).length;
  return turkish / words.length >= 0.4 ? "tr" : undefined;
}

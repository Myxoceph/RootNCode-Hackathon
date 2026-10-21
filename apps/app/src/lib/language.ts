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

/**
 * Props that mark a text's language for screen readers (WCAG 3.1.2):
 * `accessibilityLanguage` on iOS, the `lang` attribute on the web. Android has no
 * per-text language in React Native, so TalkBack keeps the system language there.
 */
export function languageProps(tag: string | undefined): object {
  // react-native-web forwards `lang` to the DOM; React Native's types do not list it.
  return tag ? { accessibilityLanguage: tag, lang: tag } : {};
}

/**
 * Turkish numbers and abbreviations as words, for the speech model: it misreads digits
 * ("1430" comes out as "401", "15. yüzyıl" as "19 yüzyıl") but reads the same words right.
 */

const ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const SCALES: Array<[number, string, boolean]> = [
  // [size, word, whether "bir" is said before it]
  [1e9, "milyar", true],
  [1e6, "milyon", true],
  [1e3, "bin", false],
];

function belowThousand(n: number): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  if (hundreds > 0) words.push(...(hundreds > 1 ? [ONES[hundreds]!] : []), "yüz");
  const rest = n % 100;
  if (rest >= 10) words.push(TENS[Math.floor(rest / 10)]!);
  if (rest % 10 > 0) words.push(ONES[rest % 10]!);
  return words;
}

/** 1430 → "bin dört yüz otuz". Numbers past the billions are read digit by digit. */
export function numberWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e12) return [...String(n)].map((d) => numberWords(Number(d))).join(" ");
  if (n === 0) return "sıfır";
  const words: string[] = [];
  let rest = n;
  for (const [size, word, sayOne] of SCALES) {
    const count = Math.floor(rest / size);
    if (count > 0) words.push(...(count > 1 || sayOne ? belowThousand(count) : []), word);
    rest %= size;
  }
  words.push(...belowThousand(rest));
  return words.join(" ");
}

const HARMONY: Record<string, string> = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" };

/** 15 → "on beşinci", 4 → "dördüncü". */
export function ordinalWords(n: number): string {
  const words = numberWords(n);
  if (words.endsWith("dört")) return `${words.slice(0, -4)}dördüncü`;
  const vowel = HARMONY[[...words].reverse().find((c) => c in HARMONY) ?? "i"]!;
  return /[aeıioöuü]$/.test(words) ? `${words}nc${vowel}` : `${words}${vowel}nc${vowel}`;
}

/** Abbreviations the answers use, as said aloud. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bM\.\s?Ö\./g, "milattan önce"],
  [/\bM\.\s?S\./g, "milattan sonra"],
  [/\bHz\./g, "Hazreti"],
  [/\bvb\./g, "ve benzeri"],
  [/\bvs\./g, "vesaire"],
  [/\byy\./g, "yüzyıl"],
  [/(?<=\d\s?)km\b\.?/g, "kilometre"],
  [/\bH\.\s?(?=\d)/g, "Hicri "],
  [/\bM\.\s?(?=\d)/g, "Miladi "],
  // "H. 1280 / M. 1863": the speech model says "slash".
  [/\s*\/\s*/g, ", "],
  [/\s*&\s*/g, " ve "],
];

const int = (digits: string) => Number.parseInt(digits, 10);

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
/** "XIX" → 19; up to 89, enough for sultans and centuries. */
export function romanValue(numeral: string): number {
  let total = 0;
  for (let i = 0; i < numeral.length; i += 1) {
    const value = ROMAN[numeral[i]!]!;
    const next = ROMAN[numeral[i + 1] ?? ""] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}
/** A well-formed numeral of I, V, X and L ("II", "XIV", "XIX"); not a lone letter like "L". */
const ROMAN_NUMERAL = String.raw`(?:L?X{0,3})(?:IX|IV|V?I{0,3})`;

/** Every number in `text` as words, and the abbreviations around them spelled out. */
export function sayNumbers(text: string): string {
  let out = text;
  for (const [pattern, words] of ABBREVIATIONS) out = out.replace(pattern, words);
  return (
    out
      // II. Murad → ikinci Murad, XV. yüzyıl → on beşinci yüzyıl
      .replace(new RegExp(String.raw`(?<![\p{L}.])(${ROMAN_NUMERAL})\.(?=\s)`, "gu"), (m, numeral: string) =>
        numeral ? ordinalWords(romanValue(numeral)) : m,
      )
      // XIX yüzyıl → on dokuzuncu yüzyıl
      .replace(new RegExp(String.raw`(?<![\p{L}.])(${ROMAN_NUMERAL})(?=\s+(?:yüzyıl|asır|bin))`, "gu"), (m, numeral: string) =>
        numeral ? ordinalWords(romanValue(numeral)) : m,
      )
      // 1.200 → 1200 (a thousands separator, not a sentence end).
      .replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (m) => m.replace(/\./g, ""))
      // %20 → yüzde yirmi
      .replace(/%\s?(\d+)/g, (_m, d: string) => `yüzde ${numberWords(int(d))}`)
      // 09:30 / 09.30 → dokuz otuz
      .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\.\d)/g, (_m, h: string, m: string) =>
        int(m) === 0 ? numberWords(int(h)) : `${numberWords(int(h))} ${numberWords(int(m))}`,
      )
      // 3,5 → üç virgül beş
      .replace(/\b(\d+),(\d+)\b/g, (_m, a: string, b: string) => `${numberWords(int(a))} virgül ${numberWords(int(b))}`)
      // 1430-1435 → 1430 ile 1435
      .replace(/\b(\d+)\s?[-–]\s?(\d+)\b/g, "$1 ile $2")
      // 15. yüzyıl → on beşinci yüzyıl (a lowercase word follows: not a sentence end)
      .replace(/\b(\d+)\.(?=\s+[a-zçğıöşü])/g, (_m, d: string) => ordinalWords(int(d)))
      // 1430'da → bin dört yüz otuzda
      .replace(/\b(\d+)['’](\p{L}+)/gu, (_m, d: string, suffix: string) => `${numberWords(int(d))}${suffix}`)
      .replace(/\b\d+\b/g, (d) => numberWords(int(d)))
  );
}

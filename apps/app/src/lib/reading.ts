import { getLang } from "@/i18n";

/**
 * Splits a text into sentences without changing a letter. A full stop ends a sentence only before a
 * capital and after a word of three or more letters, so "H. 802", "M. 1399" and "15. yüzyıl" hold.
 */
export function sentencesOf(text: string): string[] {
  const parts: string[] = [];
  const ends = /[.!?…]["'”’)]*\s+(?=["'“‘(]?\p{Lu})/gu;
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = ends.exec(text))) {
    const word = text.slice(from, match.index).split(/\s+/).pop() ?? "";
    if (text[match.index] === "." && !/\p{L}{3,}$/u.test(word)) continue;
    parts.push(text.slice(from, match.index + match[0].length).trimEnd());
    from = match.index + match[0].length;
  }
  const rest = text.slice(from).trim();
  if (rest) parts.push(rest);
  return parts;
}

/** Breaks an unbroken text into short paragraphs at sentence ends: a wall of text tires the eye. */
export function paragraphsOf(text: string, longest = 320): string[] {
  const paragraphs: string[] = [];
  for (const block of text.split(/\n+/)) {
    let current = "";
    for (const sentence of sentencesOf(block)) {
      if (current && current.length + sentence.length > longest) {
        paragraphs.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current) paragraphs.push(current);
  }
  return paragraphs;
}

/** Minutes to read this many words at an unhurried pace; never less than one. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 180));
}

const ROMAN: Array<[number, string]> = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "XIV. yüzyıl" for 1399; in English, "14th century". */
export function centuryOf(year: number): string {
  const century = Math.floor((year - 1) / 100) + 1;
  if (getLang() === "en") return `${ordinal(century)} century`;
  let left = century;
  let roman = "";
  for (const [value, letters] of ROMAN) {
    while (left >= value) {
      roman += letters;
      left -= value;
    }
  }
  return `${roman}. yüzyıl`;
}

const MONTHS = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "19 Şubat 1494" for the record's "1494-02-19"; any other wording stays as the book has it. */
export function readableDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const month = match ? MONTHS[getLang()][Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : date;
}

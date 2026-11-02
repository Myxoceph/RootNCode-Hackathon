/**
 * The first Gregorian year of a dating: the first 3-4 digit number after "M.", which may come after
 * a day and month ("M. 8 Mart 1402"). With no "M.", any such number; failing that, the dating itself
 * ("XIV. yüzyıl").
 */
export function yearOfDating(dating: string | null): string | null {
  if (!dating) return null;
  return dating.match(/M\.[^/]*?\b(\d{3,4})\b/)?.[1] ?? dating.match(/\b\d{3,4}\b/)?.[0] ?? dating;
}

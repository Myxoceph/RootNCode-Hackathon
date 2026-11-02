/** Deep inks for a route's band (Profil · Rotalarım), light to dark; each city keeps its own. */
const inks = {
  firuze: ["#0B4F4A", "#042A27"],
  kobalt: ["#1E3470", "#0B1430"],
  mercan: ["#6B2A1E", "#2E0F0A"],
  altin: ["#5C4413", "#2A1E07"],
} as const;

const cityInk: Record<string, keyof typeof inks> = { bursa: "firuze", edirne: "kobalt", konya: "mercan", hatay: "altin", both: "altin" };
const inkOrder = Object.keys(inks) as Array<keyof typeof inks>;

/** The ink for a city or planner region code; any other city always gets the same one. */
export function inkFor(code: string): readonly [string, string] {
  const named = cityInk[code];
  if (named) return inks[named];
  const hash = [...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return inks[inkOrder[hash % inkOrder.length]!];
}

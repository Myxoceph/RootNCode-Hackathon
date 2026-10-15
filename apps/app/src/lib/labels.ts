import type { MonumentType, RelationType } from "@vagabonds/contracts";

export const monumentTypeLabel: Record<MonumentType, string> = {
  mosque: "Cami",
  madrasa: "Medrese",
  bath: "Hamam",
  fountain: "Çeşme",
  arasta: "Arasta",
  caravanserai: "Kervansaray",
  bridge: "Köprü",
  tomb: "Türbe",
  other: "Diğer",
};

export const relationTypeLabel: Record<RelationType, string> = {
  revenue: "Gelir bağı",
  water_supply: "Su bağı",
  same_waqf: "Aynı vakıf",
  architect: "Aynı mimar",
};

const UNVERIFIED_PREFIX = "[DOĞRULANACAK]";

/**
 * Texts still waiting for a sourced version start with "[DOĞRULANACAK]" in the
 * data. Splits that marker off so the screen can show it as a label instead.
 */
export function splitUnverified(text: string): { text: string; unverified: boolean } {
  if (!text.startsWith(UNVERIFIED_PREFIX)) return { text, unverified: false };
  return { text: text.slice(UNVERIFIED_PREFIX.length).trim(), unverified: true };
}

import type { MonumentType } from "@vagabonds/contracts";

/**
 * Sound capsules: 24-second ambiences, one per former use of a building.
 * Sample content (see ./README.md). On the web the sound is synthesized live;
 * the real CC0 recordings arrive with task H9.
 */
export type CapsuleType = "sifahane" | "kervan" | "medrese" | "hamam";

export interface Capsule {
  name: string;
  description: string;
  /** Captions as [second, text]; every sound event becomes a bracketed line. */
  captions: Array<[number, string]>;
}

export const CAPSULE_SECONDS = 24;

export const capsules: Record<CapsuleType, Capsule> = {
  sifahane: {
    name: "Darüşşifa",
    description: "Havuz, fıskiye ve ney: musikiyle tedavinin yapıldığı avlu.",
    captions: [
      [0, "[Havuzda fıskiye şırıltısı başlar]"],
      [3, "[Uzaktan ney tınısı yükselir]"],
      [9, "[Su sesi sürer, avluda hafif rüzgâr]"],
      [12, "[Ney ikinci kez, daha yakından]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  kervan: {
    name: "Kervansaray",
    description: "Taş avluya giren kervan: nallar, çanlar, yolcu uğultusu.",
    captions: [
      [0, "[Taş zeminde nal sesleri yaklaşır]"],
      [4, "[Deve çanları ve çıngırak]"],
      [10, "[Avluda kervancıların uğultusu]"],
      [17, "[Nal sesleri uzaklaşır]"],
    ],
  },
  medrese: {
    name: "Medrese",
    description: "Hücrelerden taşan ders tekrarı ve sayfa hışırtıları.",
    captions: [
      [0, "[Kitap sayfaları çevrilir]"],
      [5, "[Talebeler fısıltıyla ders tekrarı yapar]"],
      [13, "[Bir sayfa daha çevrilir, fısıltılar sürer]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  hamam: {
    name: "Hamam",
    description: "Kubbede yankılanan damlalar, kurnadan dökülen su, buhar.",
    captions: [
      [0, "[Kubbede yankılanan su damlaları]"],
      [6, "[Kurnadan tasla su dökülür]"],
      [11, "[Buhar tıslaması]"],
      [15, "[Su yeniden dökülür, yankı söner]"],
    ],
  },
};

export const capsuleTypes = Object.keys(capsules) as CapsuleType[];

/** The capsule a monument card plays, by building type; `null` when none fits yet. */
export const capsuleForMonumentType: Record<MonumentType, CapsuleType | null> = {
  mosque: null,
  madrasa: "medrese",
  bath: "hamam",
  fountain: null,
  arasta: "kervan",
  caravanserai: "kervan",
  bridge: null,
  tomb: null,
  other: null,
};

export function captionAt(type: CapsuleType, seconds: number): string {
  let text = capsules[type].captions[0]?.[1] ?? "";
  for (const [at, line] of capsules[type].captions) if (seconds >= at) text = line;
  return text;
}

export function formatSeconds(seconds: number): string {
  return `0:${String(Math.floor(seconds)).padStart(2, "0")}`;
}

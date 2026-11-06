/**
 * Sound capsules: 24 seconds of a building's former use, one per use. Sample content (see
 * ./README.md). The sounds are in the app (audio/sounds.ts); the captions are still the first
 * brief's sound events, and are to be written again for the music as it came out.
 */
import type { Lang } from "@vagabonds/contracts";

export type CapsuleType = "cami" | "turbe" | "sifahane" | "kervan" | "medrese" | "hamam" | "su" | "tekke" | "imaret" | "carsi";

export interface Capsule {
  /** The ambient sound key (`ambientSound.key` in `/assets/:id`, `ambient_sound` in data/enums.json). */
  soundKey: string;
  name: string;
  description: string;
  /** Captions as [second, text]; every sound event becomes a bracketed line. */
  captions: Array<[number, string]>;
}

export const CAPSULE_SECONDS = 24;

export const capsules: Record<CapsuleType, Capsule> = {
  cami: {
    soundKey: "cami",
    name: "Cami",
    description: "Avluda şadırvan suyu, kubbeye yükselen sessizlik, kanat sesleri.",
    captions: [
      [0, "[Şadırvandan akan su sesi]"],
      [6, "[Kubbenin altında geniş bir sessizlik]"],
      [13, "[Avluda güvercin kanatları]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  turbe: {
    soundKey: "turbe",
    name: "Türbe",
    description: "Hazirede rüzgâr, ağaçlarda yapraklar, ağır bir dinginlik.",
    captions: [
      [0, "[Hazirede hafif rüzgâr]"],
      [7, "[Selvilerde yaprak hışırtısı]"],
      [14, "[Uzaktan tek bir kuş sesi]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  sifahane: {
    soundKey: "darussifa",
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
    soundKey: "han",
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
    soundKey: "medrese",
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
    soundKey: "hamam",
    name: "Hamam",
    description: "Kubbede yankılanan damlalar, kurnadan dökülen su, buhar.",
    captions: [
      [0, "[Kubbede yankılanan su damlaları]"],
      [6, "[Kurnadan tasla su dökülür]"],
      [11, "[Buhar tıslaması]"],
      [15, "[Su yeniden dökülür, yankı söner]"],
    ],
  },
  su: {
    soundKey: "su",
    name: "Çeşme",
    description: "Lülelerden akan su, taş yalağa düşen damlalar.",
    captions: [
      [0, "[Lüleden taş yalağa su akar]"],
      [8, "[Bir testi dolar]"],
      [15, "[Damlalar seyrekleşir]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  tekke: {
    soundKey: "tekke",
    name: "Tekke",
    description: "Ahşap zeminde ayak sesleri, uzaktan ney, kudüm tınısı.",
    captions: [
      [0, "[Ahşap zeminde yavaş ayak sesleri]"],
      [6, "[Uzaktan ney tınısı yükselir]"],
      [14, "[Hafif bir kudüm vuruşu]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  imaret: {
    soundKey: "imaret",
    name: "İmaret",
    description: "Kazanlarda kaynayan çorba, kepçe ve kâse sesleri, yoksulların uğultusu.",
    captions: [
      [0, "[Büyük kazanda çorba kaynar]"],
      [6, "[Kepçe bakır kâseye dolar]"],
      [13, "[Sırada bekleyenlerin uğultusu]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
  carsi: {
    soundKey: "carsi",
    name: "Çarşı",
    description: "Kubbeli sokakta esnaf uğultusu, bakırcı çekici, kumaş hışırtısı.",
    captions: [
      [0, "[Kapalı çarşıda esnaf uğultusu]"],
      [6, "[Bakırcının çekici tınlar]"],
      [13, "[Kumaş topları açılır]"],
      [20, "[Ses yavaşça kısılır]"],
    ],
  },
};

/** The capsules' names and captions in English; the sound keys and the moments stay the same. */
const capsulesEn: Record<CapsuleType, Capsule> = {
  cami: {
    soundKey: "cami",
    name: "Mosque",
    description: "Fountain water in the courtyard, silence rising to the dome, the sound of wings.",
    captions: [
      [0, "[Water runs from the fountain]"],
      [6, "[A wide silence under the dome]"],
      [13, "[Pigeons' wings in the courtyard]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  turbe: {
    soundKey: "turbe",
    name: "Tomb",
    description: "Wind in the graveyard, leaves in the trees, a deep calm.",
    captions: [
      [0, "[A light wind in the graveyard]"],
      [7, "[Leaves rustle in the cypresses]"],
      [14, "[A single bird in the distance]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  sifahane: {
    soundKey: "darussifa",
    name: "Hospital (Darüşşifa)",
    description: "Pool, fountain and ney: the courtyard where music was used as treatment.",
    captions: [
      [0, "[A fountain begins to murmur in the pool]"],
      [3, "[The sound of a ney rises in the distance]"],
      [9, "[The water goes on, a light wind in the courtyard]"],
      [12, "[The ney again, closer]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  kervan: {
    soundKey: "han",
    name: "Caravanserai",
    description: "A caravan entering the stone courtyard: hooves, bells, the murmur of travellers.",
    captions: [
      [0, "[Hooves approach on the stone floor]"],
      [4, "[Camel bells and jingles]"],
      [10, "[The murmur of caravan men in the courtyard]"],
      [17, "[The hooves move away]"],
    ],
  },
  medrese: {
    soundKey: "medrese",
    name: "Madrasa",
    description: "Lessons repeated from the cells, and the rustle of pages.",
    captions: [
      [0, "[Pages of a book turn]"],
      [5, "[Students repeat their lesson in whispers]"],
      [13, "[Another page turns, the whispers go on]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  hamam: {
    soundKey: "hamam",
    name: "Bathhouse",
    description: "Drops echoing in the dome, water poured from the basin, steam.",
    captions: [
      [0, "[Water drops echo in the dome]"],
      [6, "[Water is poured from the basin with a bowl]"],
      [11, "[A hiss of steam]"],
      [15, "[Water is poured again, the echo dies away]"],
    ],
  },
  su: {
    soundKey: "su",
    name: "Fountain",
    description: "Water from the spouts, drops falling into the stone basin.",
    captions: [
      [0, "[Water runs from the spout into the stone basin]"],
      [8, "[A jug fills]"],
      [15, "[The drops grow sparse]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  tekke: {
    soundKey: "tekke",
    name: "Dervish Lodge",
    description: "Footsteps on a wooden floor, a distant ney, the sound of a kudüm drum.",
    captions: [
      [0, "[Slow footsteps on a wooden floor]"],
      [6, "[The sound of a ney rises in the distance]"],
      [14, "[A soft beat of the kudüm drum]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  imaret: {
    soundKey: "imaret",
    name: "Soup Kitchen",
    description: "Soup boiling in cauldrons, ladles and bowls, the murmur of the poor.",
    captions: [
      [0, "[Soup boils in a great cauldron]"],
      [6, "[A ladle fills a copper bowl]"],
      [13, "[The murmur of those waiting in line]"],
      [20, "[The sound slowly fades]"],
    ],
  },
  carsi: {
    soundKey: "carsi",
    name: "Bazaar",
    description: "Tradesmen's murmur in a domed street, a coppersmith's hammer, rustling cloth.",
    captions: [
      [0, "[The murmur of tradesmen in the covered bazaar]"],
      [6, "[A coppersmith's hammer rings]"],
      [13, "[Bolts of cloth are unrolled]"],
      [20, "[The sound slowly fades]"],
    ],
  },
};

/** A capsule's words in a language; passed in, so a compiled screen follows a change of language. */
export function capsuleWords(type: CapsuleType, lang: Lang): Capsule {
  return (lang === "en" ? capsulesEn : capsules)[type];
}

export const capsuleTypes = Object.keys(capsules) as CapsuleType[];

/**
 * The capsule an asset card plays, by its ambient sound key (`ambientSound.key` in
 * `/assets/:id`). The API resolves the key from the asset or its type's default
 * (`ambient_sound` in data/enums.json). Keys without a capsule yet play none.
 */
const bySoundKey = new Map<string, CapsuleType>([...capsuleTypes.map((type) => [capsules[type].soundKey, type] as const), ["cami-sadirvan", "cami"]]);

export function capsuleForSoundKey(soundKey: string): CapsuleType | undefined {
  return bySoundKey.get(soundKey);
}

export function captionAt(type: CapsuleType, seconds: number, lang: Lang): string {
  const { captions } = capsuleWords(type, lang);
  let text = captions[0]?.[1] ?? "";
  for (const [at, line] of captions) if (seconds >= at) text = line;
  return text;
}

export function formatSeconds(seconds: number): string {
  return `0:${String(Math.floor(seconds)).padStart(2, "0")}`;
}

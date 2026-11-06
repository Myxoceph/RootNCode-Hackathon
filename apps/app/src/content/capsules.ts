/**
 * Sound capsules: 24-second ambiences, one per former use of a building.
 * Sample content (see ./README.md). On the web the sound is synthesized live;
 * the real CC0 recordings arrive with task H9.
 */
import { getLang } from "@/i18n";

export type CapsuleType = "sifahane" | "kervan" | "medrese" | "hamam";

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
};

/** The capsules' names and captions in English; the sound keys and the moments stay the same. */
const capsulesEn: Record<CapsuleType, Capsule> = {
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
};

/** A capsule's words in the app's language. */
export function capsuleWords(type: CapsuleType): Capsule {
  return (getLang() === "en" ? capsulesEn : capsules)[type];
}

export const capsuleTypes = Object.keys(capsules) as CapsuleType[];

/**
 * The capsule an asset card plays, by its ambient sound key (`ambientSound.key` in
 * `/assets/:id`). The API resolves the key from the asset or its type's default
 * (`ambient_sound` in data/enums.json). Keys without a capsule yet play none.
 */
const bySoundKey = new Map(capsuleTypes.map((type) => [capsules[type].soundKey, type]));

export function capsuleForSoundKey(soundKey: string): CapsuleType | undefined {
  return bySoundKey.get(soundKey);
}

export function captionAt(type: CapsuleType, seconds: number): string {
  const { captions } = capsuleWords(type);
  let text = captions[0]?.[1] ?? "";
  for (const [at, line] of captions) if (seconds >= at) text = line;
  return text;
}

export function formatSeconds(seconds: number): string {
  return `0:${String(Math.floor(seconds)).padStart(2, "0")}`;
}

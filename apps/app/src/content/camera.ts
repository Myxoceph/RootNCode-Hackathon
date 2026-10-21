/** Texts for the camera screens. Sample content (see ./README.md). */

export const timeCurtain = {
  monument: "Muradiye Camii",
  archiveLabel: "1920'ler",
  /** Read aloud by "Sesli betimle": what changed between the two frames. */
  audioDescription:
    "Muradiye Camii, iki dönem yan yana. 1920'lerdeki fotoğrafta caminin solunda cumbalı, iki katlı ahşap bir ev, sağında da daha küçük bir ahşap ev var; önde fesli iki yaya yürüyor ve zemin topraktır. Bugünkü karede iki ev de yok. Soldaki evin yerinde bir ağaç ve sokak lambası duruyor, caminin batı cephesini restorasyon iskelesi sarıyor, önde park etmiş bir otomobil görünüyor. Kubbe, beş kubbeli revak ve tek şerefeli minare yüz yıl önceki haliyle aynı.",
};

export const inscription = {
  place: "Muradiye Külliyesi · giriş kapısının üzerindeki kitabe",
  lines: ["بسم الله الرحمن الرحيم", "وقف لوجه الله تعالى"],
  transcription: "Bismillâhirrahmânirrahîm · Vakfen li-vechillâhi teâlâ",
  meaning: "Rahman ve Rahim olan Allah'ın adıyla. Yüce Allah'ın rızası için vakfedilmiştir.",
  waqfCondition:
    "İmarette her gün sabah ve akşam çorba pişirilsin; yolcu ve garip, kim olduğuna bakılmadan üç gün ağırlansın.",
};

export const inscriptionReadAloud = `Kitabe. ${inscription.meaning} Vakfiyenin şartı: ${inscription.waqfCondition}`;

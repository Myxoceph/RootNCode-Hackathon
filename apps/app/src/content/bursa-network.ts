/**
 * The Bursa network on the Hayrat map: seven monuments and the links between
 * them. Sample content (see ./README.md). Positions are on the map drawing's
 * own 280×600 grid, not real coordinates.
 */
export type LinkKind = "revenue" | "patron" | "style";

export const linkKindLabel: Record<LinkKind, string> = {
  revenue: "Gelir bağı",
  patron: "Aynı banî",
  style: "Aynı üslup",
};

export interface NetworkMonument {
  id: string;
  name: string;
  year: string;
  /** "Cami · Yıldırım Bayezid": type and patron. */
  summary: string;
  x: number;
  y: number;
}

export interface NetworkLink {
  from: string;
  to: string;
  kind: LinkKind;
  /** Shown while one end is still under the fog: where to look next. */
  hint: string;
  /** Shown once both ends are found. */
  resolved: string;
}

export const networkMonuments: NetworkMonument[] = [
  { id: "ulu", name: "Ulu Cami", year: "1400", summary: "Cami · Yıldırım Bayezid", x: 112, y: 206 },
  { id: "emir", name: "Emir Han", year: "14. yy", summary: "Han · Orhan Gazi", x: 152, y: 258 },
  { id: "orhan", name: "Orhan Gazi Camii", year: "1339", summary: "Cami · Orhan Gazi", x: 200, y: 300 },
  { id: "koza", name: "Koza Han", year: "1491", summary: "Han · II. Bayezid", x: 92, y: 296 },
  { id: "yesil", name: "Yeşil Cami", year: "1419", summary: "Cami · Çelebi Mehmed", x: 240, y: 236 },
  { id: "yildirim", name: "Yıldırım Darüşşifası", year: "1390'lar", summary: "Şifahane · Yıldırım Bayezid", x: 226, y: 168 },
  { id: "muradiye", name: "Muradiye Külliyesi", year: "1426", summary: "Külliye · II. Murad", x: 44, y: 190 },
];

export const networkLinks: NetworkLink[] = [
  {
    from: "emir",
    to: "orhan",
    kind: "revenue",
    hint: "Kira geliri birkaç sokak ötedeki Orhan Gazi Külliyesi'nin giderlerini karşılıyordu. Camiyi bularak hattı tamamla.",
    resolved: "Emir Han'ın kira geliri bu külliyenin giderlerini karşılıyordu.",
  },
  {
    from: "ulu",
    to: "yildirim",
    kind: "patron",
    hint: "Bu camiyi yaptıran Yıldırım Bayezid şehrin doğusuna bir darüşşifa da kurdu. Onu bul.",
    resolved: "İkisini de Yıldırım Bayezid yaptırdı.",
  },
  {
    from: "orhan",
    to: "yesil",
    kind: "style",
    hint: "Bu ters T planlı caminin daha süslü bir akrabası doğuda, Yeşil'de.",
    resolved: "İkisi de ters T planlı, tabhaneli erken Osmanlı camisi.",
  },
  {
    from: "yesil",
    to: "muradiye",
    kind: "style",
    hint: "Aynı plan şeması batıda, Muradiye'de bir kez daha karşına çıkacak.",
    resolved: "Aynı ters T plan şeması, yedi yıl arayla.",
  },
  {
    from: "emir",
    to: "koza",
    kind: "style",
    hint: "Hanlar Bölgesi'ndeki komşusu Koza Han da aynı avlulu düzende.",
    resolved: "İkisi de iki katlı, avlulu Hanlar Bölgesi hanı.",
  },
];

/** Already resolved when the map opens. */
export const startingMonuments = ["ulu", "emir"];

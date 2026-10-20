# @vagabonds/contracts

Backend ile istemci (mobil + web) arasındaki **tek doğruluk kaynağı** olan veri sözleşmesi. Sürüm: `CONTRACT_VERSION` (`0.2.1`).

- `src/asset.schema.ts`: `/assets` uçlarının Zod şemaları ve TypeScript tipleri
- `src/meta.schema.ts`: `/meta/enums` (filtre, lejant ve rozet kod listeleri)
- `src/monument.schema.ts`: **kullanımdan kalkacak** v0.1 sözleşmesi (`Monument`, mock). Uygulama `/assets`'e geçince (Y8) silinecek.

## Uç noktalar

| Uç nokta | Yanıt şeması |
|---|---|
| `GET /assets?city=&type=&era=&q=&bbox=&limit=&offset=&lang=` | `AssetListResponseSchema` (liste ve harita) |
| `GET /assets/:id?lang=` | `AssetDetailSchema` |
| `GET /assets/:id/relations?lang=` | `AssetRelationsResponseSchema` (Kentsel Ağ bağları) |
| `GET /assets/:id/nearby?radius=&limit=&lang=` | `NearbyAssetsResponseSchema` (yarıçap metre: 100–50000, varsayılan 2000; limit 1–50, varsayılan 10) |
| `GET /meta/enums?lang=` | `MetaEnumsResponseSchema` (il, tür, dönem, bağ türü, güven, erişilebilirlik, medya türü) |

Hata yanıtları her zaman `{ error: { code, message } }` biçimindedir: `INVALID_QUERY`, `INVALID_ID` (400), `ASSET_NOT_FOUND` (404),
`RATE_LIMITED` (429: IP başına dakikada 120 istek aşıldı; kaç saniye bekleneceği `Retry-After` başlığında).
Ayrıntılı ve denenebilir belge: API çalışırken `http://localhost:3000/docs`.

## İstemci için hızlı başlangıç

```ts
import { AssetDetailSchema, AssetListResponseSchema } from "@vagabonds/contracts";

const API_URL = "http://localhost:3000"; // fiziksel cihazda bilgisayarın yerel IP'si kullanılır

export async function fetchAssets(params: Record<string, string> = {}) {
  const response = await fetch(`${API_URL}/assets?${new URLSearchParams(params)}`);
  if (!response.ok) throw new Error((await response.json()).error.message);
  return AssetListResponseSchema.parse(await response.json());
}

export async function fetchAsset(id: string, lang: "tr" | "en" = "tr") {
  const response = await fetch(`${API_URL}/assets/${id}?lang=${lang}`);
  if (!response.ok) throw new Error((await response.json()).error.message);
  return AssetDetailSchema.parse(await response.json());
}
```

## Sözleşme kuralları

- Alan adları camelCase. Nesneler `strict`: tanımsız bir alan doğrulamayı bozar, sessizce yok sayılmaz.
- **Dil:** Metinler tek dilde gelir. `?lang=tr|en` verilmezse `Accept-Language`, o da yoksa Türkçe. İngilizcesi olmayan metin Türkçe döner. Yanıtın dili `Content-Language` başlığındadır.
- **Güven düzeyi:** Bölüm, bilgi, zaman çizelgesi olayı, tarihleme, banî, mimar ve vakıf bilgisi `confidence: { code, label }` taşır. `probable`, `disputed` ve `legend` rozetle gösterilir; hiçbiri kesin bilgi gibi sunulmaz. Rivayetler (`legends[]`) tarihçe bölümlerinden ayrıdır.
- **Kaynak:** Aynı öğeler `sources: [{ sourceId, title, pages, url }]` taşır ("Kaynak: Bursa Vakıf Eserleri – I. Cilt, s. 52-55"). `sources` (detayın kökünde) eserde geçen tüm kaynakların listesidir.
- **Koordinat** (`coordinates`) yoksa `null`: eser haritada gösterilmez. `verified: false`, konumun yerinde doğrulanmadığını söyler.
- **Görsel** (`cover`, `media[]`) yoksa `cover: null`: yer tutucu görsel gösterilir. Kutu `aspectRatio` ile çizilip `dominantColor` ile boyanır, `lqip` bulanık önizlemedir; `sources.webp` / `sources.jpg` farklı genişlikleri verir. Fotoğrafın çekildiği konum hiçbir yanıtta yer almaz.
- **Erişilebilirlik** değerleri `yes | partial | no | unknown`; `unknown` "Bilgi yok" demektir, "erişilebilir" değil.
- **Bağlar** (`/relations`) iki yönlüdür: `direction: "outgoing"` bağ bu eserin kaydında, `"incoming"` karşı eserin kaydında yazılıdır. İki eserde de yazılı aynı bağ bir kez döner. Karşı eser henüz yayında değilse bağ dönmez, yalnızca `unavailableCount` içinde sayılır ("+3 bağ yakında" gibi gösterilebilir). Her bağın `confidence` ve `sources` alanı vardır.
- **Yakındaki eserler** (`/nearby`) kuş uçuşu mesafeye göre sıralıdır (`distanceMeters`). Eserin koordinatı yoksa `origin: null` ve `items: []` döner.
- **Filtreler** için kodları ve etiketleri `/meta/enums` verir; `assetCount` 0 olan il, tür ve dönemler gizlenebilir. Güven listesi `certain → legend` sırasındadır.
- Tarihler ISO 8601 (`2026-10-16`, `2026-10-16T18:20:00.000Z`).

## Alanların modüllere karşılığı

| Modül | Alanlar |
|---|---|
| 1. Zaman Perdesi | `media[]` (`kind: "archive_photo"`, `archiveYear`) |
| 2. Taşın Dili | `inscriptions[]` (`transliteration`, `translation`, `arTargetMediaKey`), `waqf` |
| 3. Kentsel Ağ & Sis Açma | `coordinates`, `parent`, `children`, `/assets/:id/relations`, `/assets/:id/nearby` |
| 4. Travel Planner | `coordinates`, `type`, `visit`, `/assets/:id/nearby` |
| 7. Sesli Zaman Kapsülü | `ambientSound` (`key`, `caption`) |
| 8. Kapsayıcı Erişilebilirlik | `accessibility`, `media[].alt`, `ambientSound.caption` |

## Doğrulama

```bash
npm run typecheck --workspace @vagabonds/contracts # TypeScript kontrolü
npm run contracts:validate                         # eski mock_monuments.json kontrolü (v0.1)
```

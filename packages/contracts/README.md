# @vagabonds/contracts

Backend ile istemci (mobil + web) arasındaki **tek doğruluk kaynağı** olan veri sözleşmesi. Sürüm: `CONTRACT_VERSION` (`0.2.3`).

- `src/asset.schema.ts`: `/assets` uçlarının Zod şemaları ve TypeScript tipleri
- `src/meta.schema.ts`: `/meta/enums` (filtre, lejant ve rozet kod listeleri)
- `src/planner.schema.ts`: `/weather` ve `/routes/plan` (Vakıf Travel Planner & Hava Durumu)
- `src/monument.schema.ts`: **kullanımdan kalkacak** v0.1 sözleşmesi (`Monument`, mock). Uygulama `/assets`'e geçince (Y8) silinecek.

## Uç noktalar

| Uç nokta | Yanıt şeması |
|---|---|
| `GET /assets?city=&type=&era=&q=&bbox=&limit=&offset=&lang=` | `AssetListResponseSchema` (liste ve harita) |
| `GET /assets/:id?lang=` | `AssetDetailSchema` |
| `GET /assets/:id/relations?lang=` | `AssetRelationsResponseSchema` (Kentsel Ağ bağları) |
| `GET /assets/:id/nearby?radius=&limit=&lang=` | `NearbyAssetsResponseSchema` (yarıçap metre: 100–50000, varsayılan 2000; limit 1–50, varsayılan 10) |
| `GET /meta/enums?lang=` | `MetaEnumsResponseSchema` (il, tür, dönem, bağ türü, güven, erişilebilirlik, medya türü) |
| `GET /weather?city=&lang=` | `WeatherResponseSchema` (anlık hava durumu ve `advice`; sağlayıcıya ulaşılamazsa `available: false`) |
| `GET /routes/plan?city=&theme=&start=&maxMinutes=&lang=` | `RoutePlanResponseSchema` (`theme`: `type:<kod>`, `era:<kod>` ya da `network:<eser id>`; `start`: `lat,lng`; `maxMinutes` 15–600, varsayılan 120) |
| `POST /auth/anonymous` | İstek `AnonymousSessionRequestSchema` (`nickname`), yanıt `AnonymousSessionResponseSchema` (`user`, `token`) |
| `GET /me` 🔒 | `AppUserSchema` |
| `GET /me/contributions?limit=` 🔒 | `MyContributionsResponseSchema` (kendi katkıların ve moderasyon durumu) |
| `POST /assets/:id/contributions` 🔒 | İstek `CreateContributionRequestSchema` (`kind`, `body`), yanıt `ContributionSchema` (`status: "pending"`) |
| `GET /assets/:id/pulse?lang=&limit=` | `PulseResponseSchema` (veri setindeki ipuçları + onaylanmış topluluk katkıları) |
| `GET /admin/contributions?status=&limit=&offset=` 🛡️ | `ModerationListResponseSchema` |
| `POST /admin/contributions/:id/approve` 🛡️, `…/reject` 🛡️ | `ModerationItemSchema`; reddetmede istek `RejectContributionRequestSchema` (`reason`) |
| `POST /admin/users/:id/ban` 🛡️ | `204` |

🔒 `Authorization: Bearer <token>` gerekir; 🛡️ moderatör token'ı gerekir (`npm run moderator:create`).

Hata yanıtları her zaman `{ error: { code, message } }` biçimindedir: `INVALID_QUERY`, `INVALID_ID` (400), `ASSET_NOT_FOUND`, `CITY_NOT_FOUND` (404),
`RATE_LIMITED` (429: IP başına dakikada 120 istek aşıldı; kaç saniye bekleneceği `Retry-After` başlığında).
Ziyaretçi Nabzı uçlarında ayrıca: `INVALID_BODY` (400), `UNAUTHORIZED` (401: token yok ya da geçersiz),
`USER_BANNED`, `FORBIDDEN` (403), `CONTRIBUTION_NOT_FOUND`, `USER_NOT_FOUND` (404), `ALREADY_REVIEWED` (409),
`CONTRIBUTION_LIMIT` (429: kullanıcı başına saatte 5 katkı).
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
- **Hava durumu** (`/weather`) Open-Meteo'dan gelir ve 15 dakika önbelleğe alınır. Sağlayıcı 2 saniyede yanıt vermezse `available: false`, `current: null` döner; uygulama hava durumu olmadan çalışmaya devam eder. Yağmur, kar, fırtına ya da 32 °C ve üstünde `advice: "indoor_preferred"` olur. Hava durumunun gösterildiği yerde `attribution` metni (CC BY 4.0) gösterilmelidir.
- **Rota** (`/routes/plan`) en yakından ilerleyen bir yürüyüştür: her adımda süre bütçesine (yürüme + ziyaret) sığan en yakın eser seçilir, tek bacak 3 km'yi geçmez. `advice: "indoor_preferred"` iken açık mekânlar daha uzakmış gibi değerlendirilir, dışlanmaz. `start` verilmezse rota `network` temasında o eserden, diğer temalarda eserlerin en yoğun olduğu yerden başlar (`start.source`). Yürüme süreleri tahminidir (kuş uçuşu × 1,3, dakikada 80 m; `estimateNote`). Veri setinde ziyaret süresi ya da açık/kapalı bilgisi yoksa eser türünden tahmin edilir ve `visitMinutesEstimated` / `settingEstimated` `true` olur. Koordinatı olmayan eserler rotaya girmez, `skippedWithoutCoordinates` içinde sayılır; sığmayanlar `notReachedCount` içindedir. Eşleşen eser yoksa `stops: []` ve `start: null` döner (hata değil).
- **Ziyaretçi Nabzı:**
  - Kullanıcı anonimdir. `POST /auth/anonymous` ile takma ad verir, karşılığında bir token alır. Token yalnızca bir kez döner, API onun yalnızca özetini saklar. İstemci token'ı güvenli depoda tutar (mobilde `expo-secure-store`); kaybolursa yeni oturum açılır.
  - Katkı türleri: `tip` (saha ipucu), `memory` (anı) ve `correction` (editörlere düzeltme). Fotoğraf katkısı şimdilik yok.
  - Metin düz metindir ve 10–1000 karakter arasıdır. `normalizeContributionText` API'nin uyguladığı temizliği yapar; karakter sayacı bu fonksiyonla gösterilebilir.
  - Katkı önce `pending` olarak kaydedilir. Nabızda yalnızca moderatörün onayladığı `tip` ve `memory` katkıları görünür; `correction` katkıları hiçbir zaman görünmez.
  - Nabız sırası: önce veri setindeki ipuçları (`origin: official | field_visit | visitor_reviews_summary`), sonra topluluk katkıları (`origin: "community"`, `author` takma ad), yeniden eskiye.
  - Anılar (`kind: "memory"`) saha ipuçlarından ayrı gösterilir. Topluluk içeriği kaynaklı bilgi gibi sunulmaz.
  - Engellenen kullanıcının onaylı katkıları nabızdan kalkar.

## Alanların modüllere karşılığı

| Modül | Alanlar |
|---|---|
| 1. Zaman Perdesi | `media[]` (`kind: "archive_photo"`, `archiveYear`) |
| 2. Taşın Dili | `inscriptions[]` (`transliteration`, `translation`, `arTargetMediaKey`), `waqf` |
| 3. Kentsel Ağ & Sis Açma | `coordinates`, `parent`, `children`, `/assets/:id/relations`, `/assets/:id/nearby` |
| 4. Travel Planner & Hava Durumu | `/routes/plan` (`stops[]`, `totals`), `/weather` (`advice`), `coordinates`, `/assets/:id/nearby` |
| 6. Ziyaretçi Nabzı | `visitorTips`, `/assets/:id/pulse`, `/assets/:id/contributions`, `/auth/anonymous` |
| 7. Sesli Zaman Kapsülü | `ambientSound` (`key`, `caption`) |
| 8. Kapsayıcı Erişilebilirlik | `accessibility`, `media[].alt`, `ambientSound.caption` |

## Doğrulama

```bash
npm run typecheck --workspace @vagabonds/contracts # TypeScript kontrolü
npm run contracts:validate                         # eski mock_monuments.json kontrolü (v0.1)
```

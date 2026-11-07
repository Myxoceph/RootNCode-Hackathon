# @vagabonds/contracts

Backend ile istemci (mobil + web) arasındaki **tek doğruluk kaynağı** olan veri sözleşmesi. Sürüm: `CONTRACT_VERSION` (`0.3.35`).

- `src/asset.schema.ts`: `/assets` uçlarının Zod şemaları ve TypeScript tipleri
- `src/meta.schema.ts`: `/meta/enums` (filtre, lejant ve rozet kod listeleri)
- `src/planner.schema.ts`: `/weather`, `/routes/plan` ve `/routes/trip` (Vakıf Travel Planner & Hava Durumu)
- `src/gastronomy.schema.ts`: `/cities/:code/dishes` (Yöresel Kültür & Gastronomi)
- `src/sound.schema.ts`: `/meta/sounds` (Sesli Zaman Kapsülü); kaydın kendisi `asset.schema.ts`'te (`SoundRecordingSchema`)
- `src/chat.schema.ts`: `POST /chat` ve `GET /chat/status` (AI asistan)
- `src/transit.schema.ts`: `/transit/plan` ve `/transit/entry-points` (toplu taşıma, Konya pilotu)
- `src/achievement.schema.ts`: ziyaretler ve başarımlar (`/assets/:id/visit`, `/achievements`, `/me/achievements`, `/me/visits`, `/admin/achievements`); liste `docs/achievements.md`
- `src/reward.schema.ts`: ödül kataloğu ve cüzdan (`/rewards`, `/me/wallet`, `/rewards/:code/redeem`, `/admin/rewards`); anlatım `docs/rewards.md`
- `src/admin.schema.ts`: yönetim paneli (`/admin/summary`, `/admin/users`, `/admin/assets`); moderasyon kuyruğu `community.schema.ts`'te
- `scripts/validate-fixtures.ts`: uygulamanın örnek verisini (`apps/app/src/data/fixtures`) bu şemalarla doğrular

v0.1'in `Monument` sözleşmesi ve `mock_monuments.json` v0.3.0'da kaldırıldı; uygulama `/assets` uçlarını kullanıyor (Y8).

## Uç noktalar

| Uç nokta | Yanıt şeması |
|---|---|
| `GET /assets?city=&type=&era=&q=&bbox=&limit=&offset=&lang=` | `AssetListResponseSchema` (liste ve harita) |
| `GET /assets/:id?lang=` | `AssetDetailSchema` |
| `GET /assets/:id/relations?lang=` | `AssetRelationsResponseSchema` (Kentsel Ağ bağları): `items` haritadaki eserlere bağlar; `outside` veri setinde olmayan yerlere bağlar, kaynaktaki adıyla (`name`, ör. "II. Bayezid Külliyesi (İstanbul)"), haritaya çizilmez; `unavailableCount` henüz yayında olmayanlar |
| `GET /assets/:id/nearby?radius=&limit=&lang=` | `NearbyAssetsResponseSchema` (yarıçap metre: 100–50000, varsayılan 2000; limit 1–50, varsayılan 10) |
| `GET /meta/enums?lang=` | `MetaEnumsResponseSchema` (il, tür, dönem, bağ türü, güven, erişilebilirlik, medya türü) |
| `GET /weather?city=&lang=` | `WeatherResponseSchema` (anlık hava durumu, `advice` ve bugünden itibaren 7 günlük `daily` tahmin; sağlayıcıya ulaşılamazsa `available: false`, `daily: []`) |
| `GET /meta/sounds?lang=` | `MetaSoundsResponseSchema` (yayındaki ortam sesi kayıtları: adres, süre, altyazılar, lisans; kayıt yoksa `sounds: []`) |
| `GET /cities/:code/dishes?lang=` | `CityDishesResponseSchema` (ilin yöresel lezzetleri, veri ekibinin sırasıyla; lezzeti olmayan ilde `dishes: []`) |
| `GET /routes/trip?city=&duration=&theme=&start=&date=&lang=` | `TripPlanResponseSchema` (`duration`: `half`, `1` (varsayılan), `2`, `3`, `4` ya da `5`; eser biterse yanıtta planlanan gün sayısı döner; `theme`: `type:<kod>` ya da `era:<kod>`, verilmezse bütün eserler; `arrival`: Konya'da gelinen gar ya da otogar; `date`: 1. günün tarihi, bugünden en çok bir yıl sonrasına kadar) |
| `GET /routes/plan?city=&theme=&start=&maxMinutes=&lang=` | `RoutePlanResponseSchema` (`theme`: `type:<kod>`, `era:<kod>` ya da `network:<eser id>`; `start`: `lat,lng`; `maxMinutes` 15–600, varsayılan 120) |
| `GET /chat/status` | `ChatStatusResponseSchema` (`available: false` iken sohbet girişleri gizlenir) |
| `POST /chat` | İstek `ChatRequestSchema` (`message` 1–500 karakter, `assetId?`, `history` en çok 6 tur, `lang?`), yanıt `ChatResponseSchema` (`answer` içindeki `[n]` işaretleri `citations[].ref`'e karşılık gelir; `grounded: false` ise cevap kaynaksızdır; gezi sorusunda `attachments.trip`; Konya'da "nasıl giderim" sorusunda `attachments.transit`, `TransitPlanResponseSchema`). İstekte isteğe bağlı `origin: { lat, lng }`: ziyaretçinin konumu, saklanmaz |
| `GET /transit/entry-points?lang=` | `TransitEntryPointsResponseSchema`: rotanın başlayabileceği yerler (`konya-gari`, `selcuklu-yht-gari`, `konya-otogari`) |
| `GET /transit/plan?from=&to=&at=&lang=` | `TransitPlanResponseSchema`: en çok 3 seçenek; her bacakta `mode` (`walk`, `bus`, `tram`), biniş ve iniş durağı, saatler, hat (`line.name`, ör. `56-A`), yön, aradaki durak sayısı ve çizim için `path` ([lat, lng]). `from`: `lat,lng`, giriş noktası kodu ya da eser id; `to`: eser id ya da `lat,lng`. Gece sefer yoksa arama sabah 06:00'dan yapılır (`searchedFrom`). Konya dışı `TRANSIT_NOT_AVAILABLE_HERE` (400), OTP yoksa `TRANSIT_UNAVAILABLE` (503) |
| `POST /auth/anonymous` | İstek `AnonymousSessionRequestSchema` (`nickname`), yanıt `AnonymousSessionResponseSchema` (`user`, `token`) |
| `POST /auth/register` | İstek `RegisterRequestSchema` (`username`, `password` 8–128, isteğe bağlı `nickname`), yanıt `SessionResponseSchema` (`user`, `token`) |
| `POST /auth/login` | İstek `LoginRequestSchema` (`username` büyük/küçük harf duyarsız, `password`), yanıt `SessionResponseSchema`; her giriş bu cihaz için yeni token verir |
| `POST /auth/logout` 🔒 | `204`; yalnızca bu token geçersiz olur |
| `POST /auth/upgrade` 🔒 | İstek `UpgradeAccountRequestSchema` (`username`, `password`), yanıt `AppUserSchema`; anonim ziyaretçi hesap açar, token'ı ve katkıları korunur |
| `GET /me` 🔒 | `AppUserSchema` (`username` anonimde `null`; `role`: `visitor`, `moderator`, `admin`) |
| `GET /me/contributions?limit=` 🔒 | `MyContributionsResponseSchema` (kendi katkıların ve moderasyon durumu) |
| `POST /assets/:id/contributions` 🔒 | İstek `CreateContributionRequestSchema` (`kind`, `body`), yanıt `ContributionSchema` (`status: "pending"`) |
| `POST /assets/:id/photos?caption=` 🔒 | Gövde fotoğrafın kendisi (`Content-Type: image/jpeg` ya da `image/png`, en çok `PHOTO_MAX_BYTES` = 5 MB, kısa kenar en az 300 px); `caption` 3–200 karakter, alternatif metin olarak da kullanılır. Yanıt `ContributionSchema` (`kind: "photo"`, `photo.path` imzalı). Konum dahil meta veriler sunucuda silinir. Kullanıcı başına günde `PHOTOS_PER_DAY` (10) fotoğraf |
| `GET /assets/:id/photos?limit=` | `CommunityPhotosResponseSchema`: onaylanmış ziyaretçi fotoğrafları, yeniden eskiye; eserin kendi galerisinden (`media`) ayrı gösterilir, yazarın takma adıyla |
| `GET /photos/:id` | Fotoğraf dosyası. `path` alanları API'nin taban adresine eklenir (`${apiUrl}${path}`); onaylanmamış fotoğraf yalnızca yanıttaki imzalı adresle (1 gün geçerli) açılır |
| `POST /assets/:id/visit?lang=` 🔒 | İstek `VisitRequestSchema` (`lat`, `lng`; eserin noktası varsa zorunlu ve `VISIT_RADIUS_METERS` = 200 m içinde olmalı), yanıt `VisitResponseSchema` (`verified`, `distanceMeters`, `firstVisit`, `newAchievements`). Noktası olmayan eserin ziyareti doğrulanmadan kabul edilir. Kullanıcı başına günde 60 ziyaret |
| `POST /assets/:id/visit/proof?lang=` 🔒 | İstek `VisitProofRequestSchema` (`mediaKey`: eserin kamerada tanınan fotoğrafının `media[].key` değeri, `method: "device_recognition"`, konum ziyaretteki kuralla), yanıt `VisitResponseSchema` (`proven: true`). Ziyaret yoksa kaydedilir ve kanıtlanmış olarak işaretlenir; `UNKNOWN_MEDIA` (400) anahtar bu eserin değilse |
| `GET /rewards?lang=` | `RewardsResponseSchema`: etkin ödüller (`costPoints`, `minProvenVisits`, `stock`, örnekse `sample: true`) |
| `GET /me/wallet?lang=` 🔒 | `WalletResponseSchema`: `balance`, `earned`, `spent`, `provenVisits`, alınan kodlar |
| `POST /rewards/:code/redeem?lang=` 🔒 | `RedeemResponseSchema`: tek kullanımlık kod ve yeni bakiye; `INSUFFICIENT_POINTS`, `PROVEN_VISITS_REQUIRED`, `OUT_OF_STOCK` (409); anonim kullanıcıya `ACCOUNT_REQUIRED` (403) |
| `GET /achievements?lang=` | `AchievementsResponseSchema`: etkin başarımlar, kurallarıyla (`rule.kind`: `visit_count`, `districts`, `cities`, `within`, `complex`, `contributions`) |
| `GET /me/achievements?lang=` 🔒 | `MyAchievementsResponseSchema`: her başarımda ilerleme (`progress.current/target`), `earnedAt`, toplam puan ve ziyaret sayısı |
| `GET /me/visits` 🔒 | `MyVisitsResponseSchema`: ziyaret edilen yayındaki eserler, yeniden eskiye (`assetId`, `visitedAt`, `verified`, `proven`); harita bu eserlerin sisini kaldırır |
| `GET /assets/:id/pulse?lang=&limit=` | `PulseResponseSchema` (veri setindeki ipuçları + onaylanmış topluluk katkıları) |
| `GET /admin/contributions?status=&kind=&limit=&offset=` 🛡️ | `ModerationListResponseSchema` (`kind`: `notes` ya da `photos`; verilmezse hepsi) |
| `GET /admin/summary` 🛡️ | `AdminSummaryResponseSchema` (bekleyen notlar ve fotoğraflar, kullanıcı sayıları, panelden eklenen eserler) |
| `GET /admin/users?q=&role=&limit=&offset=` 🛡️ | `AdminUsersResponseSchema` (takma ad ya da kullanıcı adıyla arama) |
| `POST /admin/users/:id/role` 👑 | İstek `SetUserRoleRequestSchema`, yanıt `AdminUserSchema`; kendi rolüne uygulanamaz (`OWN_ROLE`) |
| `POST /admin/users/:id/unban` 🛡️ | `AdminUserSchema` |
| `GET /admin/assets` 👑 | `AdminAssetsResponseSchema`: panelden eklenen eserler (taslak ve yayında) |
| `POST /admin/assets` 👑 | İstek `AdminAssetInputSchema` (ad, tür, il, ilçe, dönem, özet, tanıtım metni, tarih, bani, adres, koordinat, `status`), yanıt `AdminAssetSchema`; id addan üretilir (`<il>-<ilçe>-<ad>`). Kayıt veri setindeki JSON biçiminde saklanır ve `data/tools/export_panel_assets.py` ile `data/eserler`'e yazılabilir |
| `PATCH /admin/assets/:id` 👑 | İstek `AdminAssetPatchSchema` (alanlardan herhangi biri; yayına almak için `status: "published"`); yalnızca panelden eklenen eserler, id değişmez |
| `DELETE /admin/assets/:id` 👑 | `204`; yalnızca panelden eklenen eserler |
| `GET /admin/rewards` 🛡️, `POST /admin/rewards` 👑, `PATCH /admin/rewards/:code` 👑, `POST /admin/rewards/:code/codes` 👑 | `AdminRewardsResponseSchema`, `AdminRewardInputSchema` / `AdminRewardPatchSchema` → `AdminRewardSchema`, `AddRewardCodesRequestSchema` → `AddRewardCodesResponseSchema` (`added`, `duplicates`, `stock`) |
| `GET /admin/achievements` 🛡️ | `AdminAchievementsResponseSchema` (kapalılar dahil, kaç kişinin kazandığıyla) |
| `POST /admin/achievements` 👑, `PATCH /admin/achievements/:code` 👑, `DELETE …` 👑 | İstek `AdminAchievementInputSchema` / `AdminAchievementPatchSchema`, yanıt `AdminAchievementSchema`; kuraldaki il, dönem ve külliye id'si kontrol edilir (`UNKNOWN_CODE`). Kapatmak için `active: false` |
| `POST /admin/contributions/:id/approve` 🛡️, `…/reject` 🛡️ | `ModerationItemSchema`; reddetmede istek `RejectContributionRequestSchema` (`reason`) |
| `POST /admin/users/:id/ban` 🛡️ | `204` |

🔒 `Authorization: Bearer <token>` gerekir; 🛡️ moderatör ya da admin gerekir (`npm run account:create`, sonra `POST /auth/login`); 👑 yalnızca admin.

Hata yanıtları her zaman `{ error: { code, message } }` biçimindedir: `INVALID_QUERY`, `INVALID_ID` (400), `ASSET_NOT_FOUND`, `CITY_NOT_FOUND` (404),
`RATE_LIMITED` (429: IP başına dakikada 120 istek aşıldı; kaç saniye bekleneceği `Retry-After` başlığında).
Ziyaretçi Nabzı uçlarında ayrıca: `INVALID_BODY` (400), `UNAUTHORIZED` (401: token yok ya da geçersiz),
`USER_BANNED`, `FORBIDDEN` (403), `CONTRIBUTION_NOT_FOUND`, `USER_NOT_FOUND` (404), `ALREADY_REVIEWED` (409),
`CONTRIBUTION_LIMIT` (429: kullanıcı başına saatte 5 katkı).
Ziyaret ve başarımlarda ayrıca: `POSITION_REQUIRED`, `TOO_FAR` (400), `VISIT_LIMIT` (429), `ACHIEVEMENT_EXISTS` (409), `ACHIEVEMENT_NOT_FOUND` (404).
Panelde ayrıca: `OWN_ROLE` (400), `UNKNOWN_CODE` (400: tür, il ya da dönem kodu yok), `ASSET_EXISTS` (409: aynı id'li eser var), `USER_NOT_FOUND`, `ASSET_NOT_FOUND` (404: id panelden eklenmiş bir eser değil).
Fotoğraflarda ayrıca: `INVALID_IMAGE` (400: JPEG/PNG değil ya da kenarı 300 px'ten kısa), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `PHOTO_LIMIT` (429), `PHOTO_NOT_FOUND` (404).
Hesaplarda ayrıca: `USERNAME_TAKEN`, `ALREADY_REGISTERED` (409), `INVALID_CREDENTIALS` (401: kullanıcı adı ya da parola yanlış; hangisi olduğu söylenmez), `RATE_LIMITED` (429: IP başına 15 dakikada 10 giriş, saatte 10 kayıt).
Asistanda ayrıca: `INVALID_BODY` (400), `RATE_LIMITED` (429: IP başına dakikada 10 soru), `ASSISTANT_UNAVAILABLE` (503: model tanımlı değil ya da cevap vermiyor), `ASSISTANT_BUSY` (503: aynı anda en çok 2 soru işlenir; biraz sonra tekrar denenir).
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
- **Koordinat** (`coordinates`) yoksa `null`: eser haritada gösterilmez. `verified: false`, konumun yerinde doğrulanmadığını söyler. `approximate: true` (`source: "osm_area"`) noktanın yalnızca eserin mahallesinin ya da köyünün merkezi olduğunu söyler: eseri "yaklaşık burada" diye, örneğin farklı bir işaretle göster. Bu eserlerde ziyaret konumla doğrulanmaz.
- **Külliye** (`parentId`): eser bir külliyenin yapısıysa külliyenin id'si, yoksa ya da külliye yayında değilse `null`. Liste ve harita bu alanla bir külliyenin yapılarını külliyenin altında toplar; ayrıntıdaki `parent` ve `children` aynı bağı adlarıyla verir.
- **Tanınırlık** (`prominence`): kayıtta eserin ne kadar anlatıldığı; bölüm, öne çıkan, rivayet, kişi, zaman çizelgesi olayı ve kitabe sayılarının toplamı. Veride ünü ölçen bir alan olmadığı için onun yerine geçer: harita uzaklaştıkça önce az bilinen eserleri gizler.
- **Görsel** (`cover`, `media[]`) yoksa `cover: null`: yer tutucu görsel gösterilir. Kutu `aspectRatio` ile çizilip `dominantColor` ile boyanır, `lqip` bulanık önizlemedir; `sources.webp` / `sources.jpg` farklı genişlikleri verir. Fotoğrafın çekildiği konum hiçbir yanıtta yer almaz.
- **Erişilebilirlik** değerleri `yes | partial | no | unknown`; `unknown` "Bilgi yok" demektir, "erişilebilir" değil.
- **Bağlar** (`/relations`) iki yönlüdür: `direction: "outgoing"` bağ bu eserin kaydında, `"incoming"` karşı eserin kaydında yazılıdır. İki eserde de yazılı aynı bağ bir kez döner. Karşı eser henüz yayında değilse bağ dönmez, yalnızca `unavailableCount` içinde sayılır ("+3 bağ yakında" gibi gösterilebilir). Her bağın `confidence` ve `sources` alanı vardır.
- **Yakındaki eserler** (`/nearby`) kuş uçuşu mesafeye göre sıralıdır (`distanceMeters`). Eserin koordinatı yoksa `origin: null` ve `items: []` döner.
- **Filtreler** için kodları ve etiketleri `/meta/enums` verir; `assetCount` 0 olan il, tür ve dönemler gizlenebilir. Güven listesi `certain → legend` sırasındadır.
- Tarihler ISO 8601 (`2026-10-16`, `2026-10-16T18:20:00.000Z`).
- **Hava durumu** (`/weather`) Open-Meteo'dan gelir ve 15 dakika önbelleğe alınır. Sağlayıcı 2 saniyede yanıt vermezse `available: false`, `current: null` döner; uygulama hava durumu olmadan çalışmaya devam eder. Yağmur, kar, fırtına ya da 32 °C ve üstünde `advice: "indoor_preferred"` olur. Hava durumunun gösterildiği yerde `attribution` metni (CC BY 4.0) gösterilmelidir.
- **Rota** (`/routes/plan`) en yakından ilerleyen bir yürüyüştür: her adımda süre bütçesine (yürüme + ziyaret) sığan en yakın eser seçilir, tek bacak 3 km'yi geçmez. `advice: "indoor_preferred"` iken açık mekânlar daha uzakmış gibi değerlendirilir, dışlanmaz. `start` verilmezse rota `network` temasında o eserden, diğer temalarda eserlerin en yoğun olduğu yerden başlar (`start.source`). Yürüme süreleri tahminidir (kuş uçuşu × 1,3, dakikada 80 m; `estimateNote`). Veri setinde ziyaret süresi ya da açık/kapalı bilgisi yoksa eser türünden tahmin edilir ve `visitMinutesEstimated` / `settingEstimated` `true` olur. Koordinatı olmayan eserler rotaya girmez, `skippedWithoutCoordinates` içinde sayılır; sığmayanlar `notReachedCount` içindedir. Eşleşen eser yoksa `stops: []` ve `start: null` döner (hata değil).
- **Ortam sesleri** (`ambientSound.recording`, `/meta/sounds`) `data/sounds.json`'dan gelir.
  - **Kayıt:** Eserin ses anahtarı (kendi anahtarı, yoksa türünün) yayındaki bir kayda karşılık geliyorsa `recording` doludur, yoksa `null`; uygulama o zaman kendi yedek sesini çalar.
  - **Altyazı:** `captions` kayda göre yazılmış zamanlı satırlardır; ses çalarken gösterilir.
  - **Atıf:** `credit` ses çalınan her yerde gösterilir (CC BY'de zorunlu).
- **Yöresel lezzetler** (`/cities/:code/dishes`) `data/sehirler/<il>.json`'dan gelir.
  - **Kaynak:** Her lezzet Türk Patent'in coğrafi işaret tescilidir. `geographicalIndication` tescil numarasını, tarihini, tescil ettireni, sicil belgesini (`documentUrl`, PDF) ve portal sayfasını (`portalUrl`) verir. `description` ve `story` bu belgeden özetlenmiştir.
  - **Türler:** `kind`: `main` (ana yemek), `meze`, `dessert` (tatlı), `street` (fırın ve sokak lezzeti).
  - **İlçe:** `district` doluysa lezzet o ilçeye aittir (ör. İnegöl).
  - **Görünürlük:** Eserlerle aynı kuraldır, taslaklar dönmez.
- **Gezi** (`/routes/trip`) Rotalar ekranı içindir. Her gün 09:00'da başlar ve yarım günde 13:30'a, tam günde 17:30'a kadar sürer (tatlı molası dahil).
  - **Önem puanı:** Eserler önem puanına göre seçilir: Kentsel Ağ bağ sayısı × 2 + `highlights` sayısı + fotoğrafı varsa 1 (`importance`).
  - **Günün başlangıcı:** `start` verilmezse gün, 3 km yürüme yarıçapında en çok önem toplayan eserden başlar. Seçilen eserler en yakından ilerlenerek gezilir.
  - **Öğle molası:** Tam günde öğleden sonra biten ilk duraktan sonra gelir (1 saat). Her günün sonunda tatlı durağı vardır (30 dk).
  - **Hava tahmini:** Öğleden sonra yağmur (12:00–18:00 arasında %50 ve üstü) ya da sıcak (32 °C ve üstü) bekleniyorsa açık mekânlar sabaha, kapalı mekânlar öğleden sonraya eğilimlidir.
  - **Günün notu:** `weatherNote.code` havanın planı nasıl etkilediğini söyler (`afternoon_rain`, `heat`, `rain_possible`, `clear`, `unavailable`); `text` aynı şeyi yanıt dilinde anlatır. Tahmin 7 günle sınırlıdır; daha ileri günler havaya bakılmadan planlanır (`weather: null`, `unavailable`).
  - **Birkaç gün:** 2-5 günlük gezide bir eser iki kez yer almaz. İlin eserleri biterse gezi erken biter; `duration` ve `days` planlanan gün sayısını gösterir.
  - **Molalar:** Öğle molasına bir ana yemek (`main`), tatlı durağına bir tatlı (`dessert`) konur (`dish`, `CityDish`). Önce önceki durağın ilçesine ait lezzet, sonra il geneli; gezi boyunca aynı lezzet, uygun başka lezzet kaldıkça tekrarlanmaz. İlin uygun lezzeti yoksa `dish: null`.
  - **Durak sayısı:** Tam günde en çok 10, yarım günde en çok 4 durak vardır. Bir külliye planda varken yapıları ayrı durak olmaz.
  - **Geliş:** Konya'da `arrival` (`konya-gari`, `selcuklu-yht-gari`, `konya-otogari`) verilirse yanıttaki `arrival`, oradan 1. günün ilk durağına nasıl gidileceğini söyler.
  - **Uzun bacaklar:** Aynı gündeki iki durak arası 3 km'yi geçmez (`legMeters`). Konya'da 1 km ve üstündeki bacaklarda otobüs ya da tramvay yürümeye seçenek olarak önerilir (`transit`, OTP); saatler yürüyüşe göre kalır. OTP yanıt vermezse `transit: null` olur.
- **Ziyaretçi Nabzı:**
  - Kullanıcı anonimdir. `POST /auth/anonymous` ile takma ad verir, karşılığında bir token alır. Token yalnızca bir kez döner, API onun yalnızca özetini saklar. İstemci token'ı güvenli depoda tutar (mobilde `expo-secure-store`); kaybolursa yeni oturum açılır.
  - Katkı türleri: `tip` (saha ipucu), `memory` (anı) ve `correction` (editörlere düzeltme). Fotoğraf katkısı şimdilik yok.
  - Metin düz metindir ve `CONTRIBUTION_TEXT_MIN`–`CONTRIBUTION_TEXT_MAX` (10–1000) karakter arasıdır. `normalizeContributionText` API'nin uyguladığı temizliği yapar; karakter sayacı bu fonksiyonla gösterilebilir.
  - Katkı önce `pending` olarak kaydedilir. Nabızda yalnızca moderatörün onayladığı `tip` ve `memory` katkıları görünür; `correction` katkıları hiçbir zaman görünmez.
  - Nabız sırası: önce veri setindeki ipuçları (`origin: official | field_visit | visitor_reviews_summary`), sonra topluluk katkıları (`origin: "community"`, `author` takma ad), yeniden eskiye.
  - Anılar (`kind: "memory"`) saha ipuçlarından ayrı gösterilir. Topluluk içeriği kaynaklı bilgi gibi sunulmaz.
  - Engellenen kullanıcının onaylı katkıları nabızdan kalkar.

## Alanların modüllere karşılığı

| Modül | Alanlar |
|---|---|
| 1. Ziyaret Mührü | `cover` (mühür fotoğrafı, cihazda derlenir), `POST /assets/:id/visit/proof` |
| 2. Taşın Dili | `inscriptions[]` (`transliteration`, `translation`, `arTargetMediaKey`), `waqf` |
| 3. Kentsel Ağ & Sis Açma | `coordinates`, `parentId`, `prominence`, `parent`, `children`, `/assets/:id/relations`, `/assets/:id/nearby` |
| 4. Travel Planner & Hava Durumu | `/routes/trip` (`days[].items`, `weatherNote`), `/routes/plan` (`stops[]`, `totals`), `/weather` (`advice`, `daily`), `coordinates`, `/assets/:id/nearby` |
| 5. Yöresel Kültür & Gastronomi | `/cities/:code/dishes` (`kind`, `story`, `geographicalIndication`, `sources`), `/routes/trip` molalarındaki `dish` |
| 6. Ziyaretçi Nabzı | `visitorTips`, `/assets/:id/pulse`, `/assets/:id/contributions`, `/auth/anonymous` |
| 7. Sesli Zaman Kapsülü | `ambientSound` (`key`, `caption`, `recording`: `url`, `captions[]`, `credit`), `/meta/sounds` |
| 8. Kapsayıcı Erişilebilirlik | `accessibility`, `media[].alt`, `ambientSound.caption` |

## Doğrulama

```bash
npm run typecheck --workspace @vagabonds/contracts # TypeScript kontrolü
npm run contracts:validate                         # uygulama fixture'ları: şema, id eşleşmesi, güncel sürüm
```

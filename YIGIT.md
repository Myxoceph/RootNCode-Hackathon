# Yiğit için: uygulamada yapılacaklar

Backend'de hesaplar, fotoğraf önerileri, yönetim paneli, ziyaretler, başarımlar, ödüller ve cüzdan hazır
(PR #88, #89, #91, #92, #94 ve bu PR). Bu belge uygulama tarafında yapılacakları sırayla anlatıyor.
Bütün şemalar `@vagabonds/contracts`'ta; uçların tam listesi [`packages/contracts/README.md`](packages/contracts/README.md).

Öncelik sırası önerim (demo için en görünür olandan başlayarak):

1. Konum izni ve ziyaret ("Buradayım")
2. Zaman Perdesi ile kanıtlanmış ziyaret
3. Başarımlar ekranı ve rozet bildirimi
4. Cüzdan ve ödüller
5. Giriş / kayıt
6. Fotoğraf öner ve ziyaretçi fotoğrafları
7. Yönetim paneli
8. Haritada yaklaşık konumlar
9. Asistan ekranı (henüz yoksa)

---

## 0. Hazırlık

```bash
git switch dev && git pull
npm install
npx expo install expo-location expo-image-manipulator --workspace @vagabonds/app   # 1. ve 6. madde için
npm run db:deploy --workspace @vagabonds/api && npm run db:import
npm run account:create --workspace @vagabonds/api -- yigit admin    # parola bir kez yazdırılır
```

- `expo-location` ve `expo-image-manipulator` henüz bağımlılıklarda yok; `npx expo install` SDK 58'e uygun sürümü seçer.
- Admin hesabıyla uygulamadan giriş yapınca (5. madde) panel ve bütün uçlar denenebilir. Swagger: `http://localhost:3000/docs`
  → önce `POST /auth/login`, sonra **Authorize**.
- Kimlik: her istek `Authorization: Bearer <token>` (şimdiki anonim oturumla aynı, `src/data/community.ts`).

---

## 1. Konum izni ve ziyaret ("Buradayım")

**Ne:** Uygulama açılışta (ya da ilk ziyaret denemesinde) **konum izni** ister. Eser sayfasında bir
"Buradayım" düğmesi ziyareti kaydeder; ziyaretler başarım kazandırır.

- İzin: `expo-location` → `requestForegroundPermissionsAsync()`. Yalnızca uygulama açıkken konum yeter (arka plan izni gerekmez).
  `app.json`'a eklentiyi ekle ve izin metnini yaz:
  ```json
  ["expo-location", { "locationWhenInUsePermission": "Bir eserin yanında olduğunu doğrulamak ve başarım kazanman için konumunu kullanıyoruz." }]
  ```
  İzin verilmezse uygulama her şeyiyle çalışmaya devam etmeli; yalnızca "Buradayım" ve kanıt devre dışı kalır.
- Ziyaret: `POST /assets/:id/visit` gövde `{ lat, lng }` (`VisitRequestSchema`) → `VisitResponseSchema`.
  - Eserin kesin noktası varsa kullanıcı **200 m** (`VISIT_RADIUS_METERS`) içinde olmalı. Değilse `400 TOO_FAR`
    (mesajda mesafe var: "X m uzaktasın" göster). Konum gönderilmezse `400 POSITION_REQUIRED`.
  - Noktası olmayan ya da yaklaşık noktalı (`coordinates.approximate: true`) eserde konum kontrol edilmez, ziyaret
    `verified: false` olarak kabul edilir. Yine de konumu gönder.
  - `firstVisit: false` → zaten ziyaret edilmiş; "Daha önce buradaydın" gibi.
  - `newAchievements` doluysa rozet bildirimi göster (3. madde).
  - Günde en çok 60 ziyaret (`429 VISIT_LIMIT`).
- Düğmeyi kullanıcı esere yakınsa (ör. 300 m) belirgin göstermek iyi olur; mesafeyi istemcide de hesaplayabilirsin
  (`coordinates` detayda var).

---

## 2. Zaman Perdesi ile kanıtlanmış ziyaret

**Ne:** Kullanıcı Zaman Perdesi'nde hayalet resmi bina ile hizalayıp çektiğinde, uygulama **binayı kamerada
tanırsa** ziyaret "kanıtlanmış" olur. Kanıtlanmış ziyaretler ek başarım (Zaman Yolcusu, Zaman Ustası) verir ve
bazı ödüller için gerekir (`minProvenVisits`).

**Neden senin MindAR'ın:** Taşın Dili'ndeki `MarkerTracker` (WebView + MindAR) tam bunu yapıyor. Fark: Zaman
Perdesi'nin hedefini önceden derlemek yerine **hayalet resmin kendisini cihazda derliyoruz**. Böylece her eser
için `.mind` dosyası üretip R2'ye yüklemek gerekmez.

Adımlar:

1. **Hedefi cihazda derle.** `apps/app/scripts/mindar-compiler.mts`'teki kodun aynısı WebView'da çalışır:
   ```js
   const compiler = new window.MINDAR.IMAGE.Compiler();
   await compiler.compileImageTargets([img], (progress) => post({ type: "compile-progress", progress }));
   const mind = compiler.exportData();   // Uint8Array → base64 ile React tarafına
   ```
   - Görsel: şablonun (arşiv fotoğrafı, yoksa kapak; `time-curtain.tsx`'teki `template`) **~1280 px JPEG** sürümü
     (`media.sources.jpg` içinden). Daha büyüğü derlemeyi yavaşlatır.
   - Derleme birkaç saniye sürer: "Eser hazırlanıyor…" göster. Sonucu eser id'si + `media.key` ile önbelleğe al
     (`expo-file-system` ya da AsyncStorage; base64 birkaç yüz KB) ki ikinci açılışta beklenmesin.
   - Görsel WebView'da yüklenemezse (CORS) bana söyle; `media.allbytech.com` Worker'ına başlık ekleriz.
2. **Takip et.** `MarkerTracker`'a `targetsMind` olarak bu base64'ü ver; hayalet resim üstte yarı saydam kalsın.
   `targetFound` olayı gelince (ve ~1 sn sürerse, yanlış pozitif olmasın diye) kanıtı gönder.
3. **Kanıtı gönder:** `POST /assets/:id/visit/proof`, gövde (`VisitProofRequestSchema`):
   ```json
   { "lat": 40.18, "lng": 29.06, "mediaKey": "<template.key>", "method": "device_recognition" }
   ```
   - `mediaKey`: derlediğin fotoğrafın detaydaki `media[].key` değeri. Anahtarlar eser içinde `m01`, `m02`… diye
     numaralı; **bu eserin** `media` listesindeki değeri gönder.
   - Konum kuralı ziyaretteki gibi (1. madde). Ziyaret yoksa API onu da kaydeder; ayrıca "Buradayım" gerekmez.
   - Yanıt `VisitResponseSchema` (`proven: true`, `newAchievements`). Hatalar: `400 UNKNOWN_MEDIA`, `TOO_FAR`.
4. **Deneyim:** kanıtlanınca "Ziyaretin kanıtlandı ⏳" ve kazanılan rozetler; sonra mevcut perde (önce/sonra) ekranına geç.
5. **Web ve ekran okuyucu:** web'de ve ekran okuyucu açıkken kamera yok (ADR 0001); kanıt gösterilmez, ziyaret 1. maddeyle yapılır.
6. **İlk test:** Ulucami (ya da yakındaki herhangi bir eser) kapak fotoğrafıyla, aynı açıdan. Kitap fotoğrafları bazen
   yukarıdan ya da uzaktan çekilmiş; tanımazsa bana yaz, o eser için zeminden çekilmiş bir fotoğrafı şablon yaparız.

> Bu kanıt telefonda yapılır; API sonucu doğrulayamaz (uygulamayı kurcalayan biri isteği taklit edebilir). Rozet ve
> pilot ödüller için yeterli; ileride değerli ödüller için sunucuda fotoğraf eşleştirme (`proof_method: server_match`) ekleriz.

---

## 3. Başarımlar ekranı ve rozet bildirimi

- Liste ve ilerleme: `GET /me/achievements?lang=` → `MyAchievementsResponseSchema`
  (`totalPoints`, `visits`; her başarımda `badge` (emoji), `title`, `description`, `points`, `earnedAt`,
  `progress: { current, target }`). Kazanılanlar üstte, kalanlar ilerleme çubuğuyla.
- Bildirim: ziyaret ve kanıt yanıtlarındaki `newAchievements` → kısa bir kutlama (rozet + başlık + puan).
  Ekran okuyucu için duyur (`AccessibilityInfo.announceForAccessibility`).
- Onaylanan not ve fotoğraf başarımları bu çağrıda kaydedilir; ekran açılınca çağırmak yeterli.
- Profil sekmesine "Başarımlarım" ve toplam puan.
- Tam liste ve gereksinimler: [`docs/achievements.md`](docs/achievements.md).

---

## 4. Cüzdan ve ödüller

- Cüzdan: `GET /me/wallet` → `balance`, `earned`, `spent`, `provenVisits`, `redemptions[]` (alınan kodlar).
- Katalog: `GET /rewards?lang=` → her ödülde `title`, `partner`, `kind` (`merch`, `museum`, `discount`, `experience`),
  `costPoints`, `minProvenVisits`, `stock`, `sample`.
  - `sample: true` ise "Örnek ödül (pilot)" etiketi göster; arkasında gerçek anlaşma yok.
  - Düğme durumu: bakiye yetmiyorsa, kanıtlanmış ziyaret eksikse ya da `stock: 0` ise pasif ve nedenini yaz.
- Alma: `POST /rewards/:code/redeem` → `RedeemResponseSchema` (`redemption.code` = tek kullanımlık kod, yeni `balance`).
  - Önce onay sor ("150 puan harcansın mı?").
  - Hatalar (409): `INSUFFICIENT_POINTS`, `PROVEN_VISITS_REQUIRED`, `OUT_OF_STOCK`.
  - Anonim kullanıcı kod alamaz: `403 ACCOUNT_REQUIRED`. Düğmede "Ödül almak için hesap aç" yaz ve 5. maddedeki
    `POST /auth/upgrade`'e götür; kazanılan puanlar korunur (`AppUser.username` `null` ise düğmeyi baştan böyle göster).
  - Kodu büyük ve kopyalanabilir göster; istersen QR (`react-native-qrcode-svg`, sürümü en az 2 haftalık olsun).
- "Puanlar parayla alınamaz, paraya çevrilemez" notu cüzdan ekranında dursun.
- Anlatım: [`docs/rewards.md`](docs/rewards.md).

---

## 5. Giriş / kayıt (PR #88)

- Kayıt: `POST /auth/register` `{ username, password, nickname? }` → `SessionResponseSchema` (`user`, `token`).
- Giriş: `POST /auth/login` `{ username, password }` → aynı. Her giriş yeni bir token verir (cihaz başına oturum).
- Çıkış: `POST /auth/logout` (yalnızca bu cihaz).
- Anonimden hesaba: `POST /auth/upgrade` `{ username, password }` → notlar ve oturum korunur. Ayarlar'da
  "Hesap aç" olarak göster (zaten takma adla not bırakmış kullanıcı için).
- Hatalar: `USERNAME_TAKEN` (409), `ALREADY_REGISTERED` (409), `INVALID_CREDENTIALS` (401), `RATE_LIMITED` (429).
- Kullanıcı adı: 3–32 karakter, küçük harf, rakam, `_`, `.` (`UsernameSchema`); parola 8–128 (`PASSWORD_MIN/MAX`).
- `AppUser.username` anonimde `null`; `role`: `visitor`, `moderator`, `admin`. Telefonda saklı eski oturumlar
  okunmaya devam eder (alanın varsayılanı var).

---

## 6. Fotoğraf öner ve ziyaretçi fotoğrafları (PR #89)

- Eser sayfasına "Fotoğraf öner": `expo-camera` ile çek (ya da galeriden seç), `expo-image-manipulator` ile
  uzun kenarı ~2000 px, JPEG %80'e küçült (5 MB sınırı ve hız için), sonra:
  ```ts
  fetch(`${apiUrl}/assets/${id}/photos?caption=${encodeURIComponent(caption)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
    body: blob,   // gövde dosyanın kendisi; multipart değil
  })
  ```
  - `caption` zorunlu (3–200 karakter); ekran okuyucu metni olarak da kullanılır, formda bunu açıkla.
  - Yanıt `ContributionSchema` (`kind: "photo"`, `status: "pending"`). Hatalar: `INVALID_IMAGE`,
    `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `PHOTO_LIMIT` (günde 10).
- "Notlarım"da fotoğraf: `photo.path` imzalı, süreli adres → `${apiUrl}${photo.path}`.
- Eser sayfasında "Ziyaretçi fotoğrafları": `GET /assets/:id/photos` → `items[]` (`path`, `caption`, `author`).
  Eserin kendi galerisinden **ayrı** göster ve yazarın takma adını yaz.
- Sunucu EXIF'i (GPS dahil) siliyor; istemcide ayrıca bir şey gerekmez.

---

## 7. Yönetim paneli (PR #91, #92 ve bu PR)

Yalnızca `role` `moderator` ya da `admin` olan kullanıcıya görünen bir ekran grubu (`/admin`). Rol değişikliği ve
eser, başarım ve ödül işlemleri **yalnızca admin**; moderatör inceleme kuyruğunu ve kullanıcıları görür.

| Ekran | Uçlar |
|---|---|
| Özet | `GET /admin/summary` (bekleyen not ve fotoğraf sayıları, kullanıcılar, panel eserleri) |
| İnceleme kuyruğu | `GET /admin/contributions?status=pending&kind=notes` ya da `kind=photos`, `POST …/:id/approve`, `POST …/:id/reject` `{ reason }` (fotoğrafta `photo.path` imzalı); kendi katkısında `403 OWN_CONTRIBUTION`, düğmeleri gizle |
| Kullanıcılar | `GET /admin/users?q=&role=`, `POST /admin/users/:id/role` `{ role }`, `POST /admin/users/:id/ban`, `POST /admin/users/:id/unban` |
| Eser ekle | `GET /admin/assets`, `POST /admin/assets` (ad, tür, il, ilçe, dönem, özet, tanıtım, tarih, bani, adres, koordinat, `status`), `PATCH /admin/assets/:id`, `DELETE /admin/assets/:id`; kodlar `GET /meta/enums`'tan |
| Başarımlar | `GET`/`POST /admin/achievements`, `PATCH`/`DELETE /admin/achievements/:code` (kural türleri `docs/achievements.md` sonunda) |
| Ödüller | `GET`/`POST /admin/rewards`, `PATCH /admin/rewards/:code`, `POST /admin/rewards/:code/codes` `{ codes: [...] }` |

Kübra'nın tasarımıyla çakışmasın diye panelde sade bileşenler yeterli; web'de kullanılacağı için tablo düzeni iyi olur.

---

## 8. Haritada yaklaşık konumlar (PR #94)

`coordinates.approximate: true` olan eserin noktası yalnızca mahalle ya da köy merkezi (ya da yanındaki bilinen yapı).
Haritada farklı bir işaretle (ör. içi boş daire) göster ve detayda "Konum yaklaşık" yaz. Bu eserlerde
"Buradayım" mesafe kontrolü yapılmaz (1. madde).

---

## 9. Asistan ekranı (henüz yoksa)

- Görünürlük: `GET /chat/status` → `available: false` ise sohbet girişlerini gizle.
- Soru: `POST /chat` `{ message, assetId?, history (son 6 tur), lang }` → `answer` (düz metin, `[n]` işaretli),
  `citations[]` (`kind`: `asset`, `dish`, `trip`, `weather`; `id` ile ilgili sayfaya git), `grounded`,
  `attachments.trip` (Rotalar ekranındaki planın aynısı).
- Eser sayfasındaki "Bu eser hakkında sor" `assetId` gönderir.
- `503 ASSISTANT_BUSY` → kısa süre sonra tekrar dene; `ASSISTANT_UNAVAILABLE` → "Asistan şu an kapalı".

---

## 10. Haritada kişisel sis: ziyaret edilen eserler açık

**Ne:** Harita şimdi her eseri kilitli mühür olarak gösteriyor. Giriş yapmış kullanıcının ziyaret ettiği eserlerin
sisi kalkmalı, mühür açılmalı; ziyaret edilmemişler kilitli kalır.

- Liste: `GET /me/visits` (oturum gerekli) → `MyVisitsResponseSchema`: `items[]` her ziyaret edilen eser için
  `assetId`, `visitedAt`, `verified` (konum yerinde doğrulandı), `proven` (Zaman Perdesi ile kanıtlandı). Yeniden eskiye.
- Harita açılınca ve bir ziyaret ya da kanıt başarılı olunca (`POST /assets/:id/visit` ve `/visit/proof`) listeyi yenile;
  yanıtı beklemeden yeni eseri hemen açık say.
- Giriş yoksa (ya da anonim kullanıcı hiç ziyaret etmediyse) her şey kilitli kalır; çağrı `401` dönerse boş liste say.
- Külliye tek mühürle görünüyorsa (`parentId`), külliyenin kendisi ya da yapılarından biri ziyaret edildiyse mühür açılabilir.
- `proven` eserlere ayrı bir işaret (ör. altın çerçeve) iyi durur.
- Demo hesabı `gezgin`: Bursa'da 43, Hatay'da 4 eser ziyaret edilmiş, Ulucami ve Koza Han kanıtlı; Konya bilerek boş.

---

## 11. Asistanda toplu taşıma rotası (Konya pilotu)

**Ne:** Konya'da "Karatay Medresesi'ne nasıl giderim?" sorusunun cevabının altında tıklanabilir küçük bir rota
önizlemesi; tıklanınca Konya haritası açılır pencerede açılır, üstünde yürüme, otobüs ve tramvay bacakları,
binilecek ve inilecek duraklar ve saatler görünür. Diğer illerde rota yok (asistan "pilot Konya'da" der).

- **Konum:** izin varsa `POST /chat` isteğine `origin: { lat, lng }` ekle (saklanmaz). Yoksa asistan nereden
  başlanacağını sorar; kullanıcı gar, YHT garı, otogar ya da bir eser söyleyebilir.
- **Veri:** yanıttaki `attachments.transit` (`TransitPlanResponseSchema`), `null` değilse önizlemeyi göster.
  `itineraries[]` en çok 3 seçenek, soonest first; her birinde `departure`, `arrival`, `durationMinutes`,
  `walkMeters`, `transfers`, `legs[]`.
- **Bacak:** `mode` (`walk`, `bus`, `tram`), `from` / `to` (`name`, `lat`, `lng`, durakta `stopCode`),
  `departure` / `arrival` (ISO, +03:00), `line` (`name`: gösterilecek ad, otobüste `56-A`, tramvayda "Alaaddin – Selçuk
  Üniversitesi tramvayı" ya da "Adliye – Alaaddin tramvayı"; `code`: tarifedeki kod, `color` varsa), `headsign` (yön),
  `stopsBetween`, `path` (çizim için `[lat, lng]` noktaları).
- **Önizleme (sohbet balonu):** harita karosu gerekmez; seçilen seçeneğin `path`'lerini küçük bir SVG'ye çiz
  (yürüme kesikli gri, otobüs ve tramvay `line.color` ya da tema rengi), yanına "56-A · 21 dk · 10:05" gibi bir satır.
- **Açılır pencere:** mevcut MapLibre haritası; bacakları çiz, biniş ve iniş duraklarına işaret koy, başlangıç ve
  hedefe ayrı işaret. Altta adım adım liste: "10:05 Millet durağında 56-A'ya bin (Alaaddin yönü), 3 durak,
  10:19 Alaaddin Turnike 1'de in, 370 m yürü". Seçenekler arasında geçiş (sekme ya da kaydırma).
- **Sabah:** `searchedFrom` sorulan saatten farklıysa (gece sefer yok) "İlk seferler sabah" notu göster.
- **Kaynak:** altta `source.name` · `source.timetable` · `source.license` (ör. "Konya Büyükşehir Belediyesi Açık
  Veri · Kasım 2025 tarifesi · CC BY 4.0").
- **Yenile:** "Sonraki seferler" için `GET /transit/plan?from=<lat,lng|konya-gari|eser id>&to=<eser id>&at=<ISO>`
  aynı şemayı döner. Giriş noktaları `GET /transit/entry-points`.
- **Erişilebilirlik:** önizlemeye `accessibilityLabel` ("Karatay Medresesi'ne rota: 56-A otobüsü, 21 dakika"),
  adım listesi ekran okuyucuyla okunabilir olsun; haritasız da anlaşılır.

---

Takıldığın bir yer, eksik ya da garip bir yanıt olursa bana yaz; API'de değişiklik gerekirse hemen yaparım.

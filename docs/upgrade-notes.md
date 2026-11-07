# Güncelleme Notları

`dev`'i çektikten sonra **bir kez** yapılması gereken adımlar. En yeni not en üstte.
Yeni bir kurulum gerekiyorsa (paket, ortam değişkeni, migration…) PR'ı açan kişi buraya bir madde ekler.

Her `git pull` sonrası kısa kontrol: aşağıda kendi son çektiğin tarihten yeni bir not var mı?

---

## 2026-11-07 · Taşın Dili ve Taşa Sor tek ekranda (sözleşme 0.3.35)

Kimler: **API'yi çalıştıranlar** (sunum sunucusu dahil), **uygulama ekibi**

1. API'yi yeniden başlat (sunum makinesinde `deploy/demo.sh up`); migration ya da yeni paket yok.

Değişenler:

- Taşın Dili'nde 10 sn kitabe bulunamazsa "Asistana danış" çıkar; aynı kameranın o anki karesi asistana gider, cevap ekranda yazılı görünür ve sesli okunur.
- `POST /vision/ask`'te `assetId` artık isteğe bağlı. Eser bilinmiyorsa cevap yalnızca fotoğraftan gelir, kaynak işareti olmaz.
- Eser sayfasında "Taşa Sor" satırı kalktı; "Taşın Dili" kitabesi tanınamayan eserde doğrudan soru kamerasını açar.

---

## 2026-11-07 · Anı Defteri: hikâye olarak paylaşma

Kimler: **uygulamayı çalıştıranlar**, **uygulamayı derleyenler**

1. `npm install` (yeni paketler: `expo-sharing`, `react-native-view-shot`).
2. Expo Go'da başka bir şey gerekmez. Kendi derlemesini (APK, dev client) kullananlar yeniden derler: iki paket de yerel modül.

Değişenler:

- Anı Defteri'nde her sayfanın altında paylaş düğmesi. Sayfa 1080×1920 bir hikâye görseline dönüşür, önce önizlemesi gösterilir, sonra sistemin paylaşım menüsü açılır (WhatsApp, Instagram hikâyesi…).
- Yeni bir anı kaydedilince birkaç saniye "Paylaş" önerisi çıkar.
- Yalnızca iOS ve Android'de. Web'de düğme gösterilmez (`src/lib/share-image.ts`).

---

## 2026-11-07 · Hesap silme (sözleşme 0.3.34)

Kimler: **API'yi yerelde çalıştıranlar**

1. API'yi yeniden başlat; migration ya da yeni paket yok.

Değişenler:

- `POST /auth/delete-account`: parolayla doğrulanır, hesabı ve ona bağlı tüm kayıtları siler. Moderatör ve yönetici hesapları, inceleme yapmış eski moderatörler de silinemez (`STAFF_ACCOUNT`).
- Profil'de ziyaretçilere "Hesabımı sil" düğmesi.

---

## 2026-11-07 · Anı Defteri (sözleşme 0.3.33)

Kimler: **API'yi yerelde çalıştıranlar**, **sunucuyu yöneten**, **uygulamayı derleyenler**

1. Herkes: `npm install` (yeni paketler: `expo-image-picker`, `@expo-google-fonts/caveat`).
2. API'yi yerelde çalıştıranlar: `npm run db:deploy -w apps/api`, `npm run prisma:generate -w apps/api`, API'yi yeniden başlat.
3. Sunucuyu yöneten: `npm run db:deploy` dışında ayar yok. Yedekler defter fotoğrafları kadar büyür (ADR 0004).
4. Telefondaki uygulama yeniden derlenmeli: `expo-image-picker` yerel modül, ayrıca uygulama artık yalnızca dikey çalışıyor (`app.json`, `orientation`).

Değişenler:
- `/me/journal` uçları ve `/journal-photos/:id/:size` (yalnızca imzalı adresle). Profil'de "Anı Defteri" satırı.
- Sayfalar elle düzenlenebilir ve üzerine çizim yapılabilir: `journal_entry.layout`, `has_drawing` (üç migration var, hepsi `db:deploy` ile gelir).
- Sayfalara sticker eklenebilir. Çizimler uygulamanın içinde (`lib/journal-stickers.ts`), sayfaya yalnızca adı kaydedilir; yeni kurulum gerekmez.
- Profil yeniden düzenlendi: defter en üstte açık kitap olarak durur, Profil sayfalarının üst çubuğunda başlık yazmaz. Haritanın "kaldığın yer" perdesi de yenilendi.
- Fotoğraflar herkese açık R2'ye gitmez, veritabanında durur: gerekçe `docs/decisions/0004-ani-defteri.md`.

---

## 2026-11-06 · Mühür sekansı ve yeni kapsül sesleri

Kimler: **Mobil geliştirenler**, **Kübra (metinler)**

1. Herkes: `npm install` (yeni paket: `expo-haptics`, damga vuruşunda titreşim).

Değişenler:

- İlk ziyarette damgadan sonra "Zamanı aç" / "Sessiz geç" çıkar; "Zamanı aç" 24 saniyelik sekansı başlatır (`components/seal-sequence.tsx`). Sahne metinleri eserin kaydından seçilir (`lib/seal-scenes.ts`), yeni içerik yazılmaz.
- Telefonda eser sayfasındaki "Sesini dinle" yerine, mühürlenince "Zamanı yeniden aç" gelir. Web'de "Sesini dinle" aynen durur.
- Rozet kutlaması mühür ekranında sekans bitene kadar bekler (`holdBadges`).
- Eski sentez sesler kaldırıldı. 10 yeni ses (Google Flow Music, 25 sn, aynı seviyeye eşitlenmiş) uygulamanın içinde: `apps/app/src/audio/capsules/`. Altyazılar henüz bu müziklere göre yazılmadı. Bir sesi değiştirmek yeni APK gerektirir.

---

## 2026-11-06 · Gezi planı gardan ilk durağa yolu söylüyor

Sözleşme 0.3.32: gezi planına `arrival` eklendi. Kurulum adımı yok; yeni gezileri eski APK okuyamaz, yeni APK gerekir.

## 2026-11-06 · Yöresel lezzetler 29'dan 131'e çıktı

Türk Patent coğrafi işaret kayıtlarından 102 yeni yemek ve tatlı eklendi.

- Yerelde: `npm run db:import`. Sunucu güncellemede kendisi alır.

## 2026-11-06 · Gezi planında günlük durak sınırı ve toplu taşıma

Sözleşme 0.3.31: gezi duraklarına `transit` eklendi. Kurulum adımı yok; yeni gezileri eski APK okuyamaz, yeni APK gerekir. Yerelde toplu taşıma önerisi için `OTP_URL` gerekir, yoksa plan yalnızca yürüyüş gösterir.

## 2026-11-06 · Gezi planı 5 güne ve ileri tarihlere çıktı

Sözleşme 0.3.30: `TripDuration` artık `half` ve `1`-`5`. Kurulum adımı yok; yeni planları eski APK okuyamaz, yeni APK gerekir.

## 2026-11-06 · Mühür fotoğrafları yerden çekilebilir olanlardan seçiliyor

Yüksekten çekilmiş 50 fotoğraf `aerial` etiketi aldı, Yeşil Külliye'ye Yeşil Camii'nin çinili kapısı eklendi.

- Yerelde: `npm run db:import`. Sunucu güncellemede kendisi alır.
- Çıktıyla sunum için güncel PDF'teki fotoğrafları kullanın; Yeşil Külliye'nin mühür fotoğrafı artık kubbe değil, çinili kapı.

## 2026-11-06: Basılı fotoğrafla Ziyaret Mührü

`DEMO_UNLOCK` açıkken mühür konuma bakmıyor: eserin mühür fotoğrafı kâğıttan ya da slayttan kameraya gösterilince ziyaret mühürlenir.

- Telefondaki uygulama yeniden derlenmeli; eski sürüm 200 m kontrolünü kendisi yapıp reddeder.
- Sunucuda bir şey yapmak gerekmiyor (`DEMO_UNLOCK` varsayılan olarak açık).
- Kapatmak için: sunucunun `deploy/compose.yml` ve `deploy/.env` dosyalarına `DEMO_UNLOCK=false`.

## 2026-11-06 · Panelden fotoğraf yükleme (sözleşme 0.3.29)

Kimler: **API'yi yerelde çalıştıranlar**, **sunucuyu yöneten**, **Kübra (panel)**

1. API'yi yerelde çalıştıranlar: `npm install` (yeni paketler: `sharp`, `aws4fetch`), `npm run db:deploy -w apps/api`,
   `npm run prisma:generate -w apps/api`, API'yi yeniden başlat. Yerelde R2 anahtarı yoksa yükleme 503 döner, normaldir.
2. Sunucuyu yöneten: R2 yazma anahtarı ve `deploy/.env`: `docs/deploy.md`, "Panelden fotoğraf yükleme".
3. Kübra: "Fotoğraflar" adımı, `KUBRA.md` §1.

Değişenler:
- `POST /admin/assets/:id/media` (yalnızca admin; gövde JPEG, PNG ya da WebP, en çok 15 MB, kenar ≥ 300 px) ve
  `DELETE /admin/assets/:id/media/:key` (yalnızca panelden yüklenenler).
- İçe aktarma panelden yüklenen fotoğraflara dokunmaz (`asset_media.panel_upload`).

---

## 2026-11-06 · Panel: fotoğrafın dosyadaki yeri, notların İngilizcesi, dosyaya yeni bölümler (sözleşme 0.3.28)

Kimler: **API'yi yerelde çalıştıranlar**, **Kübra (panel)**

1. API'yi yerelde çalıştıranlar: `npm run db:deploy -w apps/api` (`asset_media.dossier_after`, yeni tablo `asset_custom_block`),
   sonra `npm run prisma:generate -w apps/api` ve API'yi yeniden başlat. Sunucu bunu kendisi yapıyor.
2. Kübra: panelde `placements` ve `CustomBlockDraft`'ı `record.media[].dossierAfter` ve `record.customBlocks`'a bağla.
   Notların İngilizcesi bağlandı (`note: { tr, en } | null`), `forServer` kaldırıldı.

Değişenler:
- `GET /assets/:id`: her fotoğrafta `dossierAfter`, ayrıca `customBlocks` (`{ id, title, body, after }`, dile göre);
  `alternateNames[].note` ve `architect.candidates[].note` `lang=en`'de İngilizce.
- Veri seti: `media[].dossier_after`, `custom_blocks[]`, `note_en` isteğe bağlı alanlar.
- Panelden veri setindeki bir esere yapılan değişiklik yine yalnızca veritabanında durur: sonraki `import_to_db.py`
  (sunucuda her güncelleme) siler. Kalıcı olması için kayda da yazılmalı.

---

## 2026-11-05 · Web: kamera yok, yeni ana sayfa

Kimler: **uygulamayı çalıştıranlar**

1. `npm install` (uygulamaya yeni paketler: `toqr`, `expo-asset`)
2. İsteğe bağlı: ana sayfadaki QR kodun açacağı Expo Go bağlantısı için `EXPO_PUBLIC_APP_URL`
   (ör. `exp://u.expo.dev/...`). Verilmezse sayfa ağdaki geliştirme sunucusunu (`exp://<ip>:8081`)
   kullanır; `localhost`'tan açıldığında QR yerine "yakında" yazar.

Değişenler:
- Web'de kamera deneyimi yok: Kamera sekmesi, Ziyaret Mührü, Taşın Dili ve Taşa Sor yalnızca mobilde.
  Haritada "Kilidini aç" web'de "mobil uygulamada açılır" uyarısı gösterir (bkz. ADR 0001 güncellemesi).
- Web'de `/` artık ana sayfa: laptop siteye (haritaya), telefon uygulamayı edinme penceresine götürür.
  Hesap istemez; mobilde açılıştaki "Merhaba" karşılaması aynen duruyor.

---

## 2026-11-04 · Başarım görselleri ve panelde İngilizce

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:deploy --workspace @vagabonds/api` (yeni tablo: `achievement_image`)
2. API'yi yeniden başlat.

Değişenler:
- Admin panelinde başarım ve ödül eklerken/düzenlerken başlık ve açıklama İngilizce de yazılabiliyor. Önceden
  düzenleme İngilizceyi siliyordu; artık yalnızca Türkçe gönderilirse İngilizce korunur.
- Başarımlara panelden kare bir JPEG/PNG rozet görseli yüklenebiliyor (`PUT /admin/achievements/:code/image`);
  uygulama görseli emoji yerine daire içinde çizer. Sözleşme `0.3.27`: başarımlarda `imageUrl`, admin
  yanıtlarında `titleEn` / `descriptionEn`.

---

## 2026-11-03 · Kitap fotoğraflarına alt metin (ekran okuyucu için)

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`

Değişenler:
- 242 kayıtta "<eser> fotoğrafı" kalıbındaki 801 alt metin, fotoğrafta ne göründüğünü anlatan kısa Türkçe ve İngilizce
  bir cümleyle değişti (ortalama 16 kelime). Metinleri EVREN'in görüntü modeli (`qwen3-vl-30b`) yazdı; yaygın kelime
  hataları (kalligrafi → hat, fayans → çini, portik → revak…) yazarken düzeltildi. Tek tek okunmadı: yanlış bir ayrıntı
  görürsen kayıtta `alt` alanını düzeltip `npm run db:import` yeter.

---

## 2026-11-03 · Kitap fotoğrafları etiketlendi (ne gösterdikleri)

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`

Değişenler:
- 237 kayıtta sınıflanmamış (`subject: "photo"`) 794 kitap fotoğrafına ne gösterdiği yazıldı (dış cephe, iç mekân,
  taçkapı, kitabe, mihrap…). Etiketleri EVREN'in görüntü modeli (`qwen3-vl-30b`) verdi; mevcut etiketli 102 fotoğrafta
  %67 birebir doğru, bir parça (taçkapı, kitabe, mihrap…) dediğinde %94 gerçekten bir parça.
- Ziyaret Mührü artık 252 eserde bir parçayı (önce 146), 405 eserde binanın bir görünümünü tanıtıyor; "Genel görünüm"
  yedeğine düşen 3 eser kaldı. Bütün fotoğrafları "havadan" çıkan 5 eser, mührünü kaybetmesin diye etiketsiz bırakıldı.

---

## 2026-11-03 · Kilidi aç ziyaret sayılıyor, etkinlik puanı ve not rozetleri (sözleşme 0.3.26)

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:deploy -w apps/api` (iki yeni not rozeti), sonra API'yi yeniden başlat. Sunucu bunu kendisi yapıyor.

Değişenler:
- "Kilidi aç" artık API'ye kanıtsız bir ziyaret yazıyor (`POST /assets/:id/visit/unlock`): ziyaret, rozet ve puan
  profilde görünüyor. Telefonda önceden açılmış olanlar ilk açılışta API'ye gönderiliyor. Ziyaret Mührü'nde
  fotoğraf zorunlu olunca `DEMO_UNLOCK=false` ile kapatılacak (şimdilik açık).
- Puan artık yalnızca rozetlerden gelmiyor: ziyaret 10, mühür +10, onaylanan not 5, onaylanan fotoğraf 10
  (`ACTIVITY_POINTS`, `docs/achievements.md`). Cüzdan bakiyesi de bunu sayıyor.
- `GET /me/achievements` yeni alanlar: `activityPoints`, `sealed`, `notes` ve `photos` (onaylanan, bekleyen).
- CORS artık `PUT`'a izin veriyor (profil fotoğrafı, `PUT /me/avatar`).

---

## 2026-11-03 · Hesap profili: e-posta, ad soyad, profil fotoğrafı (sözleşme 0.3.25)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. API'yi yerelde çalıştıranlar: `npm run db:deploy -w apps/api` (yeni migration `20261103180000_account_profile`),
   sonra API'yi yeniden başlat. Sunucu bunu kendisi yapıyor.

Değişenler:
- Kayıt ve anonimden hesaba geçiş artık e-posta istiyor (`email`); bir e-postayla tek hesap açılır (`409 EMAIL_TAKEN`).
  Daha önce açılmış hesapların e-postası boş kalır, giriş etkilenmez.
- Yeni uçlar: `PATCH /me` (takma ad, ad soyad), `PUT /me/avatar` ve `DELETE /me/avatar` (profil fotoğrafı),
  `GET /avatars/:userId` (yalnızca `/me`'nin verdiği imzalı adresle).
- Uygulama: kayıt formunda e-posta alanı; Profil'deki kart fotoğrafı ve adı hesaptan alıyor. Ekranlar için `KUBRA.md` §6.

---

## 2026-11-03 · Üst üste binen eserler: hanların mescitleri ve bitişik yapılar bağlandı

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import` (21 kayda `parent_id` eklendi, 5'inin noktası değişti).

Değişenler:
- Han mescitleri hanlarına, avludaki kümbetler camiye, çeşmeler ve türbeler bitişiğindeki camiye ya da medreseye
  bağlandı; harita onları ana eserin kartında gösteriyor.
- Haritada birbirine bağlı olmayan ve 25 metreden yakın eserler en az 30 metre ayrılarak çiziliyor (`src/map/spread.ts`).

---

## 2026-11-04 · Taşa Sor (sözleşme 0.3.24)

Kimler: **API'yi yerelde çalıştıranlar**, **demoyu açan**, **uygulama ekibi**

1. API'yi yerelde çalıştıranlar: `apps/api/.env`'e `VISION_MODEL=qwen3-vl-30b` ekle (EVREN anahtarı
   aynı), API'yi yeniden başlat.
2. Demoyu açan: `deploy/demo.sh up` yeter; compose EVREN'in görüntü modelini varsayılan alıyor.
3. Uygulama ekibi: `npm install` (uygulamaya `expo-image-manipulator` eklendi; Expo Go'da hazır).
   Kamera izni metni değişti (`app.json`); APK yeniden derlenmeli.

Değişenler:
- Eser sayfasında, telefonda, "Taşa Sor": kamerayla bir detayı çek, deklanşörle "Bu ne?" ya da
  mikrofonla sor; cevap eserin kaydına dayanır, ekranda yazılı görünür ve sesli okunur
  (`POST /vision/ask`, ayrıntılar `docs/deploy.md`, "Taşa Sor").
- "Sesli betimle" (eser sayfası) ve haritadaki "Betimle" artık Rehber'in EVREN sesiyle okuyor;
  sayfadan çıkınca ya da başka esere geçince duruyor.

---

## 2026-11-03 · Kaydettiklerim: yemek önerileri ve ulaşım tarifleri hesapta (migration, sözleşme 0.3.23)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. `npm run db:deploy --workspace @vagabonds/api` (`user_route` yeni türleri kabul eder).

Değişenler:
- `/me/routes` artık `food` ve `transit` türlerini de saklıyor. Uygulama, Rehber'in yemek önerisi ve toplu taşıma
  cevaplarını kendiliğinden kaydediyor; aynı yemekler ya da aynı güzergâh yeniden sorulunca öncekinin yerine geçiyor.
- Profil'deki Rotalarım satırı **Kaydettiklerim** oldu; sayfada Rotalar, Yemek ve Ulaşım sekmeleri var.
- Her öneri hangi rota ya da eser için alındıysa `about` alanında onu taşıyor; sekmelerde onun altında gruplanıyor
  ve rotanın kendi sayfasında da görünüyor.
- Rehber, "bu rotada ne yenir" gibi yemek, ulaşım ya da hava sorularında artık yeni plan çıkarmıyor (`mayPlanTrip`).
- `/me/routes` cevabındaki `items` yeni türler içerebilir: bu listeyi okuyan kod `kind`'a bakmalı.

---

## 2026-11-03 · Sesli Rehber (sözleşme 0.3.22)

Kimler: **API'yi yerelde çalıştıranlar**, **demoyu açan**, **uygulama ekibi**

1. API'yi yerelde çalıştıranlar: `apps/api/.env`'e `VOICE_ASR_MODEL=qwen3-asr-1.7b` ve
   `VOICE_TTS_MODEL=voxcpm2` ekle (EVREN anahtarı aynı), API'yi yeniden başlat.
2. Demoyu açan: `deploy/demo.sh up` yeter; compose EVREN'in ses modellerini varsayılan alıyor.
3. Uygulama ekibi: `npm install` (uygulamaya `expo-file-system` eklendi; Expo'yla zaten geliyordu)
   ve mikrofon izni eklendi (`app.json`). Expo Go'da hemen çalışır; APK yeniden derlenmeli.

Değişenler:
- Rehber'de yazma alanı boşken gönder düğmesinin yerinde mikrofon var. Dokun, sor, tekrar dokun:
  soru yazıya çevrilir (`POST /voice/transcribe`), kısa ve konuşur gibi cevap gelir (`POST /chat`'te
  yeni `spoken: true`) ve kendiliğinden sesli okunur (`GET /voice/speech`). Eser sayfasındaki
  "Bu eser hakkında sor" da aynı ekran.
- "Dinle" düğmesi artık EVREN'in sesiyle okuyor, bitince "Dinle"ye dönüyor; ses gelmezse telefonun sesi.
- Sesli okunan metinde sayılar ve kısaltmalar yazıyla gider ("15. yüzyıl" → "on beşinci yüzyıl",
  "H. 840" → "Hicri sekiz yüz kırk", "II. Murad" → "ikinci Murad"): EVREN'in ses modeli rakamları
  yanlış okuyor. Cevap da "15." ya da "II." gibi noktalardan değil, cümle sonlarından bölünüyor.
- EVREN'in ses modelleri ara sıra bir isteği cevapsız bekletiyor; API geciken isteğin yanına
  2,5 ve 6. saniyede bir yenisini gönderip ilk gelen cevabı alıyor.
- Kayıt saklanmıyor; ayrıntılar `docs/deploy.md`, "Sesli Rehber".

---

## 2026-11-03 · Rotalar ve açılan eserler hesaba bağlı (migration, sözleşme 0.3.21)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. `npm run db:deploy --workspace @vagabonds/api` (`user_route` tablosu).

Değişenler:
- Rotalarım artık hesapta (`GET/POST /me/routes`, `DELETE /me/routes/:id`): her cihazda aynı liste, başka hesap ya da
  çıkış yapmış ziyaretçi aynı telefonda başkasının rotasını görmüyor. Giriş yapmadan kaydedilen rota yalnızca o
  oturumda kalır. Telefondaki eski ortak liste (`vagabonds-saved-routes`) siliniyor; kimin olduğu bilinmiyordu.
- Haritada açılan eserler `GET /me/visits`'ten geliyor (mühürlenen ziyaretler). "Kilidi aç" demo simülasyonu o
  hesap için telefonda tutuluyor (`vagabonds-unlocked-assets:<hesap>`); eski ortak liste siliniyor.
- Uygulamada değişen yalnızca veri katmanı (`lib/saved-routes.ts`, `lib/unlocked-assets.ts`, `data/community.ts`);
  ekranlar aynı.

---

## 2026-11-02 · Gizemli bağlar: `GET /me/connections` (sözleşme 0.3.20)

Kimler: **uygulama ekibi** (kurulum adımı yok)

Değişenler:
- Yeni uç `GET /me/connections`: kullanıcının keşfettiği (ziyaret ettiği) eserlerin bağları. Karşı eser keşfedilene
  kadar yalnızca konumu gelir (`revealed: false`); ikisi de keşfedilince türü, açıklaması ve adı (`revealed: true`).
  "Aynı külliye" ve "hemen yanında" bağları listede yok. Uygulamada nasıl kullanılacağı: `KUBRA.md` 5. bölüm.

---

## 2026-11-02 · Taşın Dili gerçek kitabelerle: 11 AR hedefi, çeviri taşın üstünde

Kimler: **API'yi yerelde çalıştıranlar**, **demoyu açan**

1. `npm run db:import` (11 kitabe fotoğrafına bağlandı).
2. Demoyu açan (R2 yazma yetkisi olan): `.mind` dosyalarını derleyip yükle. Yüklenmese de çalışır,
   telefon fotoğrafı kendisi derler; ama ilk açılış birkaç saniye uzar.
   ```bash
   npm run data:ar-targets
   rclone copy data/build/media r2:kok-kod-media-public --checksum --transfers 16 \
     --header-upload "Cache-Control: public, max-age=31536000, immutable"
   ```

Değişenler:
- 11 eserde bir kitabe, veri setindeki fotoğrafına bağlandı (`ar_target_media_id`): Azeb Bey, Ebu İshak,
  Hamza Bey, Üftâde, Şirin Hatun, Umurbey Camii (batı vakfiyesi), Umurbey Çeşmesi, Küçük Ayasofya Çeşmesi,
  Seyit Mahmut Hayrânî, Şeyh Aliman Yahşi, Sephevan. Eşleşme fotoğraf, açıklama ve kitabenin yeri
  karşılaştırılarak yapıldı; uyuşmayan fotoğraflar (ayrı hat levhaları) bağlanmadı.
- Taşın Dili artık bu fotoğrafları tanıyor; Ulucami test görselleri kullanılmıyor. Eser sayfasından açılınca
  o eserin kitabeleri, Kamera sekmesinden açılınca 300 m içindeki eserlerin kitabeleri (en fazla 6) aranıyor;
  yakında yoksa örnek olarak Azeb Bey Türbesi.
- Kitabe tanınınca günümüz Türkçesi taşın üstüne yerleşip kitabeyle birlikte hareket ediyor; tam metin
  alttaki kartta. Metin veri setinden geliyor: taştaki yazı okunmuyor, yapay zekâ kullanılmıyor.
- Kamera sekmesindeki Taşın Dili gösterimi Yeşil Camii yerine Azeb Bey'in kitabesinde oynuyor (eski
  fotoğraf taç kapı değil, iç mekândaki çini bir kapıydı).

---

## 2026-11-02 · Eser kartları için yıl etiketi (sözleşme 0.3.19)

Kimler: **uygulama ekibi** (kurulum adımı yok)

Değişenler:
- Eser listesinde (`AssetSummary`) yeni alan `yearLabel`: kartta gösterilecek yıl ("1399", "XV. yüzyıl" ya da
  `null`). Tarih metnindeki hicri yılları, ölüm ve onarım tarihlerini almaz. Kart bunu kullanmalı (`KUBRA.md` 4.1).
- Uygulamanın fixture'ları API'den yeniden alındı.

---

## 2026-11-02 · fast-uri güvenlik güncellemesi

Kimler: **herkes**

1. `npm ci` (`fast-uri` 3.1.9 ve 4.2.3; yalnızca `package-lock.json` değişti).

---

## 2026-11-02 · Asistan yalnızca hesapla; sohbet arşivi (migration, sözleşme 0.3.18)

Kimler: **herkes** (API'yi yerelde çalıştıranlar, uygulama ekibi, demoyu açan)

1. `npm run db:deploy --workspace @vagabonds/api` (sohbet tabloları).
2. Demoyu açan: `deploy/.env`'e `PREFLIGHT_PASSWORD=` ekle (uzun, rastgele bir parola; `deploy/.env.example`).
   Yoksa ön kontrolün asistan satırı başarısız olur.

Değişenler:
- Rehber artık yalnızca hesapla kullanılıyor: oturumsuz soru 401, anonim oturum 403 `ACCOUNT_REQUIRED`.
  Uygulama giriş yapmamış ziyaretçiye Rehber'de "Giriş yap" kartını gösteriyor.
- Her soru ve cevap kaydediliyor (`chat_conversation`, `chat_message`); cevap, kaynakları, gezi planı ve
  rotasıyla gösterildiği gibi saklanıyor. Konum saklanmıyor. Kişi başı son 50 konuşma tutuluyor.
- Her sayfada (Rehber ya da bir eser) bir açık konuşma var. "Yeni konuşma" (kalem) onu arşive alıyor;
  arşivdeki konuşma yalnızca okunuyor, soru gönderilemiyor (409 `CONVERSATION_ARCHIVED`).
- Yeni uçlar: `GET /me/conversations`, `GET /me/conversations/:id`, `POST /me/conversations/:id/archive`,
  `DELETE /me/conversations/:id`, `DELETE /me/conversations`. `POST /chat` `conversationId` alıp döndürüyor.
- Uygulama: Rehber'in sağ üstünde geçmiş (saat) ve yeni konuşma (kalem); `/assistant-history` listesi;
  arşivdeki konuşma `/assistant?conversation=<id>` ile açılıyor, yazı alanının yerinde "Yeni konuşma" şeridi.
  Uygulama yeniden açılınca sayfanın açık konuşması kaldığı yerden geliyor.
- Ön kontrol (`deploy/preflight.mjs`) asistana kendi `onkontrol` hesabıyla soruyor ve konuşmasını siliyor.

---

## 2026-11-02 · Asistan daha uzun konuşmayı hatırlıyor (sözleşme 0.3.17)

Kimler: **sözleşmeyi kullananlar** (kurulum adımı yok)

Değişenler:
- `POST /chat` geçmişte en çok 12 tur alıyor (6 soru ve cevabı; önceden 6 tur). Uygulama da son 12 turu gönderiyor (`HISTORY_TURNS`).
- Uygulamanın fixture'larında yalnızca sürüm numarası değişti.

---

## 2026-11-01 · Zaman Perdesi yerine Ziyaret Mührü (migration, yeni paket, sözleşme 0.3.16)

Kimler: **uygulama ekibi**, **API'yi yerelde çalıştıranlar**, **veri ekibi**

1. `npm install` (`expo-location` eklendi; Expo Go'da çalışır, geliştirme derlemesi kullanan yeniden derlemeli).
2. `npm run db:deploy --workspace @vagabonds/api` (kanıt başarımlarının metni ve rozeti).

Değişenler:
- Modül 1'in konsepti değişti: önce/sonra perdesi yok. Ziyaretçi eserde, belirlediğimiz kısmı kameraya gösterir;
  telefon tanıyınca ziyaret **mühürlenir** (`POST /assets/:id/visit/proof`), rozet ve puan kazanılır.
- Sözleşme 0.3.16: `media[].subject` (fotoğrafın ne gösterdiği: `portal`, `inscription`, `mihrab`…). Mühür, eserin
  belirli bir kısmının fotoğrafıyla yapılır (taçkapı, kitabe, süsleme detayı, çeşme, mihrap, minber, pencere); böyle bir
  fotoğrafı olmayan eserde mühür yok (şu an 685 eserin 147'sinde var).
- Uygulama: `/time-curtain` ekranı `/visit-seal` oldu. Hedef fotoğraf (`src/lib/visit-seal.ts`)
  telefonda MindAR hedefine derlenir; eser başına `.mind` dosyası gerekmez. Takipçi sayfası artık `{ mind }` ya da
  `{ image }` alıyor (`src/ar/tracker-page.ts`). Konum `expo-location` ile; takma adı olmayan ziyaretçiye mühürden önce sorulur.
- Web'de ve ekran okuyucu açıkken kamera yok: ekran hangi kısmın çekileceğini gösterir.
- Başarımlar kodlarını korudu (`zaman-yolcusu`, `zaman-ustasi`), adları değişti: 🔏 İlk Mühür, 🏅 Mühür Ustası.
- Kamera sekmesi: iki deneyim alt alta, her biri gerçek bir eserde kısa bir demo oynatır.
- Veri ekibi: arşiv fotoğrafı (`archive_media`) artık bu modül için gerekmiyor. Mühür kısmı fotoğrafların `subject`
  alanından seçiliyor; detay fotoğrafı olmayan eserlere bir taçkapı ya da kitabe fotoğrafı eklemek mührü açar.

## 2026-11-01 · Konya'da ciltler arası ve aynı banili bağlar

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`.

Değişenler:
- Konya I ve II'de aynı yerdeki ayrı yapılar kitabın tarifiyle bağlandı (8 bağ): ör. Hacı Veyis Camii ile çeşmesi, Şeyh Osman Rûmi Camii ile türbesi, Şükran Mescidi ile altındaki dükkânlar, Hoca Fakih Camii ile çeşmesi.
- Aynı baninin farklı külliyelerdeki eserleri bağlandı (5 bağ): Sahip Ata Fahreddin Ali (Sahip Ata Camii, Hanikahı, İnce Minareli Medrese, Tahir ile Zühre Mescidi) ve Karamanoğlu İbrahim Bey (Şeyh Ebul Vefa Camii, Mahkeme Yeni Hamamı, Çumra'daki camii). Kitabın baniyi "muhtemel" verdiği yerlerde bağ da muhtemel.

## 2026-11-01 · Konya I. cilt yayında, 150 eserin konumu

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`.

Değişenler:
- Konya Vakıf Eserleri I. Cilt'in 205 kaydı (Hüseyin, PR #120) taslaktan yayına alındı; Mevlâna Külliyesi ve yapıları dahil. Fotoğrafları R2'de (1.462 dosya).
- 150'sine `geocode.py` ile konum yazıldı: OSM'de ad ve ilçe eşleşmesi, Wikidata, bağlı olduğu külliyenin noktası. Kitaptaki adresten ya da mahalleden bulunan 29'u yaklaşık (`osm_area`). Otomatik eşleşmeden iki düzeltme: Sultan Alâeddin Camii Alâeddin Tepesi'ne alındı (eşleştirici ilçedeki başka bir Ulu Cami'yi seçmişti), Ereğli Ulu (Kıble) Camii'nin yanlış noktası silindi.
- 55 kaydın konumu yok: listede ve asistanda görünürler, haritada görünmezler.

## 2026-11-01 · Veri seti dışındaki yerlere bağlar (migration, sözleşme 0.3.15)

Kimler: **API'yi yerelde çalıştıranlar**, **veri ekibi**, **uygulama ekibi** ([`YIGIT.md`](../YIGIT.md) 12. madde)

1. `npm run db:deploy --workspace @vagabonds/api` (`asset_relation`'a `target_name_tr`, `target_name_en`).
2. `npm run db:import`.

Değişenler:
- Kayıtlardaki bağa isteğe bağlı `target_name` ({ tr, en? }): hedef veri setinde yoksa kaynaktaki adı. 44 kayıtta 53 bağa yazıldı (ör. Koza Han → "II. Bayezid Külliyesi (İstanbul)"); adı kaynakta olmayan tek hedef (Sitti Hatun'un çeşmesi) adsız kaldı.
- `GET /assets/:id/relations` yanıtında yeni `outside[]`: bu bağlar kaynaktaki adıyla, haritasız döner. `unavailableCount` artık yalnızca henüz yayında olmayan ve adsız bağları sayar.

## 2026-11-01 · Konya'da 7 eserin konumu

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`.

Değişenler:
- Konya'da konumu olmayan 17 eserden 7'si noktasını aldı (kitaptaki tarif ve OpenStreetMap ile): 3'ü yapının kendisi ya da hemen önü (`osm`), 4'ü kitapta yanında olduğu yazan yapının noktası (`osm_area`, haritada yaklaşık, ziyarette 200 m kuralı yok). Bu eserlere artık toplu taşıma rotası da çıkıyor.

## 2026-11-01 · Konya'da toplu taşıma rotası (OpenTripPlanner, sözleşme 0.3.14)

Kimler: **demo yığınını çalıştıran** (Ahmet), **uygulama ekibi** (yapılacaklar [`YIGIT.md`](../YIGIT.md) 11. madde)

1. Demo yığını: `deploy/otp/prepare.sh` bir kez, sonra `deploy/demo.sh up` ([`deploy.md`](deploy.md), "Toplu taşıma").
2. Yerelde API: bir şey gerekmez; `OTP_URL` boşken `GET /transit/plan` 503 döner, gerisi aynı. Denemek için `deploy.md`'deki `docker run` satırı ve `OTP_URL`.

Değişenler:
- `GET /transit/plan` ve `GET /transit/entry-points`: Konya'da otobüs ve tramvayla rota (yürüme, biniş ve iniş durakları, saatler, hat, haritaya çizgi). Veri Konya Büyükşehir GTFS'i (Kasım 2025, CC BY 4.0).
- Asistan "X'e nasıl giderim" sorusunu Konya'da `transit_route` aracıyla cevaplar ve planı `attachments.transit` ile gönderir. `POST /chat` isteğine isteğe bağlı `origin: { lat, lng }` (ziyaretçinin konumu, saklanmaz).
- Yeni kaynak türü `transit` (`ChatCitationKindSchema`).

## 2026-11-01 · Konya'nın yöresel lezzetleri

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`.

Değişenler:
- `data/sehirler/konya.json`: Türk Patent coğrafi işaret sicilinden 10 lezzet (Etliekmek, Fırın Kebabı, Tirit, Etli Düğün Pilavı, Bamya Çorbası, Güneyik Salatası, Bıçakarası, Höşmerim, Sille Kurabiyesi, Akşehir Peynir Baklavası). Açıklamalar tescil belgesinin "Ürünün Tanımı" bölümünden.
- `GET /cities/konya/dishes` artık boş değil; Konya rotalarında öğle yemeği ve tatlı durakları çıkıyor, asistan Konya'da ne yeneceğini söyleyebiliyor.

## 2026-11-01 · Güvenlik turu: yerel veritabanı yalnızca bu bilgisayarda, Fastify 5.12.7

Kimler: **herkes** (yerel PostgreSQL), **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. `npm run db:up`: yerel PostgreSQL artık yalnızca `127.0.0.1:5432`'de dinliyor (önceden bütün ağa açıktı ve parolası git'te). Konteyner yeniden oluşturulur, veriler kalır.
2. `npm install` (API'de `fastify` 5.12.7: başlık doğrulamasındaki bir açık kapandı).

Değişenler:
- Anonim kullanıcı ödül kodu alamaz: `POST /rewards/:code/redeem` → `403 ACCOUNT_REQUIRED`. Puan kazanmaya devam eder; `POST /auth/upgrade` ile hesap açınca puanlar korunur ([`YIGIT.md`](../YIGIT.md) 4. madde).
- Moderatör kendi notunu ya da fotoğrafını onaylayamaz ve reddedemez: `403 OWN_CONTRIBUTION`; başka bir moderatör ya da admin karar verir.
- CORS artık `PATCH` ve `DELETE`'e izin veriyor: Expo web'deki yönetim paneli (`localhost:8081`) başarım, ödül ve eser düzenleyebiliyor.
- Yeni test (`route-guards.test.ts`): bütün `/admin` ve `/me` rotaları oturumsuz isteğe 401, ziyaretçiye 403 vermeli; yeni bir rota korumayı unutursa CI kırılır.

## 2026-10-31 · Ziyaret edilen eserler: `GET /me/visits` (sözleşme 0.3.13)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi** (yapılacaklar [`YIGIT.md`](../YIGIT.md) 10. madde)

1. API'yi yeniden başlat. Migration ya da veri içe aktarma gerekmez.

Değişenler:
- `GET /me/visits` (oturum gerekli): kullanıcının ziyaret ettiği yayındaki eserler, yeniden eskiye; her birinde `assetId`, `visitedAt`, `verified`, `proven`. Harita bu eserlerin sisini kaldırmak için kullanır.
- Uygulamanın fixture'ları 0.3.13 ile yeniden çekildi; önbellek sözleşme sürümüyle anahtarlandığı için kendiliğinden yenilenir.

## 2026-10-31 · Harita hep karanlık, eser kartları şeffaf cam (`expo-blur`)

Kimler: **uygulama ekibi**

1. `npm install` (uygulamaya `expo-blur` eklendi; Expo Go'da hazır geliyor, yeniden derleme gerekmez).

Değişenler:
- Harita, uygulama aydınlık modda olsa da karanlık temanın renkleriyle çiziliyor; harita ekranındayken durum çubuğu açık renk.
- Şehrin altındaki eser kartları her temada şeffaf buzlu cam, beyaz yazılı; tarih bilgisi karttan kalktı.
- Eser kartları şehre tıklanınca değil, kamera şehre inişini bitirince aşağıdan kayarak geliyor (harita sayfasının yeni `cityLanded` olayı).
- Harita telif yazısı başta kapalı, sağ alttaki (i) ile açılıyor; şehir açıkken kartların üstünde duruyor.
- Alt bar yeniden tasarlandı (`components/tab-bar.tsx`): yüzen opak bir kapsül (aydınlık temada beyaz, karanlıkta gece mavisi); açık sekme adıyla altın bir hap, Kamera ortada altın bir daire. Haritada barın altından harita görünüyor, diğer ekranlarda bar ekranın zemininde duruyor.
- Haritanın üstündeki başlık kartı ve şehir barı kalktı; yerine eser arama çubuğu geldi (`components/map-search.tsx`). Türkiye görünümünde tüm eserlerde ve şehirlerde, şehirdeyken o şehrin eserlerinde arar; yazmadan önce şehirleri ve öne çıkan eserleri önerir. Seçilen eser haritada seçilir (başka şehirdeyse önce o şehre uçulur), konumu olmayan eserin kartı açılır. Arama uygulamada yapılıyor: API'den tüm eserler 500'erli sayfalarla bir kez yüklenir.
- Alt barda Kapsül sekmesinin yerine Eserler (`/monuments`, tüm eserler listesi) geldi. Kapsül ekranı silinmedi: `/capsule` adresi çalışıyor, eser kartları kapsül seslerini çalmaya devam ediyor.

## 2026-10-31 · Konya II. cilt fotoğrafları

Kimler: **API'yi yerelde çalıştıranlar**

1. `npm run db:import`. Görseller R2'de; yerelde `media_pipeline.py` çalıştırmak gerekmez.

Değişenler:
- Konya II. cildindeki 93 eserden 91'ine kitabın 310 fotoğrafı eklendi; her fotoğrafın Türkçe ve İngilizce açıklaması ve alt metni var. Sahip Ata Sultan Hamamı ile Dedeler Hanı'nın kitapta fotoğrafı yok.
- Bir fotoğraf iki eserin sınırına düştüyse yalnızca gösterdiği eserde kaldı; başka bir yapıyı gösteren fotoğraflar eklenmedi.

## 2026-10-31 · Külliyenin yapıları ve eserin tanınırlığı listede (sözleşme 0.3.12)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. API'yi yeniden başlat. Migration ya da veri içe aktarma gerekmez; iki alan da veritabanındaki mevcut verilerden hesaplanıyor.

Değişenler:
- Eser listesindeki her eserde `parentId`: eser bir külliyenin yapısıysa külliyenin id'si, değilse ya da külliye yayında değilse `null`.
- Eser listesindeki her eserde `prominence`: kayıtta eserin ne kadar anlatıldığı (bölüm, öne çıkan, rivayet, kişi, zaman çizelgesi olayı ve kitabe sayılarının toplamı).
- Harita bir külliyenin yapılarını ayrı ayrı göstermiyor; külliye tek mühürle çıkıyor, kartında kaç yapısı olduğu yazıyor (Bursa'da 272 konumlu eserden 209 mühür).
- Kilitli eserlerin sisi iki katman: şehirde eserlerin çevresini birbirine bağlayan hafif bir pus ve her kilitli eserin üstünde kendi yoğun sis kümesi; ikisi de haritanın kendi katmanı, harita hareket ederken yerinde kalıyor. Haritanın tamamını örten sis perdesi kalktı.
- Şehirden uzaklaşınca mühürler noktaya dönüşüyor; ilin tamamı ekrana sığana kadar bütün noktalar görünüyor, sonra `prominence` sırasıyla en az bilinenden başlayarak azalıyor; Türkiye görünümüne inince sis kalkıyor ve harita şehirden çıkıyor.
- Uygulamanın önbelleği sözleşme sürümüyle anahtarlandığı için eski kayıtlar kendiliğinden yenilenir.

## 2026-10-31 · Ödüller, cüzdan ve kanıtlanmış ziyaret (migration, sözleşme 0.3.11)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi** (yapılacaklar [`YIGIT.md`](../YIGIT.md))

1. `npm run db:deploy --workspace @vagabonds/api`. Migration'lar 6 örnek ödülü, 120 örnek kodu ve 2 yeni başarımı ekler.

Değişenler:
- `POST /assets/:id/visit/proof`: Zaman Perdesi eserin fotoğrafını kamerada tanıyınca ziyaret "kanıtlanmış" olur. Yeni başarım kuralı `proven_visits` ve iki başarım ("Zaman Yolcusu", "Zaman Ustası").
- `GET /rewards`, `GET /me/wallet`, `POST /rewards/:code/redeem`: puanla ortak kurumların tek kullanımlık kodları alınır. Puan parayla alınmaz, paraya çevrilmez.
- Admin: `/admin/rewards` ile ödül ekleme ve düzenleme, kod yükleme.
- Ayrıntı: [`docs/rewards.md`](rewards.md), [`docs/achievements.md`](achievements.md).

## 2026-10-30 · AI asistan EVREN'e geçiyor

Kimler: **asistanı yerelde deneyenler**, **demo sunucusu**

1. EVREN'de bir anahtar oluştur ve kullanım şartlarını kabul et (`docs/deploy.md`, "AI asistan").
2. `apps/api/.env` (demoda `deploy/.env`):
   `ASSISTANT_BASE_URL=https://evren-llmapi.ssyz.org.tr/v1`, `ASSISTANT_MODEL=qwen3.8-flash-next`,
   `ASSISTANT_API_KEY=<anahtar>`. Anahtar git'e, PR'a ya da sohbete yazılmaz.
3. Kontrol: `GET /chat/status` → `"available": true`.

Değişenler:
- Demoda yerel Ollama yerine EVREN kullanılıyor; Ollama yedek olarak kaldı.
- Eser sayfasından sorulan sorular Qwen'de `400` veriyordu (ikinci `system` mesajı). Model istemcisi artık bütün `system` mesajlarını tek mesajda birleştirerek gönderir.

## 2026-10-30 · Yaklaşık koordinatlar (sözleşme 0.3.10)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. `npm run db:import` (52 esere yeni koordinat).

Değişenler:
- `coordinates.approximate`: `true` ise nokta yalnızca eserin mahallesinin ya da köyünün merkezidir (`source: "osm_area"`).
  - Haritada eser "yaklaşık burada" diye, örneğin farklı bir işaretle gösterilmeli.
  - Bu eserlerde ziyaret konumla doğrulanmaz.
- Haritadaki eser sayısı: Bursa 333/356, Hatay 73/116, Konya 62/93. 41'i yaklaşık nokta.

## 2026-10-30 · Ziyaretler ve başarımlar (migration, sözleşme 0.3.9)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**

1. `npm run db:deploy --workspace @vagabonds/api`. Migration 32 başlangıç başarımını da ekler.

Değişenler:
- `POST /assets/:id/visit`: ziyaret kaydı.
  - Eserin noktası varsa ziyaretçi 200 m içinde olmalı; noktası yoksa ziyaret doğrulanmadan kabul edilir.
  - Yanıtta kazanılan başarımlar (`newAchievements`) döner; uygulama bunları rozet bildirimi olarak gösterebilir.
- `GET /achievements` başarım listesini, `GET /me/achievements` ilerlemeyi, kazanılanları ve toplam puanı verir. Onaylanan katkılar bu çağrıda sayılır.
- Admin: `/admin/achievements` ile başarım ekleme, düzenleme, kapatma ve silme. Kural türleri `docs/achievements.md`'de.
- Puanlar parayla alınmaz ve paraya çevrilmez; ödül kataloğu sonraki bir aşamada.

## 2026-10-30 · Yönetim paneli uçları (sözleşme 0.3.8)

Kimler: **uygulama ekibi**, **veri ekibi**. Migration yok.

Değişenler:
- Yeni uçlar (moderatör ya da admin; rol ve eser işlemleri yalnızca admin):
  - `GET /admin/summary`: bekleyen notlar ve fotoğraflar, kullanıcı sayıları.
  - `GET /admin/users`: kullanıcı listesi ve arama.
  - `POST /admin/users/:id/role` ve `POST /admin/users/:id/unban`: rol verme ve engel kaldırma.
  - `GET`, `POST`, `PATCH`, `DELETE` `/admin/assets`: panelden eser ekleme, düzenleme, yayına alma ve silme.
- `GET /admin/contributions?kind=notes|photos`: notlar ve fotoğraflar ayrı listelenebilir.
- Panelden eklenen eser veritabanında veri setindeki JSON biçiminde durur (`prepared_by: admin:<kullanıcı>`).
  - `import_to_db.py` bu eserlere dokunmaz.
  - Veri setine almak için: `python3 data/tools/export_panel_assets.py --write`, sonra `validate.py`, eksik bilgileri tamamla ve PR aç. Dışa aktarılan eser artık `data/` üzerinden düzenlenir.
- Uygulama: admin ekranları ayrı bir PR'da gelecek.

## 2026-10-30 · Expo SDK 58

Kimler: **uygulamayı çalıştıranlar** (Yiğit, Kübra)

1. Bağımlılıkları yeniden kur. Eski kopyalar kalmasın diye önce `node_modules` klasörlerini sil:
   ```bash
   rm -rf node_modules apps/*/node_modules packages/*/node_modules
   npm install
   ```
2. Telefonda **Expo Go**'yu güncelle (SDK 58). iOS'ta eski Expo Go kurulamadığı için SDK 57'deki proje güncel Expo Go'da açılmıyordu.
3. `expo: command not found` görürsen 1. adımı tekrarla.

Değişenler:
- Expo 58, React Native 0.88, React 19.3 (kökteki `overrides` da 19.3.0). Tüm Expo paketleri `npx expo install --fix` ile hizalandı; `expo-doctor` temiz.
- `react-native-webview` 14 ve `react-native-gesture-handler` 3'e geçti. Haritadaki WebView ref'i ve sekme ikonlarının rengi yeni tiplere göre düzeltildi.
- `app.json`'a SDK 58'in istediği `expo-font`, `expo-image`, `expo-status-bar` eklentileri eklendi.
- expo-router 58'de `href: null` ile gizlenen sekmeye gidilince ilk sekmeye yönlendiriliyor; "Tüm eserler" bu yüzden haritaya geri atıyordu. Eserler sekmesi artık yalnızca düğmesi çizilmeden gizleniyor.

---

## 2026-10-30 · Ziyaretçi fotoğraf önerileri (migration, sözleşme 0.3.7)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**, **demoyu yayınlayan**

1. Migration'ı uygula:
   ```bash
   npm run db:deploy --workspace @vagabonds/api
   ```
2. Demo makinesinde web imajını yeniden derle (`docker compose … up -d --build`). Caddy artık fotoğraf yükleme yolunda 6 MB'a kadar gövde kabul ediyor; diğer yollarda sınır 64 KB.

Değişenler:
- `POST /assets/:id/photos?caption=`: gövde fotoğrafın kendisi (JPEG ya da PNG, en çok 5 MB).
  - Sunucu dosya türünü baytlardan kontrol eder ve konum dahil meta verileri siler.
  - Kullanıcı başına günde 10 fotoğraf.
  - Fotoğraf bir katkıdır (`kind: "photo"`); moderasyon kuyruğunda ve "Notlarım"da imzalı adresiyle görünür.
- `GET /assets/:id/photos`: onaylanmış ziyaretçi fotoğrafları. Eserin kendi galerisinden ayrı gösterilir, çünkü veri içe aktarması galeriyi her seferinde yeniden kurar.
- `GET /photos/:id`: dosya. Yanıtlardaki `path` API'nin taban adresine eklenir.
- `Contribution` alanına `photo` eklendi (fotoğraf değilse `null`).
- Uygulama: "Fotoğraf öner" düğmesi ve ziyaretçi fotoğrafları bölümü ayrı bir PR'da gelecek.

## 2026-10-30 · Hesaplar: kayıt, giriş, admin rolü (migration, sözleşme 0.3.6)

Kimler: **API'yi yerelde çalıştıranlar**, **uygulama ekibi**, **demoyu yayınlayan**

1. Migration'ı uygula:
   ```bash
   npm run db:deploy --workspace @vagabonds/api
   ```
   Mevcut token'lar yeni `user_session` tablosuna taşınır; uygulamada açık anonim oturumlar geçerli kalır.
2. `npm run moderator:create` kaldırıldı. Moderatör ya da admin hesabı artık şöyle açılır, parola bir kez yazdırılır:
   ```bash
   npm run account:create --workspace @vagabonds/api -- <kullanıcı-adı> admin
   ```
   Eski moderatör token'ları çalışmaya devam eder.

Değişenler:
- Yeni uçlar:
  - `POST /auth/register` ve `POST /auth/login`: kullanıcı adı + parola; her giriş bu cihaz için yeni bir token verir.
  - `POST /auth/logout`: yalnızca bu cihazın token'ını geçersiz kılar.
  - `POST /auth/upgrade`: anonim ziyaretçi hesap açar; token'ı ve notları korunur.
- `AppUser` alanına `username` eklendi (anonim ziyaretçide `null`); `role` artık `admin` de olabilir.
  - Admin, moderatörün bütün uçlarını kullanabilir.
  - Uygulamanın telefonda sakladığı eski oturumlar okunmaya devam eder (`username` yoksa `null` sayılır).
- Uygulama: giriş, kayıt ve "hesap aç" ekranları ayrı bir PR'da gelecek.

## 2026-10-30 · Konya II. Cilt: 93 yeni eser

Kimler: **API'yi yerelde çalıştıranlar**

1. Veriyi içe aktar:
   ```bash
   npm run db:import
   ```

Değişenler:
- `data/eserler/konya/` altında Konya Vakıf Eserleri II. Cilt'ten 93 yayınlanmış kayıt var (kaynak `vk-konya-c2`).
  - Yeni il: Konya. `/assets?city=konya` ile listelenir.
  - Koordinat ve fotoğraf henüz yok; fotoğraflar ayrı bir PR'da eklenecek.
- Kitaptan çıkarma aracı: `data/tools/extract/konya_book.py`.
- Ajan talimatı (`PROMPT.md`) artık `disputed` kullanmıyor. Tarihler ve sayılar kitapta yazıldığı gibi alınıyor.

## 2026-10-28 · AI asistan: `POST /chat` (sözleşme 0.3.5)

Kimler: **uygulama ekibi**, **demoyu yayınlayan**. API'yi yerelde çalıştıranlar için zorunlu adım yok: model tanımlı değilse asistan kapalıdır.

1. İsteğe bağlı, asistanı yerelde denemek için `apps/api/.env`'e ekle (`.env.example`'daki örnekler):
   ```dotenv
   ASSISTANT_BASE_URL=http://localhost:11434/v1   # Ollama
   ASSISTANT_MODEL=qwen3:8b
   ```
   Barındırılan bir model denenecekse `ASSISTANT_API_KEY` de eklenir. Anahtar git'e girmez.
2. Demo makinesinde: `docs/deploy.md` → "AI asistan" (Ollama kurulumu, `deploy/.env`).

Değişenler:
- Yeni uçlar: `GET /chat/status` ve `POST /chat`.
  - İstek: `message`, isteğe bağlı `assetId` ve `history` (son 6 tur), `lang`.
  - Cevap: `answer` metnindeki `[n]` işaretleri `citations[].ref` ile eşleşir (`kind`: `asset`, `dish`, `trip`, `weather`; `id` ile ilgili sayfa açılır). Gezi sorusunda `attachments.trip` Rotalar ekranının kullandığı planın aynısıdır.
  - `grounded: false` ise cevap kaynaksızdır (selamlaşma, konu dışı soru).
- Uygulama:
  - Sohbet ekranı ve eser sayfasındaki "Bu eser hakkında sor" (`assetId` ile) eklenebilir.
  - `/chat/status` `available: false` dönerse bu girişler gizlenir.
  - `503 ASSISTANT_BUSY` gelirse kısa bir süre sonra tekrar denenir. `ASSISTANT_UNAVAILABLE` gelirse "asistan şu an kapalı" gösterilir.
- Sözleşme yalnızca eklendiği için uygulamanın fixture'ları sürüm numarasıyla yeniden üretildi.

## 2026-10-28 · Ortam sesi kayıtları için altyapı (migration, sözleşme 0.3.4)

Kimler: **API'yi yerelde çalıştıranlar**, **veri ekibi (H9)**, **uygulama ekibi**

1. Migration'ı uygula ve veriyi içe aktar:
   ```bash
   npm run db:deploy --workspace @vagabonds/api
   npm run db:import
   ```

Değişenler:
- Yeni veri dosyası `data/sounds.json` (şema `data/schema/sound.schema.json`). Şimdilik boş.
  - Bir kayıt eklemek için: dosyayı `sounds/<anahtar>.mp3` olarak bucket'a yükle (`rclone copy`, `data/README.md` §8), sonra `sounds.json`'a ekle.
  - Eklenecek bilgiler: başlık, süre, kayda göre yazılmış zamanlı altyazılar, lisans (CC0 ya da CC BY), yazar, kaynak sayfası.
  - Son olarak `validate.py` ve `db:import` çalıştır.
- Eser detayında `ambientSound.recording` (`url`, `captions`, `credit`), ayrıca yeni uç `GET /meta/sounds`.
- Uygulama: Kayıt gelince ses adresi ve altyazılar API'den alınabilir. O zaman `audio/sounds.ts`'deki adres kurma ve `content/capsules.ts`'deki altyazılar kaldırılabilir. `recording` `null` iken yedek ses aynen çalışır.

## 2026-10-28 · Yöresel lezzetler (migration, sözleşme 0.3.3)

Kimler: **API'yi yerelde çalıştıranlar**, **veri ekibi**, **uygulama ekibi**

1. Migration'ı uygula ve veriyi içe aktar:
   ```bash
   npm run db:deploy --workspace @vagabonds/api
   npm run db:import
   ```
2. API'yi yeniden başlat.

Değişenler:
- Yeni veri dosyası `data/sehirler/<il>.json` (şema `data/schema/sehir.schema.json`). Bursa için 9, Hatay için 10 yöresel lezzet var; hepsi Türk Patent coğrafi işaret tescilli ve sicil belgesiyle kaynaklı. `validate.py` bu dosyaları da kontrol ediyor.
- Yeni tablo `city_dish`, yeni uç `GET /cities/:code/dishes`.
- `/routes/trip`'te öğle ve tatlı molalarında artık `dish` dolu: önce ilçenin, sonra ilin lezzeti; gezi boyunca tekrar etmeden.
- Uygulama: Lezzet Durakları ekranı (`content/food.ts`) bu uca bağlanabilir. Örnek içerikteki "nerede, kaç dakika" bilgisi kaynaksız olduğu için veride yok; onun yerine ilçe ve tescil bilgisi var.

## 2026-10-28 · Rotalar için çok günlük gezi ve hava tahmini (sözleşme 0.3.2)

Kimler: **uygulama ekibi** (Rotalar ekranı), **API'yi yerelde çalıştıranlar**

1. API'yi yeniden başlat. Kurulum adımı yok: yeni paket, ortam değişkeni ya da migration gerekmiyor.

Değişenler:
- Yeni uç `GET /routes/trip?city=bursa&duration=half|1|2`: önemli eserler önce, saatli gün akışı, öğle ve tatlı molaları, günün hava notu. Ayrıntı `packages/contracts/README.md` ("Gezi").
  `content/routes.ts`'deki örnek motorun yerine geçebilir. Tasarımdaki "Bursa + Edirne" seçimi yerine şehirler `/meta/enums`'tan gelmeli; veri setinde Edirne yok.
- `GET /weather` yanıtında yeni `daily` alanı: bugün ve sonraki iki gün için en yüksek/en düşük sıcaklık, yağış olasılığı ve öğleden sonra yağmur.
- `/routes/plan` değişmedi.

## 2026-10-25 · Ziyaretçi Nabzı uygulamada (expo-secure-store)

Kimler: **uygulama ekibi**

1. Yeni paket (`expo-secure-store`, Expo Go'da hazır):
   ```bash
   npm install
   ```

Değişenler:
- Eser sayfasının "Ziyaretçi Notları" sekmesi API'nin nabzını gösteriyor ve "Not bırak" formu var; Profil'de
  "Notlarım" listeleniyor (ayrıntı `apps/app/README.md` "Veri"). `DataSource`'a `getPulse` eklendi: kendi
  kaynağını yazan varsa onu da eklemeli.

## 2026-10-25 · Çevrimdışı veriler (AsyncStorage)

Kimler: **uygulama ekibi**

1. Yeni paket (`@react-native-async-storage/async-storage`):
   ```bash
   npm install
   ```

Değişenler:
- API yanıtları cihazda saklanıyor; bağlantı yoksa ya da yavaşsa ekranlar saklanan veriyle açılıyor ve üstte
  "Çevrimdışı" şeridi çıkıyor (`apps/app/src/data/cached-source.ts`, ayrıntı `apps/app/README.md` "Veri").
  Ekranların veri kullanımı değişmedi.

## 2026-10-25 · Ses Kapsülü telefonda sesli (expo-audio)

Kimler: **uygulama ekibi**, **ses kayıtlarını ekleyecek veri ekibi (H9)**

1. Yeni paket (`expo-audio`):
   ```bash
   npm install
   ```

Değişenler:
- Kapsüller telefonda da ses çalıyor. Gerçek kayıt yokken web'de ses yine canlı sentezleniyor; telefonda aynı sesin
  kaydı (`apps/app/src/audio/stand-ins/`, `npm run audio:stand-ins --workspace @vagabonds/app`) çalıyor, ekranda
  "canlandırılmış ses" notu var.
- **Gerçek kayıtlar (H9):** `sounds/<ses anahtarı>.mp3` olarak medya bucket'ına yüklenince uygulama onları
  kendiliğinden çalar (`https://media.allbytech.com/sounds/<anahtar>.mp3`). Anahtarlar `data/enums.json`'daki
  `ambient_sound` değerleri (`darussifa`, `han`, `medrese`, `hamam`, …). Kapsül 24 sn; dosya 24–25 sn, mono, CC0.
  Altyazılar şimdilik `apps/app/src/content/capsules.ts`'de; `sounds.json` gelince oradan okunacak.

## 2026-10-24 · AR hedefleri veriden (sözleşme 0.3.1)

Kimler: **herkes** (sözleşme değişti), **AR hedefi ekleyen veri ekibi**

1. Paketleri güncelle (sözleşme paketi 0.3.1):
   ```bash
   npm install
   ```

Değişenler:
- Kitabelerde yeni `arTarget: { mindUrl, mindarVersion } | null` alanı (Y13). Taşın Dili hedefi buradan alıyor; yoksa uygulamadaki test görsellerine dönüyor.
- Bir kitabeye `ar_target_media_id` bağlayan, `media_pipeline.py`'den sonra `npm run data:ar-targets` çalıştırıp `data/build/ar-targets.json`'u commit eder; `.mind` dosyası fotoğraflarla aynı `rclone copy` komutuyla R2'ye gider ([`data/README.md`](../data/README.md) §8).
- Derleme Chrome gerektiriyor (macOS dışında `CHROME_PATH`); MindAR uygulamaya gömülü kopyadan geliyor, jsDelivr gerekmiyor. `npm run ar:targets` (uygulamanın test hedefleri) de artık internetsiz çalışıyor.

## 2026-10-23 · Görseller kendi alan adımızdan (`media.allbytech.com`)

Kimler: **API'yi ya da demo sunucusunu çalıştıranlar**

1. `apps/api/.env`'de (sunucuda `deploy/.env`) `MEDIA_BASE_URL` tanımlıysa yeni adrese çevir; tanımlı değilse bir şey yapma, varsayılan değer değişti:
   ```bash
   MEDIA_BASE_URL=https://media.allbytech.com
   ```
2. API'yi yeniden başlat.

Değişenler:
- `r2.dev` Türk operatörlerinde engelli olduğu için görseller artık `https://media.allbytech.com` adresinden geliyor (Y14). Bu adres, R2 bucket'ının önündeki küçük bir Worker (`deploy/media-worker/`, Yiğit'in Cloudflare hesabında). Görseller bucket'ta kalıyor; R2'ye yükleme düzeni değişmedi.
- Uygulamanın örnek verisindeki (`EXPO_PUBLIC_DATA_SOURCE=mock`) görsel adresleri de yeni adrese çevrildi.
- Kurulum ve sorun giderme: [`docs/deploy.md`](deploy.md#görsellerin-alan-adı).

## 2026-10-23 · AR ve harita kütüphaneleri uygulamayla birlikte

Kimler: **uygulamayı çalıştıranlar**

1. Paketleri güncelle (`esbuild` geliştirme bağımlılığı olarak eklendi):
   ```bash
   npm install
   ```

Değişenler:
- MindAR ve MapLibre artık jsDelivr'den indirilmiyor, uygulamanın içinde geliyor (Y12). AR ve haritanın kütüphaneleri için internet gerekmiyor; harita karoları hâlâ OpenFreeMap'ten.
- Sürüm değişince kütüphaneleri yeniden paketlemek için: `npm run vendor --workspace @vagabonds/app` (internet gerekir). Çıktı `apps/app/src/vendor/`'da; elle düzenlenmez.

## 2026-10-22 · Harita prototipi

Kimler: **uygulamayı çalıştıranlar**

Kurulum adımı yok (harita, AR ile gelen `react-native-webview`'ı kullanıyor).

Değişenler:
- Geliştirme modunda `Kamera` sekmesinde **Harita prototipi** var: API'deki koordinatlarla MapLibre haritası (Y6, [ADR 0003](decisions/0003-map-approach.md)).
- API'nin çalışıyor olması ve internet gerekir (MapLibre jsDelivr'den, harita karoları OpenFreeMap'ten gelir).
## 2026-10-22 · Yeni eser türleri (E2)

Kimler: **API'yi yerelde çalıştıranlar**

1. Veritabanını güncelle:
   ```bash
   npm run db:import
   ```

Değişenler:
- `data/enums.json` → `asset_types`: `makam`, `kilise`, `kutuphane`, `namazgah`, `kopru`, `degirmen`, `hoyuk`.
- 18 kaydın türü değişti (çoğu `diger`'den). `/meta/enums` ve `/assets?type=` yeni kodları döndürüyor; sözleşme değişmedi.
- Planner bu türler için de varsayılan ziyaret süresi ve iç/dış mekân tahmini kullanıyor.

## 2026-10-22 · Sözleşme v0.3.0: eski `Monument` şeması kaldırıldı

Kimler: **sözleşmeyi kullananlar** (kurulum adımı yok)

Değişenler:
- `packages/contracts`'tan `Monument`, `MonumentsPayloadSchema`, `MONUMENTS_CONTRACT_VERSION` ve `mock_monuments.json` kaldırıldı. Uygulama bunları #48'den beri kullanmıyordu.
- `npm run contracts:validate` artık uygulamanın fixture'larını (`apps/app/src/data/fixtures`) doğruluyor. Sözleşme sürümü değişince fixture'ları API'den yeniden al:
  ```bash
  npm run fixtures --workspace @vagabonds/app   # API çalışırken
  ```

## 2026-10-22 · AR prototipi için WebView

Kimler: **uygulamayı çalıştıranlar**

1. Yeni paketleri kur (`react-native-webview`, `expo-camera`):
   ```bash
   npm install
   ```

Değişenler:
- Geliştirme modunda `Kamera` sekmesinde **AR prototipi** var: MindAR ile gerçek kitabe takibi (Y5, [ADR 0002](decisions/0002-ar-approach.md)). Test görselleri `apps/app/src/ar/test-targets/` altında; birini bilgisayar ekranında açıp telefonla tara.
- Prototip MindAR'ı jsDelivr'den indirir, bu yüzden internet gerekir.

## 2026-10-22 · Bursa'da 238 kayda kitap fotoğrafları

Kimler: **API'yi yerelde çalıştıranlar**

1. Veritabanını güncelle:
   ```bash
   npm run db:import
   ```

Değişenler:
- Fotoğraflı Bursa kaydı 49'dan 287'ye çıktı (506 yeni fotoğraf, altyazı ve alt metinleriyle); sürümleri R2'de.

## 2026-10-22 · Drive fotoğraflarından 87 koordinat daha

Kimler: **API'yi yerelde çalıştıranlar**; veri araçlarını kullananlar için 2. adım

1. Veritabanını güncelle:
   ```bash
   npm run db:import
   ```
2. (Yalnızca `drive_photo_map.py` ya da `match_photos.py` çalıştıracaksan) yeni Python paketini kur:
   ```bash
   python3 -m pip install -r data/requirements.txt   # pymupdf eklendi
   ```

Değişenler:
- Koordinatlı eser sayısı 216'dan 303'e çıktı (Bursa 272/356). Yeni noktalar Drive arşivindeki fotoğrafların EXIF GPS'inden; hepsi `verified: false`.

## 2026-10-22 · Hayrat arayüzü, temalar ve yeni istemci paketleri

Kimler: **istemci tarafında çalışan herkes** (Yiğit, Kübra)

1. Yeni paketleri kur (`react-native-svg`, `expo-speech`; `@vagabonds/ui` için `@types/react`):
   ```bash
   npm install
   ```

Değişenler:
- Sekmeler Hayrat tasarımına geçti: Harita (`/`), Rotalar (`/route`), Kamera (`/camera`), Kapsül (`/capsule`),
  Profil (`/settings`). Eser listesi `/monuments` adresinde kaldı; haritadaki "Tüm eserler" ve "Eser kartı" ile açılıyor.
- Renkler artık `useColors()` ile temadan geliyor (`apps/app/src/theme/colors.ts` silindi). Ekranlarda
  `@vagabonds/ui`'nin `Text`, `Button`, `Card` bileşenlerini kullan.
- Harita, rota, lezzet, ses kapsülü ve kamera ekranlarındaki içerik `apps/app/src/content/` altında
  **tasarım örnek içeriği**; gerçek veri geldikçe oradaki dosyalar değiştirilir.

---

## 2026-10-21 · Uygulama `/assets` API'sinden okuyor

Kimler: **uygulamayı çalıştıranlar** (Yiğit, Kübra) ve **demo sunucusunu kuranlar** (Ahmet)

1. Paketleri güncelle (`tsx` uygulamaya eklendi):
   ```bash
   npm install
   ```
2. Uygulama artık veri için API'ye ihtiyaç duyuyor. Ya API'yi aç (`npm run dev --workspace @vagabonds/api`),
   ya da API olmadan çalışmak için örnek veriyi seç:
   ```bash
   EXPO_PUBLIC_DATA_SOURCE=mock npm run app
   ```
3. Telefonda (Expo Go) API adresi otomatik bulunur: Expo sunucusunun çalıştığı bilgisayarın `:3000` portu.
   Telefon ile bilgisayar aynı ağda olmalı. Başka bir API için `EXPO_PUBLIC_API_URL` ver.

Değişenler:
- Eser detay adresi `/monuments/<eser id>` oldu (ör. `/monuments/bursa-osmangazi-ulucami`).
- `deploy/Caddyfile`: her `/monuments/<id>` adresi web çıktısındaki `monuments/[id].html` kabuğuna yönleniyor.
  Demo sunucusunda web imajını yeniden derle (`docs/deploy.md`).
- Uygulama `Monument` sözleşmesini ve `mock_monuments.json`'u artık kullanmıyor.

---

## 2026-10-21 · Eser koordinatları

Kimler: **API'yi yerelde çalıştıranlar**

1. Veritabanını güncelle:
   ```bash
   npm run db:import
   ```

Değişenler:
- 472 eserin 216'sında artık koordinat var (Bursa 185, Hatay 31); harita ve `/assets/:id/nearby` dolu dönüyor.
- Yeni noktaların hepsi `verified: false`. Kaynakları: fotoğraf EXIF'i, OpenStreetMap ya da bağlı olunan yapı (`data/tools/geocode.py`).
- OSM'den gelen noktalar ODbL lisanslı: uygulamada "© OpenStreetMap katkıcıları" atfı gösterilmeli (Kübra).

## 2026-10-21 · Hatay kayıtları yayında

Kimler: **API'yi yerelde çalıştıranlar**

1. Veritabanını güncelle:
   ```bash
   npm run db:import
   ```

Değişenler:
- 116 Hatay kaydı `published` oldu; API artık 472 eser döndürüyor (`/assets?city=hatay`).
- Hatay kayıtlarının 109'unda kitaptan fotoğraf var (348 fotoğraf, sürümleri R2'de).
- Koordinat henüz yok; Hatay eserleri haritada ve yakındaki eserlerde görünmez.

## 2026-10-21 · Fotoğraflar R2'de

Kimler: **API'yi yerelde çalıştıranlar**

1. Yeni manifesti veritabanına al:
   ```bash
   npm run db:import
   ```

Değişenler:
- Kayıtlara bağlı 174 fotoğrafın sürümleri R2'de; API'nin döndürdüğü görsel adresleri artık açılıyor.
- Orijinaller R2'ye yüklenmiyor, kaynağında kalıyor (Drive / kitap PDF'i). Ayrıntı: `data/README.md` §8.

---

## 2026-10-20 · Ziyaretçi Nabzı: anonim oturum, katkılar, moderasyon (sözleşme v0.2.2)

Kimler: **herkes** (migration ve sözleşme paketi)

1. Paketleri güncelle ve yeni migration'ı uygula (`app_user` tablosu):
   ```bash
   npm install
   npm run db:deploy --workspace @vagabonds/api
   ```
2. Moderasyonu denemek istersen bir moderatör oluştur; token bir kez yazdırılır:
   ```bash
   npm run moderator:create --workspace @vagabonds/api -- "Adın"
   ```

Değişenler:
- Yeni uçlar: `POST /auth/anonymous`, `GET /me`, `GET /me/contributions`, `POST /assets/:id/contributions`,
  `GET /assets/:id/pulse` ve `/admin/...` moderasyon uçları. Ayrıntılar [`packages/contracts/README.md`](../packages/contracts/README.md)'de.
- **Veri ekibi:** `import_to_db.py --verify` artık `contribution` satırlarını karşılaştırmıyor; bu satırları API yazıyor.
  `app_user` tablosu içe aktarılmıyor (`data/README.md` §5'teki DDL'e eklendi).

---

## 2026-10-20 · API güvenliği: hız sınırı ve güvenlik başlıkları

Kimler: **API'yi yerelde çalıştıranlar**

1. Yeni paketleri kur (`@fastify/rate-limit`, `@fastify/helmet`):
   ```bash
   npm install
   ```
2. İsteğe bağlı yeni ortam değişkenleri (`apps/api/.env`); varsayılanlar yeterli:
   - `RATE_LIMIT_MAX`: IP başına dakikadaki istek sınırı (varsayılan 120, `0` kapatır).
   - `TRUST_PROXY`: API bir proxy arkasındaysa proxy'nin adresleri ya da `uniquelocal`. Yerelde gerekmez.

Değişenler:
- Sınır aşılınca API `429` ve `{ error: { code: "RATE_LIMITED" } }` döner; `Retry-After` başlığı kaç saniye bekleneceğini söyler. İstemci bu hatayı ayrı gösterebilir.
- İstek gövdesi 16 KB ile sınırlı.

---

## 2026-10-16 · `/assets` API'si ve sözleşme v0.2.0

Kimler: **herkes** (sözleşme paketi güncellendi)

1. Paketleri güncelle (`@vagabonds/contracts` 0.2.0):
   ```bash
   npm install
   ```
2. İsteğe bağlı yeni ortam değişkenleri (`apps/api/.env`); varsayılanlar yeterli:
   - `MEDIA_BASE_URL`: görsellerin genel adresi (varsayılan: R2 bucket'ı).
   - `ASSET_VISIBILITY=published|preview`: `preview`, `in_review` kayıtları da gösterir; taslaklar hiçbir zaman dönmez.

Değişenler:
- Yeni uçlar: `GET /assets` ve `GET /assets/:id`; belge `http://localhost:3000/docs`.
- `Monument` sözleşmesi ve mock kullanımdan kalkacak; uygulama `/assets`'e geçince (Y8) silinecek.
  Eski `CONTRACT_VERSION` adı yeni sözleşmenin sürümü oldu; eski sürüm `MONUMENTS_CONTRACT_VERSION`.

---

## 2026-10-16 · Tüm eserler yayında, koordinat isteğe bağlı

Kimler: **backend ve veri** (Ahmet, Hüseyin); yerelde veritabanı çalıştıran herkes

1. Yeni migration (`asset.lat` / `lng` artık boş olabilir):
   ```bash
   npm run db:deploy --workspace @vagabonds/api
   ```
2. Veriyi yeniden içe aktar; 356 eserin hepsi `published` olarak girer:
   ```bash
   npm run db:import
   ```

Değişenler:
- Kayıtlar kaynakla teyit edildiği için hepsi `published`, `meta.reviewed_by` dolu.
- Koordinat ve fotoğraf hiçbir durumda zorunlu değil. Koordinatı olmayan eser haritada ve yakındaki
  eserlerde görünmez; `validate.py` eksikleri uyarı olarak listeler.
- `media_pipeline.py`'den henüz geçmemiş görseller (manifestte olmayanlar) içe aktarmada atlanır ve
  sayısı yazdırılır. Görseller işlenip yeniden içe aktarılınca kendiliğinden eklenir.

---

## 2026-10-15 · Expo uygulaması (`@vagabonds/app`)

Kimler: **herkes** (paketler kökten kurulduğu için)

1. Expo SDK 57 ve bağımlılıkları eklendi; kurmak için:
   ```bash
   npm install
   ```
2. Uygulamayı açmak için `npm run app`. Telefonda **Expo Go**'nun güncel sürümü gerekir (SDK 57).

Değişenler:
- Kök `package.json`'a `overrides` ile `react` / `react-dom` **19.2.3**'e sabitlendi. React Native
  bu sürümü birebir istiyor; Prisma Studio'nun çektiği 19.3.0 ikinci bir React kopyası oluşturup
  uygulamayı çalışma anında bozuyordu. Bu satırları kaldırma.

---

## 2026-10-15 · Tasarım token'ları (`@vagabonds/ui`)

Kimler: **istemci tarafı** (Yiğit, Kübra)

1. Yeni workspace paketi eklendi; bağlamak için:
   ```bash
   npm install
   ```
2. Token'lar ve kontrast tablosu: [`packages/ui/README.md`](../packages/ui/README.md)

---

## 2026-10-14 · Bölüklerden yapay zekâ destekli taslak üretimi

Kimler: **veri girişi yapanlar** (Ahmet, Hüseyin)

1. Veri araçlarının bağımlılıklarını güncelle (`pypdf` eklendi):
   ```bash
   python3 -m pip install -r data/requirements.txt
   ```
2. Süreç: [`data/tools/extract/README.md`](../data/tools/extract/README.md) · kim hangi bölükte: [`data/kapsam.md`](../data/kapsam.md)

Değişenler:
- `data/eserler/` artık `draft` kayıtları da içerebilir: koordinat ve fotoğraf taslaklarda zorunlu değil, `in_review` öncesi eklenir. `npm run db:import` taslakları atlar.

---

## 2026-10-14 · Veri ekibinin modeline geçiş ([PR #9](https://github.com/Myxoceph/RootNCode-Hackathon/pull/9))

Kimler: **herkes**

1. **Python veri araçlarını kur** (doğrulama, içe aktarma, görsel hattı):
   ```bash
   python3 -m pip install -r data/requirements.txt
   ```
2. **`apps/api/.env` içindeki `DATABASE_URL`'den `?schema=public` kısmını sil.** Python sürücüsü bu parametreyi kabul etmiyor.
   ```diff
   - DATABASE_URL="postgresql://vagabonds:vagabonds@localhost:5432/vagabonds?schema=public"
   + DATABASE_URL="postgresql://vagabonds:vagabonds@localhost:5432/vagabonds"
   ```
3. **Veritabanını yeni şemaya taşı ve veriyi yükle:**
   ```bash
   npm install                                   # Prisma client yeni şemayla yeniden üretilir
   npm run db:up
   npm run db:deploy --workspace @vagabonds/api  # eski monuments tabloları kalkar, yeni tablolar kurulur
   npm run db:import                             # data/ veri setini içe aktarır ve şemayla uyumunu doğrular
   ```
   `db:import` sonunda `✓ DB = görüntüleyici: tüm tablolar ve satırlar birebir aynı` görmelisin.

Değişenler:
- `npm run db:seed` kaldırıldı; yerine `npm run db:import` (gerçek veri seti).
- `/monuments` uçları kaldırıldı; yerine `/assets` uçları geliyor.
- Veri araçlarını çalıştırırken `--create-schema` kullanma; şema Prisma migration'larıyla kuruluyor.

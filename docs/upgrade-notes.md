# Güncelleme Notları

`dev`'i çektikten sonra **bir kez** yapılması gereken adımlar. En yeni not en üstte.
Yeni bir kurulum gerekiyorsa (paket, ortam değişkeni, migration…) PR'ı açan kişi buraya bir madde ekler.

Her `git pull` sonrası kısa kontrol: aşağıda kendi son çektiğin tarihten yeni bir not var mı?

---

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

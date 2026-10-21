# Haftalık Rapor · Hafta 2 (16–22 Ekim 2026)

> Raporlar perşembe günleri teslim edildiği için bu rapor 16–22 Ekim'i kapsar (Hafta 1 raporundan
> sonra, 15 Ekim akşamı birleşen PR'lar dahil). Görevler: [`docs/sprints/week-02.md`](../sprints/week-02.md).

## Haftanın özeti
_2-3 cümle: Bu hafta ürün olarak nereye geldik? Demo edilebilir ne var?_

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
  - **A8 · `/assets` API'si ve sözleşme v0.2.0** ([#26](https://github.com/Myxoceph/RootNCode-Hackathon/pull/26)): `GET /assets` (şehir, tür, dönem, arama, harita kutusu, sayfalama) ve `GET /assets/:id`. Detayda bölümler, zaman çizelgesi, rivayetler, kitabeler, kişiler, görseller, ziyaretçi notları, ortam sesi ve her bilginin kaynağı (kitap + sayfa) ile güven düzeyi var. Dil `?lang=` ve `Accept-Language` ile seçiliyor; çekim koordinatları hiçbir yanıtta dönmüyor. Yanıtlar sözleşmeyle doğrulanıyor ve Swagger'da görünüyor.
  - **A9 · Kentsel ağ uçları** ([#27](https://github.com/Myxoceph/RootNCode-Hackathon/pull/27)): `GET /assets/:id/relations` bağları iki yönlü döndürüyor; yayında olmayan hedefler sayılıyor ama dönmüyor (Sis Açma'daki "keşfedilmemiş bağ" için). `GET /assets/:id/nearby` yakındaki eserleri mesafeye göre sıralıyor. `GET /meta/enums` filtre ve rozet listelerini etiketleri ve eser sayılarıyla veriyor.
  - **A13 · Demo sunucusu dağıtımı** ([#28](https://github.com/Myxoceph/RootNCode-Hackathon/pull/28)): API ve veri içe aktarma imajları, web uygulaması ve `/api` için Caddy (HTTPS, güvenlik başlıkları, istek boyutu sınırı), PostgreSQL yedekleme/geri yükleme. Yığın tek komutla kuruluyor; yerelde prova edildi. Kurulum adımları `docs/deploy.md`'de.
  - **Veri setinin yayına alınması** ([#25](https://github.com/Myxoceph/RootNCode-Hackathon/pull/25)): Doğrulanan 356 Bursa kaydı `published` oldu; koordinat ve fotoğraf isteğe bağlı hale geldi, böylece uygulama API'den gerçek veri alabiliyor.
  - **Hatay envanteri** ([#29](https://github.com/Myxoceph/RootNCode-Hackathon/pull/29), [#30](https://github.com/Myxoceph/RootNCode-Hackathon/pull/30)): Hatay için tek kaynak bir PDF kitap olduğundan kitabı eserlere bölen bir araç yazıldı (`data/tools/extract/hatay_book.py`: 77 eser, 349 fotoğraf, ilçe ve parsel eşleşmesiyle). Görsel hattı yerel kaynaktan fotoğraf alabiliyor. Bu araçla 116 kayıt üretildi; `validate.py` tüm veri setinde hatasız.
  - **Hatay fotoğrafları ve yayın** ([#35](https://github.com/Myxoceph/RootNCode-Hackathon/pull/35), [#37](https://github.com/Myxoceph/RootNCode-Hackathon/pull/37)): Kitaptaki 348 fotoğraf 109 kayda bağlandı; her biri Türkçe ve İngilizce altyazı ve alt metinle birlikte. Kitapta kendi fotoğrafı olmayan 7 kayıt var. 116 Hatay kaydı `published` oldu. Atanması belirsiz 8 fotoğraf insan kontrolü için [#36](https://github.com/Myxoceph/RootNCode-Hackathon/issues/36)'da.
  - **API güvenliği** ([#32](https://github.com/Myxoceph/RootNCode-Hackathon/pull/32)): IP başına istek sınırı (dakikada 120, `429 RATE_LIMITED`), güvenlik başlıkları, istek boyutu sınırı; vekil sunucu arkasında gerçek istemci IP'si (`TRUST_PROXY`).
  - **Ziyaretçi Nabzı** ([#33](https://github.com/Myxoceph/RootNCode-Hackathon/pull/33)): takma adla anonim oturum, katkı gönderme (ipucu, anı, düzeltme), moderasyon kuyruğu (onay, ret, engelleme) ve eserin nabız akışı.
  - **Vakıf Travel Planner & Hava Durumu** ([#39](https://github.com/Myxoceph/RootNCode-Hackathon/pull/39)): `GET /routes/plan` süre bütçesine sığan tematik yürüyüş rotası (tür, dönem ya da Kentsel Ağ bağları); `GET /weather` Open-Meteo'dan anlık hava durumu, ulaşılamazsa `available: false`. Yağmurda ve sıcakta kapalı mekânlar öne alınıyor. Sözleşme v0.2.3.
  - **Eser koordinatları** ([#38](https://github.com/Myxoceph/RootNCode-Hackathon/pull/38), [#45](https://github.com/Myxoceph/RootNCode-Hackathon/pull/45)): 472 eserin 303'ünde koordinat var (Bursa 272/356, Hatay 31/116). Kaynaklar: fotoğrafların EXIF GPS'i (Drive arşivindeki fotoğraflar kitap sayfasıyla eserlere eşlendi), OpenStreetMap ve bağlı olunan yapı. Hepsi `verified: false`; aynı esere ait EXIF ile OSM noktaları arasındaki medyan fark 20-30 m.
  - **Bursa fotoğrafları** ([#47](https://github.com/Myxoceph/RootNCode-Hackathon/pull/47)): Fotoğrafı olmayan 238 Bursa kaydına kitapta basılı 506 fotoğraf bağlandı (bölük PDF'lerinden, kayıt başına en çok 3), Türkçe ve İngilizce altyazı ve alt metinle. Fotoğraflı Bursa kaydı 49'dan 287'ye çıktı; R2'de toplam 1010 fotoğraf (1,1 GB).
  - **A11 · Şema değişikliği belgesi**: `data/README.md` §5'e şemanın esas kaynağının Prisma migration'ları olduğu ve yeni bir tablo değişikliğinin adım adım nasıl yapılacağı eklendi.
- **Devam edenler:**
  - **A10 · Medyanın R2'ye yüklenmesi:** Kayıtlara bağlı 1010 fotoğrafın (Bursa 662, Hatay 348) 3998 sürümü R2'de, toplam 1,1 GB. API'nin döndürdüğü görsel adresleri açılıyor. Orijinaller yüklenmiyor, kaynağında kalıyor (Drive / kitap PDF'i); böylece üç şehir de R2'nin 10 GB'lık ücretsiz kotasına sığıyor. Kalan: yüklemenin CI'a alınması.
  - **A12 · İlk `main` sürümü:** Bilinçli olarak bekletiliyor. Çalışan sürüm uygulamayla birlikte çıkacak; uygulama API'ye bağlanınca (Y8, Y9) açılacak.
- **Engeller / ihtiyaçlar:**
  - 169 eserde hâlâ koordinat yok (Bursa 84, Hatay 85). Antakya'nın tarihî camileri OpenStreetMap'te yok; Hatay için parsel ve mıntıka bilgisinden elle konum gerekiyor.
  - Hatay'da kilise, değirmen, höyük ve makam için `asset_types` kodu yok (E2 ile birlikte karar verilmeli).
- **Gelecek hafta:**
  - Kalan koordinatlar ([#46](https://github.com/Myxoceph/RootNCode-Hackathon/issues/46), elle kontrol listesi).
  - Gastronomi ve ortam sesleri için veri uçları (içerik Hüseyin'le).
  - Dağıtımın VDS'te provası.

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
  - **Bursa envanterinin tamamı taslak olarak çıkarıldı** ([#19](https://github.com/Myxoceph/RootNCode-Hackathon/pull/19), [#20](https://github.com/Myxoceph/RootNCode-Hackathon/pull/20), [#21](https://github.com/Myxoceph/RootNCode-Hackathon/pull/21), [#22](https://github.com/Myxoceph/RootNCode-Hackathon/pull/22), [#23](https://github.com/Myxoceph/RootNCode-Hackathon/pull/23)): Veri setindeki kayıt sayısı 141'den 356'ya çıktı. Cilt 1 (Osmangazi: türbelerin ikinci yarısı, camiler ve hazireler 1-3), Cilt 2 (Yıldırım: Emir Sultan, Umurbey, Yeşil ve Yıldırım külliyeleri, camiler, kalan bölümler) ve Cilt 3'ün kalan ilçeleri (İznik, İnegöl, Yenişehir) tamamlandı. `data/kapsam.md`'de sırada bekleyen bölük kalmadı. İlişki hedefleri kitaptaki adlara göre düzeltildi.
- **Devam edenler:**
  - Taslakların kaynakla kontrolü, koordinat ve fotoğraf eklenerek `in_review`'a alınması (354 taslak, 2 `in_review`).
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | |
| Veri setindeki eser sayısı (taslak / incelemede / yayında) | 472 (0 / 0 / 472) |
| Tamamlanan modüller (1-8) | |

## Alınan kararlar
_Bu hafta alınan teknik/ürün kararları ve varsa ADR linkleri ([`docs/decisions/`](../decisions/))._

## Riskler
| Risk | Etki | Önlem |
|---|---|---|

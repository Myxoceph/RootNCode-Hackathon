# Haftalık Rapor · Hafta 3 (23–29 Ekim 2026)

> Görevler: [`docs/sprints/week-03.md`](../sprints/week-03.md).

## Haftanın özeti
_2-3 cümle: Bu hafta ürün olarak nereye geldik? Demo edilebilir ne var?_

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
  - **Y12 · MindAR ve MapLibre uygulamayla birlikte** ([#58](https://github.com/Myxoceph/RootNCode-Hackathon/pull/58)): İki kütüphane artık jsDelivr'den inmiyor, AR ve harita sayfasının içine gömülüyor (`npm run vendor`, `apps/app/src/vendor/`). Kütüphaneler ihtiyaç anında yükleniyor; web'de ayrı parça oldukları için ilk açılış yavaşlamadı. Lisansları `apps/app/src/vendor/LICENSES.md`'de. Web'de jsDelivr engelliyken ve Honor 400'de (Expo Go) denendi: AR kitabeyi tanıdı, harita 1 sn'de çizildi, uygulamanın açılış hızı değişmedi. Harita karoları hâlâ OpenFreeMap'ten geliyor.
  - **Y10 · Taşın Dili gerçek kitabe takibiyle** ([#59](https://github.com/Myxoceph/RootNCode-Hackathon/pull/59)): Zamanlayıcı yerine MindAR'ın `found` / `lost` olayları. Ekran "Kamera açılıyor… → Kitabe aranıyor… → Kitabe tanındı" diye ilerliyor, köşeler kitabenin gerçek yerine çiziliyor, kısa bir süre sonra kart açılıyor. Kart açılmadan kitabe kadrajdan çıkarsa ekran aramaya dönüyor; kart açıldıktan sonra okurken kapanmıyor. Kitabe metni örnek içerikten değil, Ulucami kaydından geliyor (minber kapısı kitabesi: yer, tarih, günümüz Türkçesi, okunuş, vakıf, kaynak); kamerasız okuma modu da aynı veriye bağlandı. Kamera açılamazsa (izin yok, kamera yok, kütüphane yüklenemedi) ekran nedenini söyleyip okuma moduna geçiyor; ekran okuyucu açıkken doğrudan okuma moduyla başlıyor. Gerçek hedef (H7) gelene kadar iki test görseli de bu kitabeye eşleniyor, kartta "test görseli" notu var. Honor 400'de iki görsel, kadrajdan çıkma, yeniden tarama, izin reddi ve TalkBack denendi.
  - **Y11 · Harita sekmesi MapLibre'de, gerçek eser ve bağlarla** ([#60](https://github.com/Myxoceph/RootNCode-Hackathon/pull/60)): Elle çizilmiş SVG harita ve örnek ağ (`content/bursa-network.ts`) kalktı. Oyun Ulucami açıkken başlıyor; açılan eserin bağları `/assets/:id/relations`'tan geliyor, sisli uçlara altın kesikli ipucu çizgisi düşüyor, ipucundaki eser açılınca bağ türünün renginde çiziliyor. Ağda gelir ve su, aynı banî ve aynı üslup bağları var; yan yana yapıları bağlayan `same_complex` ve `urban_context` dışarıda. Sis, açıklıklar ve bağlar haritanın üstündeki bir tuvale çiziliyor. Harita ekran okuyucudan gizli; seçili eser, bağın açıklaması ve "sisi aç" düğmesi alt panelde, haritasız karşılık "Tüm eserler" listesi. "Hareketi azalt" açıkken açıklıklar büyümeden açılıyor, ipucu halkası atmıyor. Web'de ve Honor 400'de denendi.
  - **Y14 · Görseller kendi alan adımızdan** ([#62](https://github.com/Myxoceph/RootNCode-Hackathon/pull/62)): `r2.dev` Türk operatörlerde engelli olduğu için görseller artık `https://media.allbytech.com` adresinden geliyor. Bucket Ahmet'in hesabında, alan adı benim hesabımda; R2 özel alan adını yalnızca aynı hesaba bağlayabildiği için araya küçük bir Cloudflare Worker kondu (`deploy/media-worker/`). Worker istekleri bucket'a iletip başarılı cevapları 30 gün önbellekte tutuyor (bulunamayan dosya 1 dk, sunucu hatası hiç tutulmuyor); görseller kopyalanmadı, R2'ye yükleme düzeni değişmedi. `MEDIA_BASE_URL`'in varsayılanı yeni adres. Ev internetinden ve mobil veriden, uygulamada da eser kartlarının kapak fotoğraflarıyla denendi.
- **Devam edenler:** Üzerinde çalışılan iş yok; Y13 ve Y15 başkalarını bekliyor (bkz. Engeller).
- **Engeller / ihtiyaçlar:**
  - **Y13 · AR hedefi veriden:** Hüseyin'in Ulucami minber kapısı kitabesi görseli (H7) ve `.mind` dosyasının veri hattında derlenip R2'ye konması (A15) bekleniyor. `.mind` dosyasının adresi için sözleşmeye bir alan eklenmesi gerekiyor (Ahmet ile).
  - **Veride kitabenin asıl metni yok:** Kayıtlarda kitabenin okunuşu ve günümüz Türkçesi var, Arapça ya da Osmanlıca asıl metni yok. Bu yüzden Taşın Dili'ndeki "Orijinal hat" bölümü kaldırıldı; alan veri setine eklenirse geri gelebilir (Hüseyin).
  - **Y15 · iOS testi:** VoiceOver, AR kamerası ve harita iOS'ta hâlâ denenmedi; ekipte bir iPhone gerekiyor.
- **Gelecek hafta:**
  - Y13: AR hedefinin API'den gelmesi (H7 ve A15 ile).
  - Demo sunucusunun görselleri yeni adresten verdiğinin kontrolü (Ahmet ile, A12): `deploy/.env` eski `.env.example`'dan kopyalandıysa `MEDIA_BASE_URL` hâlâ `r2.dev`'i gösteriyordur ve yenisiyle değiştirilmeli.
  - iOS testi ve demo provası (E3).

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
- **Devam edenler:**
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | |
| Veri setindeki eser sayısı (taslak / incelemede / yayında) | |
| Tamamlanan modüller (1-8) | |

## Alınan kararlar
_Bu hafta alınan teknik/ürün kararları ve varsa ADR linkleri ([`docs/decisions/`](../decisions/))._
- **AR ve harita kütüphaneleri uygulamanın içinde** ([ADR 0002](../decisions/0002-ar-approach.md), [ADR 0003](../decisions/0003-map-approach.md)): CDN'e erişilemese de kitabe takibi ve harita açılıyor; bedeli telefon paketinde yaklaşık 2,6 MB.
- **Sis haritasında yalnızca açılan eserlerin bağları çekiliyor** ([ADR 0003](../decisions/0003-map-approach.md)): Bütün bağları veren bir uç nokta yok, 356 Bursa eseri için ayrı istek de anlamsız. Oyunun mantığı da bunu istiyor: bir eser açılınca ondan çıkan bağlar görünür.
- **Ağda sayılan bağ türleri:** Gelir ve su (`waqf_income`, `waqf_land`, `water_supply`), aynı banî (`same_founder`), aynı üslup (`architectural_lineage`, `same_architect`, `same_craftsman`). `same_complex` ve `urban_context` dışarıda.
- **R2'nin özel alan adı Yiğit'in Cloudflare hesabında** (Y14).

## Riskler
| Risk | Etki | Önlem |
|---|---|---|
| Demo sunucusu görselleri hâlâ `r2.dev`'den veriyor olabilir | Jüri dahil Türkiye'deki kullanıcılar demo sunucusunda fotoğrafları göremez | Sunucudaki `deploy/.env`'de `MEDIA_BASE_URL` kontrol edilip `https://media.allbytech.com` yapılmalı (A12) |
| Görseller, Ahmet'in bucket'ının genel `r2.dev` adresine bağlı (Worker oradan okuyor) | Bucket'ın genel erişimi kapatılırsa ya da `r2.dev` hız sınırına takılırsa `media.allbytech.com` görsel veremez | Genel erişim açık kalmalı. Kapatılması gerekirse Worker'ın S3 arayüzünden salt okunur bir anahtarla, istekleri kendisi imzalayarak (SigV4) okuması gerekir: küçük ama gerçek bir kod işi, demo öncesine bırakılmamalı |
| Harita karoları OpenFreeMap'ten geliyor | İnternet yoksa ya da OpenFreeMap'e erişilemezse altlık boş kalır; sis, pinler ve alt panel çalışır | Demo ağında önceden denemek |
| AR hedefi hâlâ test görseli (H7 bekleniyor) | Demoda gerçek kitabe yerine ekrandaki ya da kâğıttaki görsel taranır | H7 gelince hedef değişir; olmazsa test görseliyle demo, kartta "test görseli" notu var |

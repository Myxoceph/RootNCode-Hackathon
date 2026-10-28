# Haftalık Rapor · Hafta 3 (23–29 Ekim 2026)

> Görevler: [`docs/sprints/week-03.md`](../sprints/week-03.md).

## Haftanın özeti
Bu hafta uygulama prototip ekranlardan gerçek deneyimlere geçti. Harita sekmesi artık gerçek bir harita: Bursa eserleri sis altında, bir eser açılınca bağları API'den geliyor. Taşın Dili kamerayla kitabeyi gerçekten tanıyor, Zaman Perdesi gerçek kamerayla çalışıyor, Ses Kapsülü telefonda ses çalıyor, Ziyaretçi Notları sekmesinden not bırakılabiliyor. Görseller Türkiye'de engellenen `r2.dev` yerine kendi alan adımızdan (`media.allbytech.com`) geliyor. AR ve harita kütüphaneleri uygulamanın içinde, harita altlığı önbellekli kendi adresimizden geliyor; bağlantı koparsa uygulama son indirdiği veriyle açılmaya devam ediyor.

Demo edilebilir olanlar: Expo Go gerektirmeyen Android APK, mobil veriyle `vagabonds.allbytech.com` üzerinden yayındaki API'ye bağlanıp eserleri, haritayı, kitabe okumayı, kapsülü ve Zaman Perdesi'ni gösteriyor (Honor 400'de denendi). Eksik kalan gerçek içerik: kitabe AR görseli, arşiv fotoğrafları ve ortam sesi kayıtları; bunlar gelene kadar uygulama test görseli, kapak fotoğrafı ve canlandırılmış seslerle çalışıyor.

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
  - **Backend değişikliklerinin incelenmesi:** Bu hafta API ve sözleşmeye istemci ihtiyacıyla gelen değişiklikler (kitabelerde `arTarget`, sözleşme 0.3.1 ([#66](https://github.com/Myxoceph/RootNCode-Hackathon/pull/66)); ziyaretçi notlarının Türkiye saatine göre tarihlenmesi ([#78](https://github.com/Myxoceph/RootNCode-Hackathon/pull/78)); görsellerin yeni varsayılan adresi ([#62](https://github.com/Myxoceph/RootNCode-Hackathon/pull/62))) incelendi. Yerelde bütün CI adımları temiz: API 106, uygulama 52 test.
  - **A15 · AR hedeflerinin sunulması:** `.mind` dosyasını veri hattında derleyip fotoğrafın yanına koyan ve API'de adresini veren altyapı Y13 ile birlikte tamamlandı ([#66](https://github.com/Myxoceph/RootNCode-Hackathon/pull/66)). Gerçek hedef H7'nin fotoğrafını bekliyor.
- **Devam edenler:**
  - **A12 · İlk `main` sürümü:** Demo, sunucu yerine Cloudflare Tunnel ile yayınlanıyor ([#67](https://github.com/Myxoceph/RootNCode-Hackathon/pull/67)). `dev` → `main` sürüm PR'ı perşembe akşamına kadar açılacak; öncesinde demo adresinde uçtan uca kontrol.
  - **A14 · Ses ve gastronomi uçları:** Uygulama ses kayıtlarını doğrudan `media.allbytech.com/sounds/<anahtar>.mp3` adresinden okuyor; ayrı bir ses ucu gerekmeyebilir. Gastronomi ucu içerikle (H9) birlikte yazılacak.
  - **A10 · Medya yüklemesinin CI'a alınması:** Bekliyor; şimdilik yükleme elle yapılıyor.
- **Engeller / ihtiyaçlar:**
  - Demo yayını tek bir bilgisayara bağlı: tünel kapalıyken (bilgisayar uykuda ya da kapalıyken) `vagabonds.allbytech.com` açılmıyor. Demo günü ve provalarda bilgisayarın açık kalması gerekiyor.
- **Gelecek hafta:**
  - `main` sürümünden sonra demo provası (E3) ve demo günü yayınının güvenceye alınması.
  - İçerik geldikçe gastronomi ucu (A14) ve ses kayıtlarının yüklenmesi.

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
  - Bu hafta veri tarafında yeni PR olmadı.
- **Devam edenler:**
  - H9: Ortam sesleri (CC0) ve şehir bazlı gastronomi içeriği.
- **Engeller / ihtiyaçlar:**
  - Uygulamanın gerçek içerik bekleyen üç ekranı veri tarafına bağlı: Ulucami kitabesinin AR görseli (H7), Zaman Perdesi için arşiv fotoğrafı (H8) ve kapsül sesleri (H9). Hepsinde altyapı hazır; dosyalar eklenince kod değişmeden devreye giriyor.
- **Gelecek hafta:**
  - H9 (sesler ve gastronomi), H7 ve H8.
  - Kalan koordinatlar ([#46](https://github.com/Myxoceph/RootNCode-Hackathon/issues/46)).

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
  - **Y12 · MindAR ve MapLibre uygulamayla birlikte** ([#58](https://github.com/Myxoceph/RootNCode-Hackathon/pull/58)): İki kütüphane artık jsDelivr'den inmiyor, AR ve harita sayfasının içine gömülüyor (`npm run vendor`, `apps/app/src/vendor/`). Kütüphaneler ihtiyaç anında yükleniyor; web'de ayrı parça oldukları için ilk açılış yavaşlamadı. Lisansları `apps/app/src/vendor/LICENSES.md`'de. Web'de jsDelivr engelliyken ve Honor 400'de (Expo Go) denendi: AR kitabeyi tanıdı, harita 1 sn'de çizildi, uygulamanın açılış hızı değişmedi. Harita karoları hâlâ OpenFreeMap'ten geliyor.
  - **Y10 · Taşın Dili gerçek kitabe takibiyle** ([#59](https://github.com/Myxoceph/RootNCode-Hackathon/pull/59)): Zamanlayıcı yerine MindAR'ın `found` / `lost` olayları. Ekran "Kamera açılıyor… → Kitabe aranıyor… → Kitabe tanındı" diye ilerliyor, köşeler kitabenin gerçek yerine çiziliyor, kısa bir süre sonra kart açılıyor. Kart açılmadan kitabe kadrajdan çıkarsa ekran aramaya dönüyor; kart açıldıktan sonra okurken kapanmıyor. Kitabe metni örnek içerikten değil, Ulucami kaydından geliyor (minber kapısı kitabesi: yer, tarih, günümüz Türkçesi, okunuş, vakıf, kaynak); kamerasız okuma modu da aynı veriye bağlandı. Kamera açılamazsa (izin yok, kamera yok, kütüphane yüklenemedi) ekran nedenini söyleyip okuma moduna geçiyor; ekran okuyucu açıkken doğrudan okuma moduyla başlıyor. Gerçek hedef (H7) gelene kadar iki test görseli de bu kitabeye eşleniyor, kartta "test görseli" notu var. Honor 400'de iki görsel, kadrajdan çıkma, yeniden tarama, izin reddi ve TalkBack denendi.
  - **Y11 · Harita sekmesi MapLibre'de, gerçek eser ve bağlarla** ([#60](https://github.com/Myxoceph/RootNCode-Hackathon/pull/60)): Elle çizilmiş SVG harita ve örnek ağ (`content/bursa-network.ts`) kalktı. Oyun Ulucami açıkken başlıyor; açılan eserin bağları `/assets/:id/relations`'tan geliyor, sisli uçlara altın kesikli ipucu çizgisi düşüyor, ipucundaki eser açılınca bağ türünün renginde çiziliyor. Ağda gelir ve su, aynı banî ve aynı üslup bağları var; yan yana yapıları bağlayan `same_complex` ve `urban_context` dışarıda. Sis, açıklıklar ve bağlar haritanın üstündeki bir tuvale çiziliyor. Harita ekran okuyucudan gizli; seçili eser, bağın açıklaması ve "sisi aç" düğmesi alt panelde, haritasız karşılık "Tüm eserler" listesi. "Hareketi azalt" açıkken açıklıklar büyümeden açılıyor, ipucu halkası atmıyor. Web'de ve Honor 400'de denendi.
  - **Y14 · Görseller kendi alan adımızdan** ([#62](https://github.com/Myxoceph/RootNCode-Hackathon/pull/62)): `r2.dev` Türk operatörlerde engelli olduğu için görseller artık `https://media.allbytech.com` adresinden geliyor. Bucket Ahmet'in hesabında, alan adı benim hesabımda; R2 özel alan adını yalnızca aynı hesaba bağlayabildiği için araya küçük bir Cloudflare Worker kondu (`deploy/media-worker/`). Worker istekleri bucket'a iletip başarılı cevapları 30 gün önbellekte tutuyor (bulunamayan dosya 1 dk, sunucu hatası hiç tutulmuyor); görseller kopyalanmadı, R2'ye yükleme düzeni değişmedi. `MEDIA_BASE_URL`'in varsayılanı yeni adres. Ev internetinden ve mobil veriden, uygulamada da eser kartlarının kapak fotoğraflarıyla denendi.
  - **Y13 · AR hedefi veriden** ([#66](https://github.com/Myxoceph/RootNCode-Hackathon/pull/66)): Kitabelerde `arTarget` alanı (sözleşme 0.3.1); `npm run data:ar-targets` hedef fotoğrafından `.mind` dosyasını derleyip fotoğrafın yanına koyuyor, içe aktarma derlenmemiş ya da eski hedefi boş bırakıyor. Uygulama hedefi API'den alıyor; yoksa test görsellerine dönüyor.
  - **Demo yayını** ([#67](https://github.com/Myxoceph/RootNCode-Hackathon/pull/67)): Demo, Cloudflare Tunnel ile bir bilgisayardan `https://vagabonds.allbytech.com` adresinde yayınlanıyor; API'nin hız sınırı ziyaretçinin gerçek IP'sini sayıyor.
  - **Y18 · Android APK** ([#69](https://github.com/Myxoceph/RootNCode-Hackathon/pull/69)): Expo Go'suz, yayındaki API'ye bağlı demo APK'sı bilgisayarda derleniyor. Honor 400'de Wi-Fi kapalıyken, mobil veriyle bütün sekmeler denendi.
  - **Y16 · Zaman Perdesi gerçek kamerayla** ([#70](https://github.com/Myxoceph/RootNCode-Hackathon/pull/70)): `expo-camera` vizörünün üstünde eserin fotoğrafı yarı saydam şablon; arşiv fotoğrafı (H8) gelene kadar kapak fotoğrafı kullanılıyor. Kamerasız karşılık web'de, ekran okuyucu açıkken ve izin reddinde açılıyor.
  - **Y19 · Harita altlığı kendi adresimizden** ([#71](https://github.com/Myxoceph/RootNCode-Hackathon/pull/71)): `tiles.allbytech.com`, OpenFreeMap'in önünde 30 gün önbellekli bir Worker; Bursa'nın karoları önceden doldurulabiliyor (`npm run map:warm`).
  - **Y17 · Ses Kapsülü telefonda sesli** ([#73](https://github.com/Myxoceph/RootNCode-Hackathon/pull/73), [#74](https://github.com/Myxoceph/RootNCode-Hackathon/pull/74)): `expo-audio` ile oynatma; gerçek kayıt yoksa canlandırılmış ses, o da çalmazsa yalnızca altyazı.
  - **Eser sayfasından kamera deneyimleri** ([#75](https://github.com/Myxoceph/RootNCode-Hackathon/pull/75)): Her eser kendi Taşın Dili ve Zaman Perdesi'ni açıyor; AR hedefi olmayan eserde kitabe doğrudan okuma moduyla geliyor.
  - **Çevrimdışı veri** ([#76](https://github.com/Myxoceph/RootNCode-Hackathon/pull/76), [#77](https://github.com/Myxoceph/RootNCode-Hackathon/pull/77)): API yanıtları cihazda saklanıyor; bağlantı yoksa ya da yavaşsa ekranlar son veriyle açılıyor ve "Çevrimdışı" şeridi çıkıyor.
  - **Ziyaretçi Notları uygulamada** ([#78](https://github.com/Myxoceph/RootNCode-Hackathon/pull/78), [#79](https://github.com/Myxoceph/RootNCode-Hackathon/pull/79)): Eser sayfasında nabız akışı ve "Not bırak" formu (takma adla anonim oturum), Profil'de "Notlarım" ve her notun moderasyon durumu.
  - **Uygulamanın ilk birim testleri** ([#80](https://github.com/Myxoceph/RootNCode-Hackathon/pull/80)): Vitest ile 52 test (istekler, çevrimdışı önbellek, ziyaretçi oturumu, kapsül oynatıcı).
- **Devam edenler:** Üzerinde çalışılan iş yok; Y13'ün gerçek hedefi ve Y15 başkalarını bekliyor (bkz. Engeller).
- **Engeller / ihtiyaçlar:**
  - **Y13 · Gerçek AR hedefi:** Altyapı hazır ([#66](https://github.com/Myxoceph/RootNCode-Hackathon/pull/66)); Hüseyin'in Ulucami minber kapısı kitabesi görseli (H7) bekleniyor.
  - **Veride kitabenin asıl metni yok:** Kayıtlarda kitabenin okunuşu ve günümüz Türkçesi var, Arapça ya da Osmanlıca asıl metni yok. Bu yüzden Taşın Dili'ndeki "Orijinal hat" bölümü kaldırıldı; alan veri setine eklenirse geri gelebilir (Hüseyin).
  - **Y15 · iOS testi:** VoiceOver, AR kamerası ve harita iOS'ta hâlâ denenmedi; ekipte bir iPhone gerekiyor.
- **Gelecek hafta:**
  - Y13: H7 görseli gelince gerçek hedefin denenmesi.
  - Demo sunucusunun görselleri yeni adresten verdiğinin kontrolü (Ahmet ile, A12): `deploy/.env` eski `.env.example`'dan kopyalandıysa `MEDIA_BASE_URL` hâlâ `r2.dev`'i gösteriyordur ve yenisiyle değiştirilmeli.
  - iOS testi ve demo provası (E3).

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
  - Bu hafta arayüz tarafında yeni PR olmadı. Yiğit'in yeni ekranları (harita, Taşın Dili, Zaman Perdesi) Hayrat tasarım sisteminin bileşen ve temalarını kullanıyor.
- **Devam edenler:**
  - Arayüzün son görünümü.
- **Engeller / ihtiyaçlar:**
- **Gelecek hafta:**
  - Arayüzün son görünümünün uygulamaya geçmesi; demo öncesi çalışan ekranları bozmadan.

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | 26 |
| Veri setindeki eser sayısı (taslak / incelemede / yayında) | 472 (0 / 0 / 472) |
| Tamamlanan modüller (1-8) | |

## Alınan kararlar
_Bu hafta alınan teknik/ürün kararları ve varsa ADR linkleri ([`docs/decisions/`](../decisions/))._
- **AR ve harita kütüphaneleri uygulamanın içinde** ([ADR 0002](../decisions/0002-ar-approach.md), [ADR 0003](../decisions/0003-map-approach.md)): CDN'e erişilemese de kitabe takibi ve harita açılıyor; bedeli telefon paketinde yaklaşık 2,6 MB.
- **Sis haritasında yalnızca açılan eserlerin bağları çekiliyor** ([ADR 0003](../decisions/0003-map-approach.md)): Bütün bağları veren bir uç nokta yok, 356 Bursa eseri için ayrı istek de anlamsız. Oyunun mantığı da bunu istiyor: bir eser açılınca ondan çıkan bağlar görünür.
- **Ağda sayılan bağ türleri:** Gelir ve su (`waqf_income`, `waqf_land`, `water_supply`), aynı banî (`same_founder`), aynı üslup (`architectural_lineage`, `same_architect`, `same_craftsman`). `same_complex` ve `urban_context` dışarıda.
- **R2'nin özel alan adı Yiğit'in Cloudflare hesabında** (Y14).
- **Demo, sunucu yerine Cloudflare Tunnel ile bir bilgisayardan yayınlanıyor** (A12, [#67](https://github.com/Myxoceph/RootNCode-Hackathon/pull/67)): Port yönlendirme, sabit IP ve sertifika gerekmiyor; HTTPS'i Cloudflare veriyor.
- **Demo telefonu Expo Go'suz APK ile** (Y18): Telefon ile bilgisayarın aynı ağda olması gerekmiyor.
- **Uygulama çevrimdışı da açılıyor:** Son başarılı API yanıtları cihazda saklanıyor; demo mobil veriyle yapılacağı için.

## Riskler
| Risk | Etki | Önlem |
|---|---|---|
| Demo sunucusu görselleri hâlâ `r2.dev`'den veriyor olabilir | Jüri dahil Türkiye'deki kullanıcılar demo sunucusunda fotoğrafları göremez | Sunucudaki `deploy/.env`'de `MEDIA_BASE_URL` kontrol edilip `https://media.allbytech.com` yapılmalı (A12) |
| Görseller, Ahmet'in bucket'ının genel `r2.dev` adresine bağlı (Worker oradan okuyor) | Bucket'ın genel erişimi kapatılırsa ya da `r2.dev` hız sınırına takılırsa `media.allbytech.com` görsel veremez | Genel erişim açık kalmalı. Kapatılması gerekirse Worker'ın S3 arayüzünden salt okunur bir anahtarla, istekleri kendisi imzalayarak (SigV4) okuması gerekir: küçük ama gerçek bir kod işi, demo öncesine bırakılmamalı |
| Harita karoları OpenFreeMap'ten geliyor | İnternet yoksa ya da OpenFreeMap'e erişilemezse altlık boş kalır; sis, pinler ve alt panel çalışır | Demo ağında önceden denemek |
| Demo yayını tek bir bilgisayara bağlı (tünel) | Bilgisayar kapalı ya da uykudayken demo adresi açılmaz | Demo ve provalarda bilgisayar açık ve uyku kapalı; uygulamanın çevrimdışı önbelleği kısa kesintileri karşılıyor |
| Gerçek içerik eksik (H7, H8, H9) | Demoda test görseli, kapak fotoğrafı ve canlandırılmış sesler kullanılır | Altyapı hazır, dosyalar gelince kod değişmeden devreye girer |
| AR hedefi hâlâ test görseli (H7 bekleniyor) | Demoda gerçek kitabe yerine ekrandaki ya da kâğıttaki görsel taranır | H7 gelince hedef değişir; olmazsa test görseliyle demo, kartta "test görseli" notu var |

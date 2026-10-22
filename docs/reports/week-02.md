# Haftalık Rapor · Hafta 2 (16–22 Ekim 2026)

> Raporlar perşembe günleri teslim edildiği için bu rapor 16–22 Ekim'i kapsar (Hafta 1 raporundan
> sonra, 15 Ekim akşamı birleşen PR'lar dahil). Görevler: [`docs/sprints/week-02.md`](../sprints/week-02.md).

## Haftanın özeti
Bu hafta Vagabonds örnek içerikle çalışan bir arayüzden gerçek veriyle çalışan bir uygulamaya geçti. Bursa envanterinin kalan ciltleri ve Hatay kitabı eserlere ayrıldı; kontrol edilen 472 eserin (Bursa 356, Hatay 116) hepsi yayında. Kitaplardaki fotoğraflar eserlerle eşleştirildi. Fotoğraf arşivinin GPS bilgisi ve OpenStreetMap ile eserlere konum bulundu. Böylece 396 eserde Türkçe ve İngilizce altyazılı, alt metinli fotoğraf, 303 eserde koordinat var. Kiliseler, makamlar ve köprüler gibi yapılar artık "Diğer" altında değil, kendi türleriyle listeleniyor.

Backend'de eser listesi ve detayı, Kentsel Ağ bağları, yakındaki eserler, Travel Planner ile hava durumu ve Ziyaretçi Nabzı (anonim katkı ve moderasyon) uçları hazır. Hepsi ortak sözleşmeden geçiyor ve istek sınırı ile güvenlik başlıklarıyla korunuyor. Uygulama Hayrat tasarımına geçti: dört tema (ikisi yüksek kontrast), web'de de ekran okuyucuya rolünü ve durumunu doğru bildiren bileşenler, güven ve kaynak rozetleri, kitabeler için kamerasız okuma modu. Liste ve detay ekranları API'den besleniyor; her bilginin yanında kitap ve sayfası, tahmini ve tartışmalı bilgilerde ayrı bir rozet duruyor. Uygulama Android'de TalkBack ve en büyük yazı boyutuyla uçtan uca denendi. Kitabe AR'ı için MindAR'ı WebView içinde çalıştıran yaklaşım seçildi; prototip telefonda taş kitabe fotoğrafını tanıyıp takip ediyor; gerçek kitabe önünde deneme sahada yapılacak.

Demo edilebilir olanlar: yerelde API ve uygulama birlikte çalışıyor; eserler gezilip kaynaklarıyla okunabiliyor, şehre göre süzülebiliyor. Önümüzdeki haftanın ilk işi görselleri Türkiye'den erişilebilir kılmak ve demo sunucusuna dağıtım. Görsellerin barındırıldığı `r2.dev` alan adı Türkiye'de erişime kapalı; çözüm R2'ye özel alan adı bağlamak.

## Ekip

### Ahmet Bakırcan · Backend & Sistem Mimarisi
- **Tamamlananlar:**
  - **A8 · `/assets` API'si ve sözleşme v0.2.0** ([#26](https://github.com/Myxoceph/RootNCode-Hackathon/pull/26)): `GET /assets` (şehir, tür, dönem, arama, harita kutusu, sayfalama) ve `GET /assets/:id`. Detayda bölümler, zaman çizelgesi, rivayetler, kitabeler, kişiler, görseller, ziyaretçi notları, ortam sesi ve her bilginin kaynağı (kitap + sayfa) ile güven düzeyi var. Dil `?lang=` ve `Accept-Language` ile seçiliyor; çekim koordinatları hiçbir yanıtta dönmüyor. Yanıtlar sözleşmeyle doğrulanıyor ve Swagger'da görünüyor.
  - **A9 · Kentsel ağ uçları** ([#27](https://github.com/Myxoceph/RootNCode-Hackathon/pull/27)): `GET /assets/:id/relations` bağları iki yönlü döndürüyor; yayında olmayan hedefler sayılıyor ama dönmüyor (Sis Açma'daki "keşfedilmemiş bağ" için). `GET /assets/:id/nearby` yakındaki eserleri mesafeye göre sıralıyor. `GET /meta/enums` filtre ve rozet listelerini etiketleri ve eser sayılarıyla veriyor.
  - **A13 · Demo sunucusu dağıtımı** ([#28](https://github.com/Myxoceph/RootNCode-Hackathon/pull/28)): API ve veri içe aktarma imajları, web uygulaması ve `/api` için Caddy (HTTPS, güvenlik başlıkları, istek boyutu sınırı), PostgreSQL yedekleme/geri yükleme. Yığın tek komutla kuruluyor; yerelde prova edildi. Kurulum adımları `docs/deploy.md`'de.
  - **API güvenliği** ([#32](https://github.com/Myxoceph/RootNCode-Hackathon/pull/32)): IP başına istek sınırı (dakikada 120, `429 RATE_LIMITED`), güvenlik başlıkları, istek boyutu sınırı; vekil sunucu arkasında gerçek istemci IP'si (`TRUST_PROXY`).
  - **Ziyaretçi Nabzı** ([#33](https://github.com/Myxoceph/RootNCode-Hackathon/pull/33)): takma adla anonim oturum, katkı gönderme (ipucu, anı, düzeltme), moderasyon kuyruğu (onay, ret, engelleme) ve eserin nabız akışı.
  - **Vakıf Travel Planner & Hava Durumu** ([#39](https://github.com/Myxoceph/RootNCode-Hackathon/pull/39)): `GET /routes/plan` süre bütçesine sığan tematik yürüyüş rotası (tür, dönem ya da Kentsel Ağ bağları); `GET /weather` Open-Meteo'dan anlık hava durumu, ulaşılamazsa `available: false`. Yağmurda ve sıcakta kapalı mekânlar öne alınıyor. Sözleşme v0.2.3.
  - **Uygulama ↔ API doğrulaması:** Y8'den ([#48](https://github.com/Myxoceph/RootNCode-Hackathon/pull/48)) sonra uygulamanın kendi veri katmanı yerel API'ye karşı çalıştırıldı. 472 eserin listesi, detayı ve bağları Türkçe ve İngilizce olarak sözleşme şemalarından geçti, hata çıkmadı. Olmayan eser doğru biçimde "bulunamadı" dönüyor; web için CORS ayarı doğru.
  - **Sözleşme v0.3.0** ([#52](https://github.com/Myxoceph/RootNCode-Hackathon/pull/52)): Kullanılmayan v0.1 `Monument` şeması ve eski mock kaldırıldı. CI'daki `contracts:validate` artık uygulamanın çevrimdışı örnek verisini doğruluyor; sözleşme değişip örnek veri yenilenmezse CI kırılıyor.
  - **A11 · Şema değişikliği belgesi**: `data/README.md` §5'e şemanın esas kaynağının Prisma migration'ları olduğu ve yeni bir tablo değişikliğinin adım adım nasıl yapılacağı eklendi.
- **Devam edenler:**
  - **A10 · Medyanın R2'ye yüklenmesi:** Kayıtlara bağlı 1010 fotoğrafın (Bursa 662, Hatay 348) 3998 sürümü R2'de, toplam 1,1 GB. API'nin döndürdüğü görsel adresleri doğru, ancak `r2.dev` Türkiye'de engelli (bkz. Engeller). Orijinaller yüklenmiyor, kaynağında kalıyor (Drive / kitap PDF'i); böylece üç şehir de R2'nin 10 GB'lık ücretsiz kotasına sığıyor. Kalan: yüklemenin CI'a alınması.
  - **A12 · İlk `main` sürümü:** Uygulama API'ye bağlandığı için (Y8, Y9) beklenen koşul sağlandı. Sürüm, gelecek hafta demo sunucusundaki dağıtım provasıyla ve görsellerin özel alan adına taşınmasından sonra açılacak.
- **Engeller / ihtiyaçlar:**
  - **`r2.dev` Türkiye'de erişime kapalı:** Görsel adresleri (`pub-….r2.dev`) iki farklı operatörde (ev interneti ve mobil veri) erişim engeli sayfasına yönleniyor; uygulamada fotoğraflar açılmıyor. Çözüm R2 bucket'ına özel alan adı bağlamak; Yiğit hosting ile birlikte üstlendi. Sonrasında yalnızca `MEDIA_BASE_URL` değişecek, veri ve kod değişmeyecek.
- **Gelecek hafta:**
  - İlk `main` sürümü ve demo sunucusunda dağıtım provası.
  - Gastronomi ve ortam sesleri için veri uçları (içerik Hüseyin'le).
  - R2 yüklemesinin CI'a alınması (A10).

### Hüseyin Öztürk · Veri & ETL
- **Tamamlananlar:**
  - **Bursa envanterinin tamamı taslak olarak çıkarıldı** ([#19](https://github.com/Myxoceph/RootNCode-Hackathon/pull/19), [#20](https://github.com/Myxoceph/RootNCode-Hackathon/pull/20), [#21](https://github.com/Myxoceph/RootNCode-Hackathon/pull/21), [#22](https://github.com/Myxoceph/RootNCode-Hackathon/pull/22), [#23](https://github.com/Myxoceph/RootNCode-Hackathon/pull/23)): Veri setindeki kayıt sayısı 141'den 356'ya çıktı. Cilt 1 (Osmangazi: türbelerin ikinci yarısı, camiler ve hazireler 1-3), Cilt 2 (Yıldırım: Emir Sultan, Umurbey, Yeşil ve Yıldırım külliyeleri, camiler, kalan bölümler) ve Cilt 3'ün kalan ilçeleri (İznik, İnegöl, Yenişehir) tamamlandı. `data/kapsam.md`'de sırada bekleyen bölük kalmadı. İlişki hedefleri kitaptaki adlara göre düzeltildi.
  - **Veri setinin yayına alınması** ([#25](https://github.com/Myxoceph/RootNCode-Hackathon/pull/25)): Doğrulanan 356 Bursa kaydı `published` oldu; koordinat ve fotoğraf isteğe bağlı hale geldi, böylece uygulama API'den gerçek veri alabiliyor.
  - **Hatay envanteri** ([#29](https://github.com/Myxoceph/RootNCode-Hackathon/pull/29), [#30](https://github.com/Myxoceph/RootNCode-Hackathon/pull/30)): Hatay için tek kaynak bir PDF kitap olduğundan kitabı eserlere bölen bir araç yazıldı (`data/tools/extract/hatay_book.py`: 77 eser, 349 fotoğraf, ilçe ve parsel eşleşmesiyle). Görsel hattı yerel kaynaktan fotoğraf alabiliyor. Bu araçla 116 kayıt üretildi; `validate.py` tüm veri setinde hatasız.
  - **Hatay fotoğrafları ve yayın** ([#35](https://github.com/Myxoceph/RootNCode-Hackathon/pull/35), [#37](https://github.com/Myxoceph/RootNCode-Hackathon/pull/37)): Kitaptaki 348 fotoğraf 109 kayda bağlandı; her biri Türkçe ve İngilizce altyazı ve alt metinle birlikte. Kitapta kendi fotoğrafı olmayan 7 kayıt var. 116 Hatay kaydı `published` oldu. Atanması belirsiz 8 fotoğraf insan kontrolü için [#36](https://github.com/Myxoceph/RootNCode-Hackathon/issues/36)'da.
  - **Eser koordinatları** ([#38](https://github.com/Myxoceph/RootNCode-Hackathon/pull/38), [#45](https://github.com/Myxoceph/RootNCode-Hackathon/pull/45)): 472 eserin 303'ünde koordinat var (Bursa 272/356, Hatay 31/116). Kaynaklar: fotoğrafların EXIF GPS'i (Drive arşivindeki fotoğraflar kitap sayfasıyla eserlere eşlendi), OpenStreetMap ve bağlı olunan yapı. Hepsi `verified: false`; aynı esere ait EXIF ile OSM noktaları arasındaki medyan fark 20-30 m.
  - **Bursa fotoğrafları** ([#47](https://github.com/Myxoceph/RootNCode-Hackathon/pull/47)): Fotoğrafı olmayan 238 Bursa kaydına kitapta basılı 506 fotoğraf bağlandı (bölük PDF'lerinden, kayıt başına en çok 3), Türkçe ve İngilizce altyazı ve alt metinle. Fotoğraflı Bursa kaydı 49'dan 287'ye çıktı; R2'de toplam 1010 fotoğraf (1,1 GB). Atanması belirsiz 7 fotoğraf insan kontrolü için [#49](https://github.com/Myxoceph/RootNCode-Hackathon/issues/49)'da.
  - **E2 · Yeni eser türleri** ([#53](https://github.com/Myxoceph/RootNCode-Hackathon/pull/53)): `kilise`, `makam`, `kutuphane`, `namazgah`, `kopru`, `degirmen` ve `hoyuk` eklendi, 18 kayıt yeniden sınıflandırıldı ("Diğer" 17 kayıttan 3'e indi). Travel Planner bu türler için de ziyaret süresi ve iç/dış mekân tahmini yapıyor.
- **Devam edenler:**
  - Fotoğraf atamalarının insan kontrolü: Hatay'da 8 ([#36](https://github.com/Myxoceph/RootNCode-Hackathon/issues/36)), Bursa'da 7 ([#49](https://github.com/Myxoceph/RootNCode-Hackathon/issues/49)) belirsiz fotoğraf.
  - Kitapta basılı fotoğrafı olmayan 76 kayıt (Bursa 69, Hatay 7) şimdilik yer tutucu görselle gösteriliyor; Drive arşivindeki fotoğraflardan tamamlanabilir.
- **Engeller / ihtiyaçlar:**
  - 169 eserde hâlâ koordinat yok (Bursa 84, Hatay 85). Antakya'nın tarihî camileri OpenStreetMap'te yok; Hatay için parsel ve mıntıka bilgisinden elle konum gerekiyor ([#46](https://github.com/Myxoceph/RootNCode-Hackathon/issues/46)).
  - Kayıtlarda ziyaret bilgisi az: iç/dış mekân 76, ziyaret süresi 4 kayıtta dolu. Travel Planner eksik olanlarda türe göre tahmin kullanıyor.
  - 3 kayıtta kullanıcıya giden metinde iç not göndermesi var ("bkz. meta.data_quality_notes", ör. Ulucami); temizlenmeli.
- **Gelecek hafta:**
  - Kalan koordinatlar ([#46](https://github.com/Myxoceph/RootNCode-Hackathon/issues/46), elle kontrol listesi).
  - H7: Ulucami minber kapısı kitabesinin AR görseli (Yiğit'in prototipindeki test görselinin yerine).
  - H8: Zaman Perdesi için en az bir arşiv fotoğrafı.
  - H9: Ortam sesleri (CC0) ve `sounds.json`; şehir bazlı gastronomi içeriği.

### Yiğit Top · Mobil & Web istemci
- **Tamamlananlar:**
  - **Y8 · Uygulama `/assets` API'sinden okuyor** ([#48](https://github.com/Myxoceph/RootNCode-Hackathon/pull/48)): Eser listesi ve detayı artık API'den geliyor; `Monument` sözleşmesi ve eski mock uygulamadan çıktı. Liste 472 eseri 30'arlı sayfalarla yüklüyor; kartlarda R2'deki kapak fotoğrafı bulanık önizleme ve baskın renkle açılıyor. Detay `/monuments/<eser id>` adresinde (ör. `/monuments/bursa-osmangazi-ulucami`): özet, sesli betimleme metni, bölümler, kitabeler, erişim bilgisi, bağlantılı eserler ve konum. API kapalıysa "Sunucuya ulaşılamıyor" ve "Tekrar dene" gösteriliyor, uygulama sessizce sahte veriye düşmüyor. Telefonda API adresi Expo sunucusunun çalıştığı bilgisayardan otomatik bulunuyor; web derlemesi `EXPO_PUBLIC_API_URL=/api` kullanıyor. API olmadan çalışmak için Ulucami ve bağlı 5 eserden oluşan örnek veri var (`EXPO_PUBLIC_DATA_SOURCE=mock`; `npm run fixtures` ile API'den yenileniyor). Web çıktısında detay sayfaları tek bir kabuk sayfa olduğu için `deploy/Caddyfile`'a `/monuments/<id>` yönlendirmesi eklendi ve Caddy konteynerinde denendi.
  - **Y9 · Kaynak ve güven bilgisi** ([#48](https://github.com/Myxoceph/RootNCode-Hackathon/pull/48)): Tahmini, tartışmalı ve rivayet olan her bilgi ikon + yazıdan oluşan bir rozetle işaretleniyor; kesin bilgide rozet yok. Her bölüm, bilgi, olay, kitabe ve bağın altında kitap ve sayfası yazıyor ("Kaynak: Bursa Vakıf Eserleri – I. Cilt, s. 38-41"); bağlantı envanter kitabının PDF'ini açıyor. Detaya Künye (tarih ve dayanağı, banî, mimar, vakıf), Bilgiler, Zaman çizelgesi, Rivayetler ve Kaynakça eklendi. Mimarı bilinmeyen eserde "Kesin olarak bilinmiyor" yazıp adaylar sıralanıyor (Ulucami'de 4 aday, "Tartışmalı"). Rivayetler tarihçeden ayrı bir bölümde, "Rivayet · Halk inancı" ya da "Rivayet · Kaynak doğrulamıyor" etiketiyle.
  - **Şehir filtresi** ([#48](https://github.com/Myxoceph/RootNCode-Hackathon/pull/48)): Listenin üstünde Tümü / Bursa / Hatay seçimi, eser sayılarıyla (`/meta/enums`). Seçim adreste duruyor (`/monuments?city=bursa`), esere girip dönünce korunuyor. Ekran okuyucu seçimi "Bursa, 356 eser, seçili" diye okuyor; sonuç değişince "Hatay: 116 eser" duyuruluyor.
  - **Y7 · Uçtan uca test:** **Honor 400 (DNY-NX9), Android 16**, Expo Go ile. Normal kullanım, en büyük yazı ve ekran boyutu, TalkBack, koyu/açık mod ve API kapalıyken hata ekranı denendi; ekibin erişilebilirlik kontrol listesindeki maddeler geçti. Web Chrome'da klavyeyle (odak sırası ve odak halkası) ve ekran okuyucu nitelikleriyle (`role`, `aria-checked`, `aria-live`, `lang`) kontrol edildi. Test sırasında bulunup düzeltilenler: hızlı kaydırmada listeye aynı sayfanın iki kez eklenmesi; web'de seçili şehrin ekran okuyucuya bildirilmemesi (`accessibilityState` web'de düşüyor, `aria-checked` kullanıldı); ekran yönünün dikeye kilitli olması; kitabe transkripsiyonlarının dilinin işaretli olmaması (`ar-Latn`, `ota-Latn`); liste sonucu ve hata mesajının duyurulmaması.
  - **Kübra'nın arayüzüyle birleşme (K3, K5, K6 entegrasyonu):** API'den gelen liste ve detay, `packages/ui`'daki temalara, `Text` / `Button` / `Card` bileşenlerine ve güven rozetlerine geçti; geçici tema ve rozetlerim kaldırıldı. Kübra'nın eser kartı tasarımı (bina çizimi üstünde kapak fotoğrafı, erişim kutucukları, Hikâye / Ziyaretçi Notları / Ulaşım sekmeleri, ses kapsülü) gerçek veriyle çalışıyor: kaynak ve güven içeriği Hikâye'de, dört erişim bilgisi ve konum Ulaşım'da. Ses kapsülü, API'nin esere ya da türüne göre verdiği ses anahtarından seçiliyor (hamam, medrese, han / kervansaray, darüşşifa). Ziyaretçi notu olmayan eserler Hikâye sekmesiyle açılıyor.
  - **Y5 · Kitabe AR'ı: MindAR, WebView içinde** ([#50](https://github.com/Myxoceph/RootNCode-Hackathon/pull/50), [#51](https://github.com/Myxoceph/RootNCode-Hackathon/pull/51), [ADR 0002](../decisions/0002-ar-approach.md)): Expo Go'da native modül gerektirmeyen yaklaşım seçildi. WebView yalnızca kamerayı açıp takibi yapıyor ve kitabenin köşelerini altınla çiziyor; okunan ve duyulan her şey uygulamada, ekran okuyuculardan gizli. Geliştirme modunda "Kamera → AR prototipi" ekranı var (Ulucami kapı kitabesi ve hat levhası test görselleriyle). Honor 400'de (Android 16): taş kitabe ve levha tanındı, açı ve loş ışıkta takip sürdü, takipte saniyede 65–71 kare. Android'de WebView'ın kamera izni ancak `expo-camera` ile alınınca çalıştı.
- **Engeller / ihtiyaçlar:**
  - **iOS cihaz:** VoiceOver ve iOS'taki duyurular henüz test edilmedi; ekipte bir iPhone ile bir kez denenmeli.
  - **Veride iç not:** Ulucami'nin 1503 onarımının notunda kullanıcıya "(bkz. meta.data_quality_notes)" görünüyor. Hüseyin'in bu tür iç notları uygulamaya giden alanlardan ayırması gerekiyor.
  - **Harita için koordinat:** Hatay'da 116 eserin yalnızca 31'inde koordinat var; Y6'daki harita prototipi şimdilik ağırlıkla Bursa'yı gösterecek.
  - **AR internet gerektiriyor:** MindAR ilk açılışta jsDelivr'den (~2,2 MB) indiriliyor; demo öncesi uygulamayla ya da kendi sunucumuzdan verilmeli.
- **Gelecek hafta:**
  - Y6: harita karar kaydı ve prototip; haritanın API'deki koordinat ve bağlarla çalışması.
  - Görsellerin açılması için R2'ye özel alan adı ve demo sunucusunun barındırılması.
  - AR: gerçek bir kitabenin önünde saha denemesi, H7 görseliyle hedefin veriden gelmesi, MindAR'ın paketlenmesi.
  - iOS'ta VoiceOver testi.

### Kübra Alkan · UI/UX & Erişilebilirlik
- **Tamamlananlar:**
  - **Hayrat arayüzü ve tasarım sistemi (K3)** ([#40](https://github.com/Myxoceph/RootNCode-Hackathon/pull/40)): Hayrat tasarımı uygulamaya geçti: 5 sekme (Harita, Rotalar, Kamera, Kapsül, Profil) ve 8 modülün ekranları. `packages/ui`'da dört tema (açık, koyu, iki yüksek kontrast), `Text` / `Button` / `Card` bileşenleri; yazı boyutu sistem ayarını izliyor, dokunma hedefleri en az 44 pt, klavye odağında belirgin halka var. Kontrol aracı her temanın kullandığı renk çiftlerini kendisi çıkarıyor; hepsi WCAG AA. Web'de kamera ekranları kamerasız sürümleriyle açılıyor (ADR 0001).
  - **K5 · Bileşenler web'de ekran okuyucuyla doğru okunuyor** ([#41](https://github.com/Myxoceph/RootNCode-Hackathon/pull/41)): seçim durumları (`aria-checked`, `aria-selected`, `aria-pressed`), başlık seviyeleri (`h1` / `h2`) ve görünen metinle başlayan etiketler (WCAG 2.5.3). Cihazda VoiceOver / TalkBack denemesi kaldığı için planda henüz ✅ değil.
  - **K6 · Güven rozetleri ve kaynak notu** ([#42](https://github.com/Myxoceph/RootNCode-Hackathon/pull/42)): `certain` / `probable` / `disputed` / `legend` rozetleri renkten başka ikon ve kenar biçimiyle de ayrılıyor; ekran okuyucu önce bilgi türünü söylüyor. `SourceNote` kitap ve sayfayı yazıyor, kaynak yoksa uyarıyor. Tasarım belgesi `docs/design/confidence-badges.md`. Y9 bunları eser detayında kullanıyor.
  - **K7 · Taşın Dili'nin kamerasız okuma modu** ([#43](https://github.com/Myxoceph/RootNCode-Hackathon/pull/43)): Meal, vakfiye şartı, okunuş ve orijinal hat; okuma sırası görsel sırayla aynı, Türkçe meal Arapçadan önce. Web'de her zaman, telefonda ekran okuyucu açıkken kendiliğinden açılıyor. Arapça kitabe `lang="ar" dir="rtl"` ile işaretli (WCAG 3.1.2). Tasarım belgesi `docs/design/inscription-reading.md`.
- **Devam edenler:**
  - Rotalar ve hava durumu ekranları hâlâ örnek içerikle çalışıyor; `GET /routes/plan` ve `GET /weather` ([#39](https://github.com/Myxoceph/RootNCode-Hackathon/pull/39)) bağlanacak.
- **Engeller / ihtiyaçlar:**
  - Telefonda Ses Kapsülü'nün sesi yok; ses kayıtları (H9) bekleniyor, o zamana kadar yalnızca altyazı akıyor.
  - Erişilebilirlik ayarları uygulama yeniden açılınca sıfırlanıyor.
- **Gelecek hafta:**
  - K5 ve K7'nin cihazda VoiceOver / TalkBack ile denenmesi.
  - Planlayıcı ve hava durumu ekranlarının API'ye bağlanması; OpenStreetMap ve Open-Meteo atıflarının arayüzde gösterilmesi.
  - Erişilebilirlik ayarlarının kalıcı hale gelmesi.

## Metrikler
| Metrik | Değer |
|---|---|
| Birleşen PR sayısı | 33 (Hafta 1 raporundan sonra, 22 Ekim öğleden sonraya kadar) |
| Veri setindeki eser sayısı (taslak / incelemede / yayında) | 472 (0 / 0 / 472) |
| Tamamlanan modüller (1-8) | |

## Alınan kararlar
- **Kitabe AR'ı için MindAR, WebView içinde** ([ADR 0002](../decisions/0002-ar-approach.md)): Expo Go'da çalışıyor, native modül gerektirmiyor.
- **Görseller Drive'dan servis edilmez:** Orijinaller kaynağında kalıyor; uygulamaya yalnızca R2'deki küçültülmüş sürümler gidiyor. Bursa'nın ek fotoğrafları, Hatay'daki gibi kitap PDF'lerinden alındı.
- **Sözleşme sürümleme:** 0.x'te ekleme yama sürümü, kaldırma ya da değiştirme ara sürüm (0.2.3 → 0.3.0).
- **E2:** Kilise, makam, kütüphane, namazgâh, köprü, değirmen ve höyük ayrı tür; tekil yapılar (muvakkithane, minare, tabhâne) "Diğer"de kalıyor.
- **Koordinatlar:** Otomatik bulunan noktaların hepsi `verified: false`; elle girilen nokta otomatik araçlarca hiçbir zaman ezilmiyor.

## Riskler
| Risk | Etki | Önlem |
|---|---|---|
| `r2.dev` Türkiye'de erişime kapalı | Jüri dahil Türkiye'deki kullanıcılar fotoğrafları göremez | R2'ye özel alan adı (Yiğit); sonra `MEDIA_BASE_URL` güncellenir |
| AR prototipi MindAR'ı jsDelivr'den indiriyor (~2,2 MB) | Zayıf internette ya da CDN'e erişilemezse kitabe takibi açılmaz | Demo öncesi kütüphaneyi uygulamayla birlikte paketlemek; kamerasız okuma modu yedek |
| Hatay eserlerinin 85'inde koordinat yok | Harita ve rotalar Hatay'da zayıf kalır | [#46](https://github.com/Myxoceph/RootNCode-Hackathon/issues/46)'da elle konum listesi |
| İçerik kullanımı için kurumdan yazılı izin (E1) netleşmedi | Kitap metinleri ve fotoğrafları demoda kullanılamayabilir | İznin durumu takip edilmeli |

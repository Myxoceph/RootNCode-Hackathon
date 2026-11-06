# ADR 0003: Harita için MapLibre, her platformda

- **Durum:** Kabul edildi (Android'de doğrulandı; iOS açık)
- **Tarih:** 2026-10-22
- **Karar veren:** Yiğit Top (Y6)

## Bağlam

Kentsel Ağ ve Sis Açma (modül 3), rota planlayıcı (modül 4) ve eser kartı gerçek bir haritaya
ihtiyaç duyuyor. Bugünkü Harita sekmesi (Kübra, Hayrat tasarımı) bir çizimin üstüne elle
konmuş 7 örnek eserle çalışıyor; gerçek koordinat kullanmıyor.

API hazır: `/assets` her eserin koordinatını ve yerinde doğrulanıp doğrulanmadığını veriyor
(tek istekte 500 esere kadar), `/assets/:id/relations` eserler arası bağları.

Kısıtlar:

- Ekip uygulamayı **Expo Go** ile deniyor (bkz. ADR 0002).
- Harita iki platformda da çalışmalı (ADR 0001). Web'de MapLibre GL JS planlanmıştı.
- Hayrat tasarımı haritanın kendi renklerini ve sis katmanını istiyor.
- Erişilebilirlik (WCAG 2.1 AA): harita görseldir; aynı bilgiye haritasız da ulaşılabilmeli.

## Karar

Harita her platformda **MapLibre GL JS** ile çizilir: web'de bir iframe'de, telefonda
`react-native-webview` içinde aynı sayfa.

- Altlık: **OpenFreeMap** vektör karoları (OpenStreetMap verisi; anahtar ve kota yok).
  Açık temada `positron`, koyu temada `dark` stili; kara rengi temanın `mapBackground` rengine boyanır.
- Eserler kümelenmiş bir GeoJSON katmanı. Kümeye dokununca yakınlaşılır; esere dokununca seçilir.
  Yerinde doğrulanmamış konumlar içi boş halka olarak çizilir.
- Ekranlar yalnızca ortak arayüzü görür (`apps/app/src/map/types.ts`: `pins`, `selectedId`,
  `onSelect`, `fitPadding`). Arkadaki çizici değiştirilebilir.
- Harita ekran okuyuculardan gizlidir. Seçili eserin kartı, "Eseri aç" düğmesi ve
  "Haritasız: listede göster" bağlantısı native taraftadır.
- MapLibre **5.x** kullanılır. 6.x yalnızca ES modülü olarak geliyor ve haritanın işçisini ayrı
  bir dosyadan yüklüyor; sayfa bu işçiyi CDN gibi başka bir alan adından başlatamıyor.

## Değerlendirilen alternatifler

| Seçenek | Expo Go | Artı | Eksi |
|---|---|---|---|
| **MapLibre GL JS her yerde (seçilen)** | Çalışır | Tek kod, tek stil, iki platformda aynı görünüm; sis ve bağlar harita katmanı olarak yapılabilir; anahtar yok | Telefonda WebView içinde; kaydırma ve yakınlaştırma akıcılığı ölçülmeli; ilk açılışta kütüphane ve karolar indirilir |
| `react-native-maps` (mobil) + MapLibre GL JS (web) | Çalışır | Mobilde native harita | İki ayrı uygulama ve iki farklı görünüm (Google/Apple ile OSM); kümeleme yok; Hayrat renkleri ve sis katmanı sınırlı; yayın sürümünde Android için Google Maps API anahtarı gerekir |
| `@maplibre/maplibre-react-native` (mobil) + MapLibre GL JS (web) | Çalışmaz | Native performans; seçilen yolla aynı stil ve veri | Ekip development build'e geçmek zorunda |
| `expo-maps` | Çalışmaz | Expo'nun kendi paketi | Web desteği yok |

## Prototip

`Kamera → Harita prototipi` ekranı (yalnızca geliştirme modunda; karar verildikten sonra silindi, git geçmişinde `apps/app/src/app/map-prototype.tsx`).
API'den koordinatı olan eserleri şehre göre gösterir. Karşılaştırma sırasında telefonda
`react-native-maps`'e geçiş de vardı; panelde haritanın kaç saniyede çizildiği ve kaç eserin koordinatı
olduğu yazar.

### Sonuçlar

| Ölçüm | Web (masaüstü Chrome) | Android: MapLibre | Android: react-native-maps | iOS |
|---|---|---|---|---|
| Harita ve pinler çizildi | 0,6–0,8 sn | 1 sn | Çizilmedi¹ | Denenmedi |
| Koordinatlı eser (Bursa) | 185 / 356 | 185 / 356 | – | |
| Kümeleme | Var | Var | Yok | |
| Pine dokunma, eser kartı | Çalışıyor | Çalışıyor; kümeye dokununca yakınlaşıyor | – | |
| Kaydırma / yakınlaştırma akıcılığı (Tümü, 185+ eser) | – | Akıcı | – | |
| Tema renkleri | Uygulanıyor | Uygulanıyor | Uygulanmıyor | |

Android testi: Honor 400 (Android 16), Expo Go, 2026-10-22.

¹ Google Maps başladı (logosu göründü), ama ne harita karoları ne de işaretler çizildi. Logo görünüp
haritanın boş kalması, Google Maps'in API anahtarını kabul etmediğinde görülen durum; sebebi cihaz
loglarıyla doğrulanmadı. Yayın sürümünde de kendi Google Maps anahtarımız (faturalandırması açık bir
Google Cloud projesi) gerekeceği için bu yol araştırılmadı.

## Sonuçlar

- Yeni bağımlılık yok: harita, ADR 0002 ile gelen `react-native-webview`'ı kullanıyor.
  `react-native-maps` yalnızca bu karşılaştırma için eklenmişti ve kaldırıldı.
- **MapLibre uygulamayla birlikte geliyor (Y12, 2026-10-23):** Kütüphane jsDelivr yerine sayfanın içine
  gömülüyor (`scripts/vendor-web-libs.mts`, `apps/app/src/vendor/`). Bedeli: telefon paketi yaklaşık 1,1 MB büyüdü;
  web'de ayrı bir parça, yalnızca harita açılınca iniyor.
- **Karolar kendi alan adımızdan (Y19, 2026-10-24):** Stil, karolar, yazı tipleri ve simgeler
  `https://tiles.allbytech.com` üzerinden geliyor: OpenFreeMap'in önünde, Cloudflare önbelleğinde tutan küçük
  bir Worker (`deploy/tiles-worker/`). Stil ve TileJSON'daki adresler bu alan adına çevriliyor; stilin son
  sağlam kopyası bir ay saklanıyor. OpenFreeMap yavaşlar, çöker ya da engellenirse daha önce açılmış (ya da
  `npm run map:warm` ile doldurulmuş) bölgeler çizilmeye devam ediyor. Bursa'nın tamamı (~3.400 dosya) demodan
  bir gün önce, demonun yapılacağı ağdan doldurulmalı: Cloudflare her konumda ayrı önbellek tutuyor ve stil
  OpenFreeMap'in haftalık karo setini izliyor. İnternet hiç yoksa altlık yine boş kalır; pinler ve eser kartı
  çalışır. Atıf (OpenFreeMap, OpenMapTiles, OpenStreetMap) stilden geldiği için aynen duruyor.
  Değerlendirilen öbür yol, Bursa karolarını indirip demo sunucusundan vermekti: yalnızca Bursa'yı
  kapsıyor, stilin elle yeniden yazılmasını istiyordu.
- **Sis haritası (Y11, 2026-10-23):** Hayrat'ın sis ve bağ çizgileri Harita sekmesine taşındı. Harita
  bileşeni `network` özelliğiyle sis, açıklıklar, bağ çizgileri ve işaretli pinler (açılmış eser yıldızı,
  ipucu "?") alıyor; bunlar MapLibre katmanı değil, haritanın üstündeki bir tuvale her karede çiziliyor.
  Sebebi: delikli poligonda üst üste binen açıklıklar yeniden sisle doluyor, tuvalde ise kendiliğinden
  birleşiyor ve kenarları yumuşak kalıyor. Açıklık 260 m, ama şehir bütün olarak görünürken kaybolmasın
  diye en az 44 px. Bağlar yalnızca açılan eserler için `/assets/:id/relations`'tan çekiliyor (`useRelationsOf`);
  bütün bağları veren bir uç nokta yok. Hangi bağ türlerinin sayıldığı `apps/app/src/map/urban-network.ts`'de.
- **Koordinat eksikleri:** Bursa'da eserlerin yaklaşık yarısının, Hatay'da büyük çoğunluğunun koordinatı
  veritabanında yok. Haritada görünmeyen eserlere liste her zaman ulaştırır.
- **Yedek yol:** Telefonda akıcılık yetersiz kalırsa `@maplibre/maplibre-react-native` ve development build;
  stil ve GeoJSON aynı kaldığı için yalnızca telefondaki çizici değişir.

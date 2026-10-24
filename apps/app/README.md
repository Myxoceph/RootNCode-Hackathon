# apps/app

Vagabonds istemcisi: **tek kod tabanından iOS, Android ve Web**.

- **Teknoloji:** Expo (React Native), Expo Router, TypeScript
- **Web:** `react-native-web` ile aynı ekranlar tarayıcıda çalışır; Expo Router sayesinde
  paylaşılabilir URL'ler oluşur (ör. `/monuments/bursa-osmangazi-ulucami`).

| Sorumluluk | Kişi |
|---|---|
| Uygulama iskeleti, kamera ghost overlay, Marker AR, ses oynatıcı, harita | Yiğit Top |
| Ekran tasarımları, erişilebilirlik, tasarım sistemi entegrasyonu | Kübra Alkan |

## Çalıştırma

```bash
npm install                                  # kökten; tüm workspace'ler
npm run app                                  # Expo geliştirme sunucusu
```

- **Telefon:** Expo Go uygulamasıyla terminaldeki QR kodu okut (SDK 57).
- **Tarayıcı:** sunucu açıkken `w` tuşu, ya da `npm run web --workspace @vagabonds/app`.
- **Kontrol:** `npm run typecheck --workspace @vagabonds/app` ve
  `npm run export --workspace @vagabonds/app` (üç platformun paketini derler).

### Android APK (demo)

Expo Go'suz, telefona kurulan sürüm. Expo hesabı ya da bulut derlemesi gerekmez; bilgisayardaki
Android SDK ve JDK 17 ile derlenir (`ANDROID_HOME` tanımlı olmalı):

```bash
npm run android:apk --workspace @vagabonds/app
```

- API adresi derlemeye gömülür; varsayılanı demo adresi (`https://vagabonds.allbytech.com/api`).
  Başka bir API için komutun başına `EXPO_PUBLIC_API_URL=...` ekle.
- Yalnızca `arm64-v8a` için derlenir (bugünkü bütün telefonlar); emülatör ya da eski bir telefon için
  `ANDROID_ARCHS=arm64-v8a,armeabi-v7a,x86_64`.
- Çıktı: `android/app/build/outputs/apk/release/app-release.apk`. Telefona USB ile
  `adb install -r <apk>`, ya da dosyayı telefona gönderip aç ("bilinmeyen kaynaklar" izni ister).
- `android/` klasörü `app.json`'dan üretilir ve git'e girmez; izinler ve eklentiler `app.json`'da.
- İmza, Expo şablonunun hata ayıklama anahtarıdır: demo ve test için yeterli, Play Store'a yüklenemez.
- İlk derleme Gradle bağımlılıklarını indirir (birkaç GB, 10–20 dk); en az 10 GB boş disk bırak.

Paket eklerken `npm install` yerine `npx expo install <paket>` kullan (`apps/app` içinden);
SDK ile uyumlu sürümü seçer.

## Yapı

```
src/
  app/                    # Expo Router: her dosya bir ekran / URL
    _layout.tsx           # yazı tipleri, splash, tema, kök Stack
    +html.tsx             # web HTML kabuğu (lang="tr", zoom açık)
    +not-found.tsx
    (tabs)/               # Keşfet /, Eserler /monuments, Rota /route, Ayarlar /settings
      monuments/          # kendi Stack'i: liste (index) → detay ([id], ör. /monuments/bursa-osmangazi-ulucami)
  components/
  data/                   # veri kaynakları (API, mock), hook'lar, örnek veri (fixtures/)
  theme/                  # geçici renk rolleri (K3 gelince değişecek), yazı tipi dosyaları
```

Renkler, yazı tipleri ve boşluklar `@vagabonds/ui` token'larından gelir. `src/theme/colors.ts`
yalnızca `npm run ui:contrast` ile kontrol edilen renk çiftlerini kullanır.

## Platform ayrımı

Kamera ve AR gerektiren deneyimler yalnızca mobilde çalışır. Web'de bunların yerine
sade alternatifler gösterilir:

| Modül | Mobil | Web |
|---|---|---|
| 1. Zaman Perdesi | Kamera ghost overlay + slider | Önce/sonra slider |
| 2. Taşın Dili | Marker AR ile kitabe tarama | Kitabe okuma modu |
| 3-8 | Tam | Tam |

Platforma özel kod, dosya uzantısıyla ayrılır: `Component.native.tsx` / `Component.web.tsx`.

## Veri

Uygulama veriyi `/assets` API'sinden alır (`@vagabonds/contracts` v0.2). Yerelde API'yi aç:

```bash
npm run db:up && npm run db:import             # bir kez (bkz. kök README)
npm run dev --workspace @vagabonds/api         # http://localhost:3000
npm run app                                    # ayrı terminalde
```

Web'den API'ye erişim için Expo'nun varsayılan portu (8081) API'nin `CORS_ORIGINS` listesinde olmalı;
varsayılan ayar budur.

| Ortam değişkeni | Varsayılan | Ne işe yarar |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Telefonda Expo sunucusunun çalıştığı bilgisayar (`http://<ip>:3000`), diğerlerinde `http://localhost:3000` | API adresi. Demo sunucusu: `https://<alan adı>/api`; web derlemesi `/api` kullanır (`deploy/web.Dockerfile`) |
| `EXPO_PUBLIC_DATA_SOURCE` | `api` | `mock`: API olmadan, `src/data/fixtures/` içindeki küçük örnek veriyle çalışır (Ulucami ve bağlı 5 eser) |

Ekranlar veriye yalnızca `src/data` üzerinden erişir:

```tsx
import { ResourceView } from "@/components/resource-view";
import { useAsset, useAssetList, useAssetRelations } from "@/data";

const list = useAssetList();                   // sayfalı: data.items, data.loadMore(), retry()
const asset = useAsset("bursa-osmangazi-ulucami");
<ResourceView resource={asset}>{(data) => /* data === null: eser yok */}</ResourceView>
```

- `src/data/active-source.ts`: hangi kaynağın kullanılacağına karar verilen **tek** yer.
- **Çevrimdışı:** API'nin her yanıtı telefonda (web'de tarayıcıda) saklanır (`src/data/cached-source.ts`,
  toplam ~4 MB; en eski kaydedilen önce silinir). Ağa ulaşılamazsa ya da saklanan yanıt varken ağ 4 sn'de cevap vermezse saklanan
  gösterilir ve ekranın üstünde "Çevrimdışı · veriler SS:DD itibarıyla" şeridi çıkar; "Yenile" ekrandaki
  bütün verileri yeniden ister. Hiç saklanmamış bir ekran eskisi gibi hata gösterir. Sözleşme sürümü
  değişince eski kayıtlar silinir. Not: API yanıtları 60 sn tarayıcı önbelleğinde de durur; web'de API'yi
  kapatıp denerken bir dakika bekle.
- Her kaynak veriyi sözleşmeyle doğrular; uymazsa `DataError` fırlatır. `ResourceView` bunu
  "Tekrar dene" düğmeli bir hata ekranı olarak gösterir (geliştirmede hangi adresin ya da
  alanın sorunlu olduğu da listelenir). API kapalıysa "Sunucuya ulaşılamıyor" der; sessizce
  mock'a düşmez.
- Sözleşme değişince örnek veriyi yenile: API açıkken `npm run fixtures --workspace @vagabonds/app`.
- Web derlemesinde detay sayfaları tek bir kabuk sayfadır (`monuments/[id].html`); içerik
  tarayıcıda API'den yüklenir. `deploy/Caddyfile` her `/monuments/<id>` adresine bu sayfayı verir.

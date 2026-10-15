# apps/app

Vagabonds istemcisi: **tek kod tabanından iOS, Android ve Web**.

- **Teknoloji:** Expo (React Native), Expo Router, TypeScript
- **Web:** `react-native-web` ile aynı ekranlar tarayıcıda çalışır; Expo Router sayesinde
  paylaşılabilir URL'ler oluşur (ör. `/monuments/selimiye-camii`).

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
  components/
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

API hazır olana kadar veri kaynağı
[`packages/contracts/mock/mock_monuments.json`](../../packages/contracts/mock/mock_monuments.json)
dosyasıdır. Tipler ve Zod şemaları `@vagabonds/contracts` paketinden import edilir;
API devreye girdiğinde yalnızca veri kaynağı değişir, yanıt şekli aynı kalır.

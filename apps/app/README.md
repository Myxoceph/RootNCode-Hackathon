# apps/app

Vagabonds istemcisi: **tek kod tabanından iOS, Android ve Web**.

- **Teknoloji:** Expo (React Native), Expo Router, TypeScript
- **Web:** `react-native-web` ile aynı ekranlar tarayıcıda çalışır; Expo Router sayesinde
  paylaşılabilir URL'ler oluşur (ör. `/monuments/selimiye-camii`).

| Sorumluluk | Kişi |
|---|---|
| Uygulama iskeleti, kamera ghost overlay, Marker AR, ses oynatıcı, harita | Yiğit Top |
| Ekran tasarımları, erişilebilirlik, tasarım sistemi entegrasyonu | Kübra Alkan |

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

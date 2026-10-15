# packages/ui

Vagabonds tasarım sistemi. Sorumlu: **Kübra Alkan**

`apps/app` tarafından hem mobilde hem web'de kullanılır.

## Kapsam

- **Tasarım token'ları:** renk paleti, tipografi ölçeği, boşluklar, köşe yuvarlaklıkları
- **Temalar:** açık, koyu ve yüksek kontrast
- **Temel bileşenler:** erişilebilirlik özellikleri yerleşik (`accessibilityLabel`, `accessibilityRole`, odak sırası)

## Token'lar

```ts
import { palette, typography, spacing, radius, touchTarget } from "@vagabonds/ui";
```

| Dosya | İçerik |
|---|---|
| [`src/tokens/colors.ts`](src/tokens/colors.ts) | Ham renk paleti ve temaların kullanabileceği ön plan/arka plan çiftleri (`contrastPairs`) |
| [`src/tokens/typography.ts`](src/tokens/typography.ts) | Yazı aileleri (`fontFamily`) ve yazı ölçeği: `display`, `title`, `heading`, `bodyLarge`, `body`, `label`, `caption`, `overline`, `data`, `inscription` (en küçük 14) |
| [`src/tokens/spacing.ts`](src/tokens/spacing.ts) | 4 puanlık boşluk ızgarası, köşe yuvarlaklıkları, en küçük dokunma hedefi (44) |

Ekranlar `palette`'i doğrudan kullanmaz; renkler temalar (K3) üzerinden rollere bağlanır.

### Görsel kimlik

Tasarım önce koyu zemin için yapıldı. 300 tonları ve `gece` nötrleri tasarımdaki değerlerin aynısı;
700 tonları aynı renklerin açık zeminler (ör. kamera ekranının kontrol çubuğu) için koyulaştırılmış hâli.

| Renk | Koyu zemin | Açık zemin | Anlamı |
|---|---|---|---|
| İznik kobaltı | `kobalt300` #86A2EB | `kobalt700` #2658DB | Ana eylem |
| Firuze | `firuze300` #71C3BD | `firuze700` #2E6D68 | Açık / onay |
| Mercan | `mercan300` #DF816A | `mercan700` #AA3F25 | Lezzet, uyarı |
| Varak altın | `altin300` #D7B76A | `altin700` #785F20 | Çözülen eser (haritada sekiz köşeli yıldız) |
| Tarih sisi | `gece800` #1C2334 | – | Keşfedilmemiş eser |

| Yazı tipi | Kullanım | Expo paketi |
|---|---|---|
| Marcellus | Başlıklar (`display`, `title`, `heading`): oyma taş yazıt hissi | `@expo-google-fonts/marcellus` |
| Hanken Grotesk | Arayüz ve gövde metni | `@expo-google-fonts/hanken-grotesk` |
| Amiri | Hat ve kitabe katmanı (`inscription`) | `@expo-google-fonts/amiri` |
| IBM Plex Mono | Yıl, saat, koordinat (`data`, `overline`) | `@expo-google-fonts/ibm-plex-mono` |

Yazı tipleri `apps/app` açılırken `useFonts` ile yüklenir; `fontFamily` değerleri bu paketlerin kaydettiği adlardır.

### Kontrast

Her çiftin oranı [`CONTRAST.md`](CONTRAST.md) dosyasında belgelidir. Tüm metin çiftleri 4.5:1'in
üzerindedir (en düşük: `firuze700` / `gece50`, 5.49:1).

```bash
npm run ui:contrast                                # oranları kontrol eder (CI'da da çalışır)
npm run contrast:docs --workspace @vagabonds/ui    # renk değiştirdikten sonra CONTRAST.md'yi yeniden üretir
```

Yeni bir renk kombinasyonu kullanmak için önce `contrastPairs`'e ekle; eşiğin altındaysa kontrol başarısız olur.

## Erişilebilirlik kuralları (WCAG 2.1 AA)

- Normal metinde en az **4.5:1**, büyük metin ve ikonlarda en az **3:1** kontrast
- Dokunma hedefleri en az **44×44 pt**
- Sistem yazı boyutu ayarına uyum (dynamic type)
- Bilgi yalnızca renkle iletilmez
- Her etkileşimli öğenin ekran okuyucu etiketi vardır

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
| [`src/tokens/typography.ts`](src/tokens/typography.ts) | Yazı ölçeği: `display`, `title`, `heading`, `bodyLarge`, `body`, `label`, `caption` (en küçük 14) |
| [`src/tokens/spacing.ts`](src/tokens/spacing.ts) | 4 puanlık boşluk ızgarası, köşe yuvarlaklıkları, en küçük dokunma hedefi (44) |

Ekranlar `palette`'i doğrudan kullanmaz; renkler temalar (K3) üzerinden rollere bağlanır.

### Kontrast

Her çiftin oranı [`CONTRAST.md`](CONTRAST.md) dosyasında belgelidir. Tüm metin çiftleri 4.5:1'in
üzerindedir (en düşük: `okra700` / `stone100`, 5.76:1).

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

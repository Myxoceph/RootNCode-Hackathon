# packages/ui

Vagabonds tasarım sistemi. Sorumlu: **Kübra Alkan**

`apps/app` tarafından hem mobilde hem web'de kullanılır.

## Kapsam

- **Tasarım token'ları:** renk paleti, tipografi ölçeği, boşluklar, köşe yuvarlaklıkları
- **Temalar:** açık, koyu ve yüksek kontrast
- **Temel bileşenler:** erişilebilirlik özellikleri yerleşik (`accessibilityLabel`, `accessibilityRole`, odak sırası)

## Erişilebilirlik kuralları (WCAG 2.1 AA)

- Normal metinde en az **4.5:1**, büyük metin ve ikonlarda en az **3:1** kontrast
- Dokunma hedefleri en az **44×44 pt**
- Sistem yazı boyutu ayarına uyum (dynamic type)
- Bilgi yalnızca renkle iletilmez
- Her etkileşimli öğenin ekran okuyucu etiketi vardır

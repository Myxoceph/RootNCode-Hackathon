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
| [`src/tokens/colors.ts`](src/tokens/colors.ts) | Ham renk paleti |
| [`src/tokens/typography.ts`](src/tokens/typography.ts) | Yazı aileleri (`fontFamily`) ve yazı ölçeği: `display`, `title`, `heading`, `bodyLarge`, `body`, `label`, `caption`, `overline`, `data`, `inscription` (en küçük 14) |
| [`src/tokens/spacing.ts`](src/tokens/spacing.ts) | 4 puanlık boşluk ızgarası, köşe yuvarlaklıkları (`lg` buton, `xl` kart), en küçük dokunma hedefi (44) |

Ekranlar `palette`'i doğrudan kullanmaz; renkler temalar üzerinden rollere bağlanır.

### Görsel kimlik

Renkler ve yazı tipleri **Hayrat** tasarımından ([Claude Design](https://claude.ai/artifact/5aNMunmUkKttWHs8wVXCrJ)) gelir.
300 tonları koyu zemin, 700 tonları açık zemin içindir.

| Renk | Koyu zemin | Açık zemin | Anlamı |
|---|---|---|---|
| İznik kobaltı | `kobalt300` #7FA3F1 | `kobalt700` #1E4AA0 | Ana eylem |
| Gül kurusu | `gulkurusu300` #EAB2BC | `gulkurusu700` #A05568 | Açık / onay, odak halkası |
| Mercan | `mercan300` #EE7B64 | `mercan700` #BE3A26 | Lezzet, uyarı |
| Varak altın | `altin300` #DDB55C | `altin600` #9C7424 (işaret) · `altin700` #82601B (metin) | Çözülen eser (sekiz köşeli yıldız) |
| Tarih sisi | `gece800` #1B2537 | `gece200` #D3DAE3 | Keşfedilmemiş eser |

Tasarımdaki açık zemin altını (#9C7424) metin olarak 4.5:1'i tutturmuyor; yalnızca ikon ve işaretlerde
kullanılır, altın renkli metin için bir ton koyusu (`altin700`) var. Gül kurusu da aynı nedenle iki tonlu:
açık temada metin için koyu `gulkurusu700`, koyu temada açık `gulkurusu300`.

Türkiye haritasında eser bulunan illerin sınırı `mapProvince` rolüdür: koyu temada varak altın (`altin300`),
açık temada daha canlı bir gül kurusu (`gulkurusu500` #BE7585; yalnızca çizgi, metin değil), açık yüksek kontrastta
`gulkurusu700`.

| Yazı tipi | Kullanım | Expo paketi |
|---|---|---|
| Marcellus | Başlıklar (`display`, `title`, `heading`): oyma taş yazıt hissi | `@expo-google-fonts/marcellus` |
| Hanken Grotesk | Arayüz ve gövde metni | `@expo-google-fonts/hanken-grotesk` |
| Amiri | Hat ve kitabe katmanı (`inscription`) | `@expo-google-fonts/amiri` |
| IBM Plex Mono | Yıl, saat, koordinat (`data`, `overline`) | `@expo-google-fonts/ibm-plex-mono` |

Yazı tipleri `apps/app` açılırken `useFonts` ile yüklenir; `fontFamily` değerleri bu paketlerin kaydettiği adlardır.

## Temalar

[`src/themes.ts`](src/themes.ts) dört tema tanımlar: `light`, `dark`, `lightHighContrast`, `darkHighContrast`.
Her tema bir rol → palet rengi eşlemesidir (`text`, `textSecondary`, `surface`, `primary`, `highlight`,
`focusRing`, `fog`…). Yüksek kontrast, ikincil metni ve çizgileri ana metin rengine çeker.

Tema tek noktadan seçilir: `getTheme(şema, yüksekKontrastAçıkMı)`. Uygulama varsayılan olarak **aydınlık** açılır;
şema Profil'deki "Tema" seçiminden gelir (Aydınlık / Koyu / Sistem, `apps/app/src/theme/theme-preference.ts`). Kamera ekranları (Ziyaret Mührü,
Taşın Dili, Ses Kapsülü) her temada karanlıktır ve `cameraColors` kullanır.

## Bileşenler

```tsx
import { UiProvider, useTheme, Text, Button, Card } from "@vagabonds/ui";
```

| Bileşen | Notlar |
|---|---|
| `UiProvider` / `useUi` / `useTheme` | Uygulamanın kökünde bir kez; tema, "Büyük metin" çarpanı ve odak halkası ayarını taşır |
| `Text` | `variant` (tipografi) + `color` (tema rolü). Sistem yazı boyutunu ve "Büyük metin"i izler. `headingLevel={1…4}` başlık yapar; web'de `aria-level` olur, sayfa başlığı 1, bölümler 2. `language="ar"` Türkçe dışındaki metni işaretler (telefonda `accessibilityLanguage`, web'de `lang`) |
| `Button` | `primary` / `ghost` / `success`; etiketi erişilebilir adıdır, en az 44×44, klavye odağında gül kurusu halka. `selected` ile aç/kapa düğmesi olur (telefonda "seçili", web'de `aria-pressed`) |

Seçim durumları için `accessibilityState` yerine `aria-checked` / `aria-selected` kullan: `react-native-web`
`accessibilityState`'i web'e taşımıyor, `aria-*` ise iki platformda da okunuyor.
| `Card` | Yüzey + ince kenar. Tıklanabilir kart için bir `Link`/`Pressable` ile sar |

### Kontrast

Her temanın kullandığı her ön plan/arka plan çifti otomatik çıkarılır (`themeContrastPairs`) ve oranları
[`CONTRAST.md`](CONTRAST.md) dosyasında belgelidir. Tüm metin çiftleri 4.5:1'in üzerindedir
(en düşük: `mercan700` / `gece50`, 5.12:1).

```bash
npm run ui:contrast                                # oranları kontrol eder (CI'da da çalışır)
npm run contrast:docs --workspace @vagabonds/ui    # renk değiştirdikten sonra CONTRAST.md'yi yeniden üretir
```

Bir temaya yeni bir rol çifti eklerken `src/themes.ts` içindeki `textOn` / `nonTextOn` listelerine de ekle;
eşiğin altındaysa kontrol başarısız olur.

## Erişilebilirlik kuralları (WCAG 2.1 AA)

- Normal metinde en az **4.5:1**, büyük metin ve ikonlarda en az **3:1** kontrast
- Dokunma hedefleri en az **44×44 pt**
- Sistem yazı boyutu ayarına uyum (dynamic type)
- Bilgi yalnızca renkle iletilmez
- Her etkileşimli öğenin ekran okuyucu etiketi vardır

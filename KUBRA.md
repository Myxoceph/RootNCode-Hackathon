# Kübra için: eser ekranında kitabın tamamı

Veritabanında ve API'de her eserin bütün kaydı var, ama eser ekranı (`apps/app/src/components/asset-detail.tsx`)
bunun küçük bir kısmını gösteriyor. 770 yayındaki eserde bugün:

| Veri | Kayıtta | Ekranda |
|---|---|---|
| Fotoğraf | 1996 | 193'ü hiç görünmüyor (27 eserde 3 ya da daha fazlası) |
| Bölüm | 2495 | 424'ü hiç görünmüyor (kitapta "muhtemel" ya da "tartışmalı" diye geçtiği için) |
| Zaman çizelgesi olayı | 2134 | hiçbiri |
| Kişi (bani, mimar, usta) | 1466 | yalnızca baninin adı |
| Kitabe metni ve çevirisi | 469 | yalnızca kamera deneyiminde (Taşın Dili) |
| Rivayet | 102 | hiçbiri |
| Vakıf bilgisi | 91 eser | hiçbiri |
| Ölçü ve sayılar | 2155 | eser başına en çok 3, yalnızca sayı olanlar |

Örnek: [Yıldırım Bayezid Camii](https://vagabonds.allbytech.com/monuments/bursa-yildirim-yildirim-bayezid-camii)'nin
9 bölümünden "Tipoloji ve Tarihçe" dahil 2'si, 18 olaylık zaman çizelgesinin tamamı, 11 ölçünün 8'i, 6 kitabenin
metinleri görünmüyor.

Reels biçimi (tam ekran sayfa, bir fotoğraf, bir cümle) kalsın; aşağıdaki üç iş onun yanına ekleniyor.
**API ve sözleşmede değişiklik gerekmiyor**: hepsi `GET /assets/:id` cevabında, `AssetDetail` tipinde
(`packages/contracts/src/asset.schema.ts`) zaten var.

Öncelik sırası: 1 (küçük, en çok içeriği açar) → 2 → 3. Tarayıcı kontrolünde çıkan küçük düzeltmeler 4. bölümde.

---

## 0. Hazırlık

```bash
git switch dev && git pull
npm ci
git switch -c feat/asset-dossier
npm run app        # web için: w
```

Deneme eserleri (her birinde farklı bir eksik var):

| Eser | Neden |
|---|---|
| `bursa-yildirim-yildirim-bayezid-camii` | Tarihçe bölümü "tartışmalı" diye gizli; 18 olay, 6 kitabe |
| `bursa-osmangazi-ulucami` | En dolu kayıt: 10 fotoğraf, 21 olay, 10 kişi, 3 rivayet, 7 kitabe, mimar adayları |
| `konya-selcuklu-sultan-alaeddin-ulu-camii` | 15 fotoğrafın 6'sı görünmüyor |
| `hatay-antakya-seyh-ali-camii` | 13 fotoğrafın 8'i görünmüyor |
| `konya-selcuklu-karatay-medresesi` | Vakfiyeden alıntı ve vakfın şartları var |

## 1. Kitapta ne yazıyorsa görünsün

Bugün yalnızca "kesin" bilgiler gösteriliyor; kitapta "muhtemel", "tartışmalı" diye geçenler gizleniyor.
Karar: **kitapta ne yazıyorsa görünsün, ek bir etiket ya da uyarı yok.** Metnin kendisi zaten "rivayete göre",
"muhtemelen" gibi kitabın sözleriyle yazılı.

`asset-detail.tsx`'te `isCertain` (satır 49) dört yerde süzüyor; dördü de kalkacak:

- satır 76: `chapters` bütün `asset.sections` olsun.
- satır 166: `founder` her zaman `asset.founder?.name`.
- satır 205: ölçüler `confidence`'a bakmadan.
- satır 220: `builtYear` `confidence`'a bakmadan.

`isCertain` ve `Confidence` importu kullanılmıyorsa sil; dosyadaki "Only what the sources state for certain is
told" yorumlarını da güncelle.

**Bitti sayılır:** Yıldırım Bayezid Camii'nde "Devamını oku" ile 9 bölümün 9'u da okunuyor.

## 2. Fotoğraf galerisi

Fotoğraflar bugün yalnızca sayfaların arka planı; sayfa sayısından fazlası hiç görünmüyor.

- Kapak sayfasına bir düğme: "Fotoğraflar (15)". Yalnızca birden fazla fotoğraf varsa.
- Tam ekran galeri: yatay kaydırma, altında `caption` (yoksa boş), köşede `1/15`, kapatma düğmesi.
  `credit` ve `photographer` küçük yazıyla.
- Fotoğraflar: `asset.media` içinde `kind` `photo`, `archive_photo` ya da `drawing` olanlar (çizimler planlar;
  bugün hiç görünmüyorlar), kapak önce. `galleryOf` (satır 478) bunu `drawing` olmadan yapıyor.
- Görsel bileşeni: `@/components/asset-image` (`AssetImage`); `lqip` ve `dominantColor` yüklenirken zemin.
- Erişilebilirlik: her fotoğrafın `accessibilityLabel`'ı `alt`; `1/15` ekran okuyucuya da söylensin;
  galeri açıkken geri tuşu ve Escape kapatsın; kaydırmanın yanında önceki/sonraki düğmeleri (switch access).

**Bitti sayılır:** Sultan Alâeddin Camii'nde 15 fotoğrafın 15'i galeride.

## 3. "Eserin dosyası" sayfası

Son sayfadaki (`End`) "KEŞFE ÇIK" listesine bir satır: **"Eserin dosyası"** ("Kitaptaki her şey"). Açılınca
normal, dikey kaydırılan bir okuma sayfası (reels değil; açık zemin, `useTheme` renkleri). Yeni bir route ya da
bir modal, hangisi kolaysa: ör. `src/app/monuments/[id]/dossier.tsx`.

Bloklar şu sırayla; **içi boş blok hiç görünmesin** (başlığıyla birlikte):

| Blok | Alan (`AssetDetail`) | Nasıl |
|---|---|---|
| Künye | `dating.display`, `dating.basis`, `founder.name` + `founder.role`, `architect.name`, `architect.candidates[]` (`name`, `note`), `alternateNames[]`, `address`, `neighborhood`, `parent` (bağlı olduğu külliye, tıklanınca o eser), `children[]` | Etiket: değer satırları |
| Tarihçe | `sections[]` (`title`, `body`, `sources`) | Bütün bölümler, tam metin; altında `SourceNote` (`@vagabonds/ui`) |
| Zaman çizelgesi | `timeline[]` (`year`, `hijri`, `date`, `type.label`, `title`, `note`) | Dikey çizgi; yıl solda (`year` yoksa `date`), `hijri` varsa "H. 793" |
| Kişiler | `people[]` (`name`, `role`) | "Banî (yaptıran) · Sultan Yıldırım Bayezid" |
| Vakıf | `waqf` (`name`, `deedDate`, `deedExcerpt`, `conditions`, `landNote`) | Vakfiyeden alıntı italik ya da alıntı kutusunda |
| Kitabeler | `inscriptions[]` (`location`, `language`, `script`, `transliteration`, `translation`, `author`, `gregorian`, `hijriYear`, `note`) | Her biri bir kart: yeri, tarihi, transkripsiyon, çeviri; `arTarget` varsa kartta "Kamerayla oku" (`/inscription?asset=`) |
| Ölçüler | `facts[]` (`label`, `value`, `unit`, `note`) | İki sütunlu tablo; `value` metin (`"33,60 x 7,10"`), `valueNum` değil |
| Rivayetler | `legends[]` (`title`, `body`) | Kitabın kendi başlığı "Rivayetler"; `verdict`'e göre ek etiket yok |
| Erişilebilirlik | `accessibility` | `verified` false ve değer `unknown` ise "Bilgi yok"; asla "erişilebilir" deme |
| Kaynakça | `sources[]` (`title`, `pages`, `url`) | "Bursa Vakıf Eserleri – II. Cilt"; `pages` varsa "· s. 163-167", `url` varsa bağlantı |

Notlar:

- Metinler kitaptan geldiği gibi; kısaltma, "devamını oku" yok, hepsi açık.
- Uzun sayfa: başta blok başlıklarına atlayan küçük bir içindekiler satırı iyi olur.
- Erişilebilirlik (WCAG 2.1 AA): her blok başlığı `headingLevel={2}`; listeler `accessibilityRole="list"`;
  dokunma hedefleri en az 44 pt; metin boyutu ayarıyla büyüsün (`useUi().textScale`); renkler `useTheme`'den,
  kontrast `npm run ui:contrast`.
- Mock veri (`EXPO_PUBLIC_DATA_SOURCE=mock`) için fixture'larda 6 eser var; Ulucami hepsini içeriyor.

**Bitti sayılır:** Ulucami'nin dosya sayfasında 21 olay, 10 kişi, 7 kitabe, 3 rivayet ve bütün ölçüler var;
Karatay Medresesi'nde vakfiye alıntısı ve şartları görünüyor.

## 4. Tarayıcı kontrolünde çıkanlar (2026-11-02)

Demo yığınında, telefon boyutunda (390×844) Harita, Eserler, eser detayı, Kamera, Profil ve Rehber gezildi.
Ağ isteklerinin hepsi başarılı; eser detayı, Profil ve Rehber'in giriş kartı sorunsuz. Düzeltilecekler,
önem sırasıyla:

1. **Eser listesinde yanlış yıl.** `asset-card.tsx`'teki `yearOf` (satır 12) "M."den hemen sonra sayı
   bekliyor; "M. Aralık 1413" ya da "M. 8 Mart 1402" gibi yazımlarda ilk sayıyı alıyor ve hicri yılı
   gösteriyor: "Devlet Hatun Türbesi · 816", "Eyne Bey Subaşı Medresesi · 804". "M."den sonraki ilk 3–4 haneli
   sayıyı almak yeterli. Ayrıca bazı kayıtlarda ilk sayı yapım yılı değil: "Hacı Hüsamettin Türbesi · 1632"
   (yaptıranın ölümü), "Seyyid Usûl Tekkesi · 2008" (bugünkü yapı). Bunlar için listeye kaydın kendi
   `startYear`'ını eklerim (Ahmet, API); gelince kart önce onu kullansın.
2. **React #418 (hydration) hatası:** Harita, Eserler, Kamera ve Profil'de konsolda. Web'de önceden üretilen
   HTML ile tarayıcıdaki ilk çizim farklı; genelde ilk çizimde okunan tarih/saat, `window`, ekran boyutu ya da
   cihazda saklanan bir ayar (tema, yazı boyutu) yüzünden. O değer ilk çizimden sonra (`useEffect` içinde)
   okunmalı. Ayrıntılı mesaj için `npx expo start --web` (geliştirme modu) ile aç.
3. **Harita ekran okuyucuya kapalı.** Bursa, Konya, Hatay ve sağ üstteki "i" düğmesi erişilebilirlik
   ağacında yok; ekran okuyucu yalnızca arama kutusunu ve sekmeleri görüyor. Haritanın üstüne (ya da
   altına) ekran okuyucunun göreceği şehir düğmeleri; "i" düğmesine `accessibilityLabel`.
4. **Kamera sekmesi (Lighthouse erişilebilirlik 94):** iki görselde `alt` yok; iki kartta ekran okuyucunun
   okuduğu ad ekrandaki başlıkla başlamıyor (sesle kumandada sorun: "Ziyaret Mührü"ne bas denince bulunmaz).
   `accessibilityLabel` görünen başlıkla başlasın.
5. **Kamera sekmesindeki Ziyaret Mührü kartı** ekran görüntüsünde gri ve boş göründü (fotoğraf yüklenmiş
   olduğu hâlde). Telefonda bir bak; kartın kendi animasyonuysa sorun yok.
6. **Harita açılırken** yaklaşık 10 saniye yalnızca sis görünüyor. Bilinçliyse kalsın; değilse sahnede boş
   ekran gibi duruyor.
7. **Eserler listesinde yüklenirken** bulanık önizleme (`lqip`) kartı doldurmuyor, ortada küçük bir resim
   olarak duruyor; tam boy yayılsın.

Denenmeyenler: klavyeyle gezinme ve ekran okuyucuyla elle deneme, karanlık tema, tablet boyutu.

---

## PR'dan önce

```bash
npm run typecheck && npm test && npm run ui:contrast
```

PR `dev`'e, başlık ve açıklama Türkçe (`## Özet`, `## Kontrol`, `## Kurulum adımı`). Kurulum adımı yok.
Takıldığın yerde Ahmet'e sor; API tarafında bir alan eksik görünürse önce `GET /assets/<id>` cevabına bak.

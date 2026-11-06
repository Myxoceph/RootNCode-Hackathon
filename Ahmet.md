# Ahmet için: Admin panelinden eser fotoğrafı yükleme

**Hazırlayan:** Kübra (admin paneli, `feat/admin-ui`) · **Tarih:** 3 Kasım 2026

**Durum (6 Kasım, Ahmet):** backend hazır (sözleşme 0.3.29). Kararlar: R2 anahtarı sunucuda, işleme istek içinde ve sırayla,
panel fotoğrafları içe aktarmada silinmiyor (`panel_upload`). S3 için `aws4fetch` kullanıldı. Uçlar: `KUBRA.md` §1b.

## Ne isteniyor

Admin panelindeki eser düzenleme ekranından bir esere fotoğraf eklenebilmeli, kapak seçilebilmeli,
açıklaması ve sırası değiştirilebilmeli. Yeni eklenen fotoğraf uygulamada veri setindeki fotoğraflarla
aynı şekilde görünmeli: WebP/JPEG boyut varyantları, LQIP yer tutucu ve baskın renk.

Panelin ilk sürümünde fotoğraf yükleme **yok**. Mevcut fotoğraflar görünüyor; kapak, açıklama ve
sıra düzenlenebiliyor. Yeni eserler fotoğrafsız tasarımla gösteriliyor. Bu belge ikinci adım için.

## Bugün nasıl çalışıyor

- Eser fotoğrafları `data/tools/media_pipeline.py` ile veri ekibinin bilgisayarında hazırlanıyor:
  - EXIF yönü uygulanıyor, metadata siliniyor.
  - 480 / 1280 / 2560 px genişlikte WebP + JPEG sürümler üretiliyor.
  - 16 px LQIP ve baskın renk hesaplanıyor.
- Dosyalar `assets/<eser>/<medya>-<sha10>/<genişlik>.<biçim>` yoluyla R2'ye (`kok-kod-media-public`)
  `rclone` ile yükleniyor. API yalnızca `MEDIA_BASE_URL` + anahtar ile URL kuruyor.
- Ziyaretçi fotoğrafları (`/assets/:id/photos`) farklı: EXIF temizlenip ham olarak veritabanında
  (bytea) tutuluyor, varyant üretilmiyor.

## Önerim

1. **Uç nokta:** `POST /admin/assets/:id/media`, yalnızca admin. Gövde ham görüntü (JPEG/PNG/WebP,
   örneğin en fazla 15 MB); `caption`, `alt` ve `isCover` sorgu parametresi ya da multipart alanı
   olarak gelir. `DELETE /admin/assets/:id/media/:key` ile silme.
2. **İşleme:** `sharp` ile `media_pipeline.py`'nin yaptığının aynısı:
   - EXIF yönü, metadata temizliği
   - 480/1280/2560 WebP+JPEG (büyütmeden)
   - 16 px LQIP (`data:image/webp;base64,…`)
   - baskın renk ve sha256

   Ayarlar (kalite, genişlikler) iki yerde aynı kalmalı. Belki ortak bir JSON'da tutulabilir.
3. **Depolama:** varyantlar aynı anahtar düzeniyle R2'ye S3 API'siyle yazılır
   (`@aws-sdk/client-s3`, R2 S3 uyumlu). Yeni ortam değişkenleri:
   - `MEDIA_BUCKET`
   - `MEDIA_S3_ENDPOINT`
   - `MEDIA_S3_ACCESS_KEY_ID`
   - `MEDIA_S3_SECRET_ACCESS_KEY`

   Yerel geliştirmede bucket yoksa `data/build/media/` altına dosya yazılabilir.
4. **Veritabanı:** `media` + `media_variant` + `asset_media` satırları, `db_rows.py`'deki gibi
   (`source_provider: "panel"`, `status: "published"`). Veri setindeki eserlerde bir sonraki
   `import_to_db.py` bu satırları siler. Panel eserleri için `export_panel_assets.py` fotoğrafları da
   dışa aktarmalı; manifest ve `media[]` kaydı yazılmalı.
5. **Bağımlılık ve kurulum:**
   - `sharp`, Node'da yerel ikili kullanıyor. Docker imajında (`linux/amd64` ve `arm64`) kurulduğu
     doğrulanmalı.
   - `docs/upgrade-notes.md`'ye yeni ortam değişkenleri yazılmalı.

## Açık sorular

- R2 yazma anahtarı sunucuda olsun mu, yoksa API presigned URL üretip yüklemeyi istemci mi yapsın?
  Presigned URL ile varyantlar yine sunucuda üretilmek zorunda olduğu için bence sunucuda yazmak
  daha sade.
- Büyük dosyada işleme süresi (2560 px WebP birkaç saniye sürebilir): istek içinde mi, kuyrukla mı?
- Veri setindeki eserlere panelden eklenen fotoğraf import'ta silinecek. Bu kabul mü, yoksa panel
  fotoğrafları ayrı bir tabloda tutulup import sonrası yeniden mi bağlansın?

Panel tarafı hazır olunca formdaki "Görseller" sekmesine yükleme alanını ben eklerim.

---

# Ahmet için: panelin ön yüzü hazır olan, backend bekleyen işler

**Hazırlayan:** Kübra (admin paneli, `feat/admin-ui`) · **Tarih:** 4 Kasım 2026

**Durum (6 Kasım, Ahmet):** 1, 2 ve 3'ün backend'i hazır (sözleşme 0.3.28). 2. maddenin panel tarafını da bağladım, çünkü
sözleşme değişince panel derlenmiyordu. 1 ve 3'ün panel bağlantısı sende. Ayrıntı: `docs/upgrade-notes.md`.

Aşağıdakilerin ön yüzü yazıldı. Ama sunucu bunları saklamadığı için panel şimdilik kaydetmiyor,
yalnızca önizlemede gösteriyor. Backend'e dokunmadım; şema, sözleşme ve migration senin.

## 1. Fotoğrafın eserin dosyasındaki yeri

Admin, eserin fotoğraflarından birini dosyadaki herhangi bir bölümün hemen altına koyabiliyor. Bunun
için panelde "Dosyadaki fotoğraflar" sorusu var. Bir yere birden çok fotoğraf konabiliyor; bir
fotoğraf aynı anda yalnızca tek bir yerde duruyor.

**Yapılması gerekenler:**

- **Veritabanı:** `asset_media` tablosuna `dossier_after text NULL` sütunu (migration).
- **Değer:**
  - fotoğrafın altına geleceği blok: `identity`, `timeline`, `people`, `waqf`, `inscriptions`,
    `facts`, `legends`, `accessibility`
  - ya da Tarihçe'deki bir konu: `section:<konu id>`
  - fotoğraf dosyada değilse `null`
- **Sözleşme (`packages/contracts`):**
  - `MediaSchema`'ya `dossierAfter: z.string().min(1).nullable().default(null)`
  - `AdminAssetRecordSchema.media[]`'ya `dossierAfter: string | null`
- **API:**
  - `GET /assets/:id`, her fotoğrafta `dossierAfter`'ı göndermeli (`assets.repository.ts`'teki
    seçime ve `assets.mapper.ts`'teki `toMedia`'ya eklenir).
  - `GET`/`PUT /admin/assets/:id/record`, `media[].dossierAfter`'ı okuyup yazmalı
    (`asset-record.ts`, fotoğrafların açıklaması ve sırası güncellenen yer).
- **Veri seti:**
  - `data/schema/eser.schema.json`'daki `mediaItem`'a isteğe bağlı `dossier_after`
  - `data/tools/db_rows.py`'nin `asset_media` satırına `dossier_after`
  - (Hüseyin'le birlikte)

**Ön yüz tarafı:**

- Dosya sayfası (`apps/app/src/app/dossier.tsx`) fotoğrafın `dossierAfter`'ını okuyor, sunucu
  gönderdiği anda uygulamada da görünecek.
- Bloğu boş olan bir yere konmuş fotoğraf, ondan önceki ilk dolu bloğun altına düşüyor
  (`apps/app/src/lib/dossier-photos.ts`).
- Elle konan fotoğraflar, konulara kendiliğinden dağıtılan fotoğraflardan çıkarılıyor.
- Panel yerleşimleri şimdilik kayda değil, kendi durumunda tutuyor (`placements`). Sözleşme
  güncellenince bunu `record.media[].dossierAfter`'a bağlayacağım.

## 2. Başka adların ve mimar adaylarının notunun İngilizcesi

"Başka adlarla da biliniyor mu?" altındaki "Nereden geliyor?" notu ile mimar adaylarının "Not"u
bugün yalnızca Türkçe. Panelde ikisinin de İngilizce satırı var, ama İngilizce kaydedilmiyor.

**Yapılması gerekenler:**

- **Veritabanı:** `alternate_names` ve `architect_candidates` JSON sütunları. Öğelere `note`'un
  yanına isteğe bağlı `note_en` eklenmesi yeterli, migration gerekmiyor.
- **Sözleşme:** `AdminAssetRecordSchema` içinde `alternateNames[].note` ve
  `architect.candidates[].note`, `RecordString(400)` yerine `RecordOptionalText(400)` olmalı
  (`{ tr, en } | null`).
- **API:**
  - `asset-record.ts`: okurken `note` + `note_en` → `{ tr, en }`; yazarken `note` ve `note_en` ayrı
    ayrı (boşsa yazılmaz). Panel eserinin `source_json`'ı için de aynısı.
  - `assets.mapper.ts`: `lang=en` istenince `pick(note, note_en, lang)` ile İngilizcesi dönmeli.
- **Veri seti:** `eser.schema.json`'da `i18nNote`'a ve `architect.candidates` öğesine isteğe bağlı
  `note_en`; `data/README.md`'deki örneğe de.

**Ön yüz tarafı:**

- Panel İngilizceyi şimdilik öğenin üstünde `noteEn` olarak tutuyor ve kaydetmeden önce çıkarıyor
  (`forServer`, `apps/app/src/components/admin/asset-steps.tsx`).
- Sözleşme güncellenince alanı `note.en`'e bağlayacağım. Formdaki "İngilizce notlar şimdilik
  kaydedilmiyor" yazısını da kaldıracağım.

## 3. Eserin dosyasına yeni ana bölümler

Admin, eserin dosyasına Tarihçe ve Zaman çizelgesi gibi kendi ana bölümünü ekleyebiliyor. Bunun için
panelde "Yeni bölümler" sorusu var. Her bölümün:

- adı (Türkçe + İngilizce)
- dosyada nereye geleceği (hangi bölümden sonra)
- biçimli metni (Türkçe + İngilizce)

Bölüm, dosyanın üstündeki içindekiler şeridinde de çıkıyor. Bu bölümlerin altına da fotoğraf
konabiliyor (1. madde, `custom:<id>`).

**Metnin biçimi:** düz metin, panelin araç çubuğunun yazdığı birkaç işaretle:

```
## Alt başlık
Bir paragraf, içinde **kalın** ve _eğik_ yazı.

- liste öğesi
> alıntı
```

Boş satır paragrafları ayırıyor. Sunucu metni olduğu gibi saklayıp göndermesi yeterli;
çözümleme ön yüzde (`apps/app/src/lib/rich-text.tsx`). HTML değil, temizlemeye gerek yok.

**Yapılması gerekenler:**

- **Veritabanı:** yeni tablo, örneğin `asset_custom_block`:

  | sütun | tür | not |
  |---|---|---|
  | `asset_id` | text | `asset`'e bağlı, silinince silinir |
  | `id` | text | slug |
  | `sort_order` | smallint | |
  | `after_block` | text | `identity`, `history`, `timeline`, `people`, `waqf`, `inscriptions`, `facts`, `legends`, `accessibility` ya da başka bir eklenen bölümün `custom:<id>`'si |
  | `title_tr`, `title_en` | text | `title_en` boş olabilir |
  | `body_tr`, `body_en` | text | `body_en` boş olabilir |

- **Sözleşme:**
  - `AssetDetailSchema`'ya `customBlocks: Array<{ id, title, body, after }>` (dile göre seçilmiş
    metinler)
  - `AdminAssetRecordSchema`'ya `customBlocks: Array<{ id, title: RecordText, body: RecordText,
    after }>`
  - İkisi de varsayılan `[]`.
- **API:**
  - `GET /assets/:id`, `lang`'a göre `customBlocks`'u göndermeli.
  - Panel kaydı (`asset-record.ts`) bunları diğer listeler gibi (bölümler, zaman çizelgesi) tek
    işlemde silip yeniden yazmalı.
  - Panel eserinin `source_json`'ına da yazılmalı.
- **Veri seti:**
  - `eser.schema.json`'a isteğe bağlı `custom_blocks[]`
  - `db_rows.py`'ye yeni tablo
  - (Hüseyin'le birlikte)

**Ön yüz tarafı:**

- Dosya sayfası (`dossier.tsx`) bölümleri `customBlocksOf(asset)` ile okuyor
  (`apps/app/src/lib/dossier-custom.ts`), sunucu gönderdiği anda uygulamada görünecek.
- Bölümün bağlandığı bölüm boşsa (dosyada çizilmiyorsa), ondan önceki ilk dolu bölümün arkasına
  geliyor. Kaynakça hep sonda kalıyor.
- Panel bölümleri şimdilik kendi durumunda tutuyor (`CustomBlockDraft[]`). Sözleşme güncellenince
  bunları `record.customBlocks`'a bağlayacağım.

Biri bitince haber verirsen panel tarafını aynı gün bağlarım.

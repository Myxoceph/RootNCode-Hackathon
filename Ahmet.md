# Ahmet için: Admin panelinden eser fotoğrafı yükleme

**Hazırlayan:** Kübra (admin paneli, `feat/admin-ui`) · **Tarih:** 3 Kasım 2026 · **Durum:** öneri, karar senin

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

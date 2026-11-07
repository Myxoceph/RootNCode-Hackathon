# Kübra için: `Ahmet.md`'deki işlerin panel tarafı

Son güncelleme: 6 Kasım 2026 (Ahmet).

`Ahmet.md`'de benden istediklerinin backend'i bitti ve sunucuda çalışıyor. Geriye panel tarafı kaldı; **bu belgedeki tek iş bu.**

**Kapsam:** yalnızca admin paneline dokun. Harita, eser sayfası, giriş ve diğer ekranlarda değişiklik yapma; bunlar çalışıyor.
Dokunulacak dosyalar:

- `components/admin/asset-steps.tsx`, `components/admin/asset-workspace.tsx`
- `data/admin.ts`
- `lib/dossier-photos.ts`, `lib/dossier-custom.ts`

Başka bir dosyayı değiştirmen gerekirse önce Ahmet'e sor.

---

## Baştan bil

- **Bugün kaydedilmeyen:** panelde yapılan fotoğraf yerleştirmeleri ve yeni bölümler kendi durumunda (`placed`, `custom`) kalıyor,
  kayda girmiyor. Sunucudan gelen değerler kayıtta olduğu gibi geri gidiyor, yani silinmiyor.
- **Başka adların ve mimar adaylarının İngilizce notu tamam** (`Ahmet.md`, ikinci belge, 2. madde). Paneli ben bağladım, `forServer`
  kalktı. Yerelde bu alanda çalıştıysan `git pull`'da `asset-steps.tsx` çakışabilir.
- **Veri setindeki esere panelden yapılan değişiklik kalıcı değil.** Yalnızca veritabanında durur, sonraki içe aktarmada silinir
  (sunucuda her güncellemede). Panelden yüklenen fotoğraflar bunun dışında, onlar silinmez.

## 1. "Fotoğraflar" adımına yükleme

`Ahmet.md`, ilk belge. Sözleşme 0.3.29. Yalnızca admin görsün, moderatör görmesin. İstek için `data/admin.ts:193`'teki rozet
resmi yüklemesi örnek olur (`rawBody`).

**Yükleme:** `POST /admin/assets/:id/media?alt=…&credit=…`

- Gövde dosyanın kendisi: `image/jpeg`, `image/png` ya da `image/webp`, en çok 15 MB (`ADMIN_PHOTO_MAX_BYTES`), kısa kenar en az 300 px.
- `alt` ve `credit` zorunlu. `altEn`, `caption`, `captionEn`, `license`, `isCover=true` isteğe bağlı.
- Altyazı verilmezse `alt` kullanılır. Eserin ilk fotoğrafı kendiliğinden kapak olur.
- Cevap `201 { version, media }`. `media` eser sayfasındaki `Media` ile aynı, önizlemeye hemen koyabilirsin.
- Sunucuda işleme birkaç saniye sürer, yükleniyor durumu göster.
- Açıklama ve sıra sonradan normal kayıtla değişir.

**Silme:** `DELETE /admin/assets/:id/media/:key` → 204. Kaldır düğmesini yalnızca kayıttaki `media[].uploaded` `true` ise göster.

**Hatalar** (hepsine Türkçe mesaj):

| Kod | Anlamı |
|---|---|
| `400 INVALID_IMAGE` | Resim değil ya da çok küçük |
| `409 PHOTO_ON_ASSET` | Aynı fotoğraf bu eserde var |
| `409 DATASET_PHOTO` | Veri setinin fotoğrafı silinemez |
| `413`, `415` | Dosya çok büyük, tür desteklenmiyor |
| `503 MEDIA_UPLOAD_OFF` | Sunucuda R2 anahtarı yok |

Kapak seçimi notu: yüklenen fotoğrafı kapak yaparsan, veri setindeki eserde içe aktarma kapağı veri setininkine geri alır.

**Bitti sayılır:** bir esere fotoğraf yükle, eser sayfasında gör, kaldır, gittiğini gör.

## 2. Fotoğrafın eserin dosyasındaki yeri

`Ahmet.md`, ikinci belge, 1. madde. Sözleşme 0.3.28.

- `placements` → `record.media[].dossierAfter`: `string | null`. Değer blok adı, `section:<id>` ya da `custom:<id>`.
- `GET /assets/:id` her fotoğrafta `dossierAfter` gönderiyor. `dossier-photos.ts`'teki `as` dönüşümü artık gerekmiyor.
- `asset-steps.tsx:1294`'teki "Şimdilik yalnızca sağdaki önizlemede görünür" yazısını kaldır.

## 3. Eserin dosyasına yeni bölümler

`Ahmet.md`, ikinci belge, 3. madde. Sözleşme 0.3.28.

- `CustomBlockDraft[]` → `record.customBlocks`: `{ id, title: { tr, en }, body: { tr, en }, after }`.
- `id` küçük harf, rakam, `-` ve `_` olabilir (`Slug`). Başlık ve Türkçe metin boş olamaz. Aynı `id` iki kez olamaz.
- `GET /assets/:id` `customBlocks` gönderiyor. `dossier-custom.ts`'teki `as` dönüşümü artık gerekmiyor.
- `asset-steps.tsx:1240`'taki "kaydetme yakında eklenecek" yazısını kaldır.

**2 ve 3 bitti sayılır:** panelde bir fotoğraf yerleştir, bir bölüm ekle, kaydet, sayfayı yenile. İkisi de duruyor ve eserin dosyasında
görünüyor.

---

## PR'dan önce

```bash
npm run typecheck && npm test && npm run ui:contrast
```

`dev`'i çekip `dev`'den dal aç. PR `dev`'e, başlık ve açıklama Türkçe (`## Özet`, `## Kontrol`, `## Kurulum adımı`).
PR'ın değişen dosyalar listesinde yukarıdakiler dışında bir dosya varsa birleştirmeden önce nedenine bak.

# Veri Döngüsü: PDF Kabul + Kitabe Gönüllüleri + Saha Defteri

> **Bu dosya Yiğit'in ve Hüseyin'in Claude Code oturumlarının ortak planıdır.** Bir oturuma
> başlarken önce bu dosyayı baştan sona oku. Sonra yalnızca kendi şeridindeki (§6) işlere dokun.
> Plan değişirse bu dosyayı da güncelle; plan ile kod arasında çelişki kalmasın.

Durum: geliştirme · Dal: `feat/veri-dongusu` · Başlangıç: 2026-11-08

---

## 0. Kırmızı çizgiler (her oturumda geçerli)

1. **Uzak sunucuya veri yazılmaz.** Bu geliştirme boyunca:
   - Yalnızca yerel PostgreSQL kullanılır (`docker compose up -d postgres`, `localhost:5432`).
   - `apps/api/.env`'deki `DATABASE_URL` `localhost` ya da `127.0.0.1` dışında bir sunucuyu gösteremez.
   - `MEDIA_S3_*` (R2) değişkenleri tanımlanmaz. Fotoğraflar yerel diske yazılır (§5.4).
   - Demo sunucusu (`deploy/`), R2 ve `rclone` komutları kullanılmaz.
   - Bunu kod da denetler (`INTAKE_LOCAL_ONLY`, §5.5). Koruma hata veriyorsa korumayı kapatma, ayarı düzelt.
2. **`dev`'e girmez.** Her şey `feat/veri-dongusu` dalında birikir. `dev`'e ancak §9'daki "kararlı"
   ölçütleri sağlanınca ve ekip karar verince tek PR ile gider. Sunuma yetişmezse dal bekler;
   `dev` ve demo etkilenmez.
3. **Yapay zekâ hiçbir şeyi kendi başına yayınlamaz.** Model taslak üretir. Her taslak onay kuyruğundan
   bir insanın onayıyla geçer.
4. **Sözleşme ve migration'ın tek sahibi var: Yiğit.** `packages/contracts` ve `apps/api/prisma`
   değişiklikleri Yiğit şeridinde yapılır; Hüseyin'in oturumu bu dosyalara yazmaz, ihtiyacı §10'a not eder.
   Böylece iki dalda çakışan migration oluşmaz.
5. **Yapay zekâ yalnızca EVREN.** Bütün model çağrıları (taslak kayıt, kitap haritası, fotoğraf konusu,
   kitabe okuma) EVREN'e gider; başka bir sağlayıcı eklenmez (§7).
6. **Gizli bilgiler** (EVREN anahtarı, tokenlar, `.env`) git'e, PR'a, bu dosyaya ve sohbete girmez.
7. **Commit ve push'u insan yapar.** Claude Code komutları verir, kendisi commit atmaz.
   Commit mesajları Conventional Commits (`feat(api): …`, `feat(data): …`).

## 1. Neden

Vakıf Katılım her şehirde eserlerin profesyonel fotoğraflarını çektirip içerikle eşliyor ve bir
PDF envanter kitabı üretiyor. Bugün bu PDF'leri kitaba özel betiklerle (`hatay_book.py`,
`konya_book.py`) bölüyor, kayıt taslağını Claude Code'da elle çalıştırılan bir alt ajanla
yazıyoruz. Yeni bir şehir geldiğinde kod yazmak gerekiyor.

Hedef: **veri setinin, kod yazmadan ve kalite kaybetmeden büyümesi.** Üç giriş, tek onay kuyruğu:

| Giriş | Kimden | Ne üretir |
|---|---|---|
| **PDF Kabul** | Vakıf Katılım (kitap PDF'i) | Kitaptaki her eser için taslak kayıt + fotoğraflar |
| **Kitabe Gönüllüleri** | Ziyaretçi (sahada çektiği kitabe fotoğrafı) | Var olan esere taslak kitabe (okuma + çeviri) |
| **Saha Defteri** (sonra) | Saha ekibi (toplu fotoğraf) | Taslak eser + konum + fotoğraf konuları |

## 2. Demo senaryosu (hedef)

1. Panel → "PDF Kabul": bir şehir kitabının PDF'i yüklenir. Model içindekilerden eser listesini önerir,
   uzman tek ekranda onaylar.
2. Birkaç dakika sonra kuyrukta onlarca taslak eser görünür. Her alanın yanında kitaptaki sayfası durur;
   solda PDF sayfası, sağda taslak alanlar. Uzman bir eseri düzeltip onaylar ve eser haritada çıkar.
3. Ekranda ölçüm: "Otomatik hat, insan eliyle hazırlanmış 770 kayda göre alanların %X'ini doğru buluyor" (§7).
4. Ziyaretçi bir eserde listede olmayan bir kitabeyi fotoğraflar. Model taslak okuma ve çeviri üretir,
   taslak kuyruğa düşer. Uzman onaylar, kamera kitabeyi tanır ve Taşın Dili çeviriyi taşın üstüne yerleştirir.

## 3. Mevcut altyapı (yeniden kullanılacak)

| Parça | Yer | Not |
|---|---|---|
| Kitap bölme, metin ve fotoğraf ayıklama | `data/tools/extract/{hatay_book,konya_book,pdf_photos,pdf_to_text,match_photos}.py` | pymupdf; sayfa düzeni kuralları kitaba özel |
| Kayıt taslağı talimatı | `data/tools/extract/PROMPT.md` | Sonnet ile denendi: uydurma yok, insan kontrolü şart |
| Şema ve doğrulama | `data/schema/eser.schema.json`, `data/tools/validate.py`, `data/enums.json`, `data/sources.json` | |
| Konum önerisi | `data/tools/geocode.py` | EXIF → OSM → üst yapı |
| Panelden eser ekleme | `POST /admin/assets`, `POST /admin/assets/record`, `PATCH /admin/assets/:id` | Kayıt `asset.source_json`'da tutulur |
| Panelden fotoğraf | `POST /admin/assets/:id/media`, `apps/api/src/modules/admin/photo-process.ts` | sharp; 480/1280/2560; konum bilgisini siler. **Yerelde depo yok** (R2 gerekiyor) → §5.4 |
| Dışa aktarma | `data/tools/export_panel_assets.py` | Panel eserlerini `data/eserler/` dosyasına çevirir |
| Görüntü modeli | `apps/api/src/modules/vision/vision.client.ts` | OpenAI uyumlu; EVREN `qwen3-vl-30b` |
| Onay kuyruğu | `apps/app/src/app/admin/review.tsx`, `/admin/contributions/*` | Bugün yalnızca metin ve fotoğraf katkıları |
| Mühür fotoğrafı kuralı | `pickSealPhoto`, `SEAL_SUBJECTS` (`packages/contracts/src/achievement.schema.ts`) | Fotoğraf konusu listesi buradan |
| Taşın Dili | `apps/app/src/ar/inscription-targets.ts` | `.mind` yoksa kitabe fotoğrafını **telefonda derler**; onaylanan kitabe anında taranabilir |
| AR hedef listesi | `GET /ar-targets` | `ar_target_media_key` dolu kitabeleri verir |

## 4. Mimari

```
                       ┌──────────────── apps/api (TS, Fastify) ─────────────────┐
 Panel (apps/app/admin) │ POST /admin/intake/jobs        → intake_job (queued)     │
   PDF yükle ─────────▶ │ GET  /admin/intake/jobs/:id    ← ilerleme, kitap haritası│
   haritayı onayla ───▶ │ POST /admin/intake/jobs/:id/map → map_confirmed          │
   kuyruk ────────────▶ │ GET  /admin/intake/drafts      (+ eski katkılar)         │
   onayla/reddet ─────▶ │ POST /admin/intake/drafts/:id/review  (approve|reject)   │
 Uygulama (ziyaretçi)   │ POST /assets/:id/inscription-proposals → intake_draft    │
   kitabe fotoğrafı ──▶ │   (görüntü modeli taslağı API'de yazar)                  │
                       └───────────────┬──────────────────────────────────────────┘
                                       │ yerel PostgreSQL (tek ortak arayüz: tablolar)
                       ┌───────────────▼─────────── data/pipeline (Python) ───────┐
                       │ worker.py: intake_job'ları sırayla alır                  │
                       │  1 layout + içindekiler → kitap haritası (needs_map)     │
                       │  2 harita onaylanınca: eser başına metin + fotoğraf      │
                       │  3 taslak kayıt (LLM) → şema doğrulama → 1 kez onarım    │
                       │  4 fotoğraf konusu (VLM), konum, tekrar uyarısı          │
                       │  5 intake_draft satırı (kind=book_asset)                 │
                       │  6 YAYIN: onaylanan taslak → data/eserler dosyası +      │
                       │    media_pipeline + import_to_db → applied_at            │
                       └──────────────────────────────────────────────────────────┘
```

**Onay ve yayın ayrı adımlar.** API yalnızca onayı kaydeder (düzeltilmiş kayıt, kim, ne zaman).
Onaylanan taslağı worker ekibin bugünkü resmi yoluyla yayınlar: `data/eserler/<il>/<ilçe>/<id>.json` dosyası,
`media_pipeline.py`, `import_to_db.py`; sonra `applied_at`'i yazar. Yayın hata verirse (`validate.py`, fotoğraf…)
`apply_error`'a yazar ve taslak kuyrukta görünür. Neden: panelin yazma yolu (`asset-record.ts`) kaynak
atıflarını taşımıyor; kitaptan gelen verinin en değerli yanı her bilginin kitaptaki kaynağı. Bu yolla
eser aynı anda git'e girebilecek bir veri dosyası da olur. **Onay = yayın kararı:** API onaylanan yeni
eserin kaydında `status`'u `published` yapar; ayrı bir "incelemede" adımı yok, bu kuyruk o adımın kendisi.

**Neden iki dil?** PDF işleme ve veri araçları Python'da (pymupdf, `validate.py`, `geocode.py`) ve
Hüseyin'in alanı. API ve ekranlar TypeScript'te. Aralarındaki tek sözleşme **veritabanı tabloları**
(§5.2) ve **istem dosyaları** (§5.3). Biri öbürünün koduna dokunmadan ilerleyebilir.

## 5. Ortak sözleşmeler (önce bunlar; Yiğit, Aşama 0)

### 5.1 Durumlar

- `intake_job.status`: `queued` → `mapping` → `needs_map` → `map_confirmed` → `drafting` → `done` · `failed`
- `intake_draft.status`: `pending` → `approved` · `rejected`
- `intake_draft.kind`: `book_asset` (PDF), `inscription` (ziyaretçi), `field_asset` (Saha Defteri, sonra)

### 5.2 Tablolar (Prisma; Python worker aynı tabloları `psycopg` ile kullanır)

```
intake_job
  id            uuid pk
  kind          text            'pdf'
  status        text            §5.1
  title         text            kitabın adı
  city          text            enums.json il kodu
  source_id     text            sources.json kimliği (yoksa worker önerir, insan onaylar)
  file_path     text            data/build/cache/intake/<id>/source.pdf (git'e girmez)
  layout        jsonb null      { spread: bool, columns: ['tr','en'], pageOffset: int }
  book_map      jsonb null      [{ key, titleTr, titleEn, district, printedPages:[a,b], pdfPages:[a,b], parentKey }]
  map_confirmed_at timestamptz null, map_confirmed_by uuid null
  progress_done int default 0, progress_total int default 0
  error         text null
  created_by    uuid, created_at, updated_at

intake_draft
  id            uuid pk
  kind          text            §5.1
  status        text            §5.1
  job_id        uuid null       → intake_job (book_asset)
  asset_id      text            önerilen ya da hedef eser id (kebab-case)
  record        jsonb           book_asset: eser.schema.json kaydı · inscription: kitabe nesnesi
  media         jsonb           [{ key, localPath, width, height, subject, subjectConfidence, alt, caption, pdfPage }]
  source_refs   jsonb           [{ field, pages:[..] }]  alanların kitaptaki sayfaları
  validation    jsonb           { errors:[..], warnings:[..] }  validate.py çıktısı
  ai            jsonb           { model, promptVersion, confidence, repaired: bool, ms }
  duplicate_of  text null       benzer eser (300 m + benzer ad)
  note          text null       ziyaretçinin notu
  created_by    uuid null       ziyaretçi ya da worker için null
  reviewed_by   uuid null, reviewed_at timestamptz null, review_note text null
  created_at, updated_at
```

Migration **yalnızca ekleme** yapar: yeni tablolar, var olan tablolara dokunmaz.

**Uygulandı (Y0):** `apps/api/prisma/migrations/20261108090000_intake/migration.sql`. Yukarıdakine ek olarak:
- `intake_draft.entry_key`: taslağın kitap haritasındaki satırı (`BookMapEntry.key`).
- `(job_id, entry_key)` kitap taslakları için benzersiz (`intake_draft_entry_idx`, kısmi index). Worker yeniden
  çalıştığında `INSERT … ON CONFLICT (job_id, entry_key) WHERE job_id IS NOT NULL DO UPDATE` ile **üzerine yazar**,
  çoğaltmaz. Prisma bu index'i ifade edemez; `prisma migrate diff` onu "fark" diye gösterir, silinmez.
- CHECK kısıtları:
  - `kind = 'book_asset'` ⇔ `job_id` dolu;
  - `status = 'pending'` ⇔ `reviewed_at` boş;
  - `asset_id` kebab-case;
  - durum ve tür listeleri §5.1'deki gibi.
- `20261108120000_intake_one_approval`: bir eser id'si için tek onaylı yeni eser taslağı (`intake_draft_new_asset_idx`,
  kısmi benzersiz index); aynı anda gelen iki onayın ikincisi 409 alır.
- `intake_job.created_by` boş olabilir (worker'ın testleri için); API her zaman doldurur.
- `20261108100000_intake_entry_key`: `book_asset` taslağında `entry_key` zorunlu, öbür türlerde boş
  (yoksa benzersizlik NULL'ları ayrı saydığı için yeniden çalışmada taslak çoğalırdı).
- Kısıtlar gerçek PostgreSQL'de sınanıyor: `apps/api/test/intake.db.test.ts`. Worker'ın kullanacağı
  `ON CONFLICT` cümlesinin örneği de orada.

**jsonb sütunlarının biçimi:** `packages/contracts/src/intake.schema.ts` (Zod). Python için JSON Schema'sı
`data/pipeline/contracts/intake.schema.json`: worker yazmadan önce bununla doğrular. Sözleşme değişince
`npm run intake-schema -w @vagabonds/contracts` ile yeniden üretilir ve commit'lenir. JSON Schema'ya taşınamayan
tek kural sayfa aralıklarının geriye gitmemesi (`[başlangıç, bitiş]`, başlangıç ≤ bitiş); worker bunu kendisi denetler.
Sözlükte iki ek alan var: `BookMapEntry.proposedId` (önerilen eser id) ve `IntakeDraftMedia.arTargetCandidate`
(Taşın Dili'ne uygun kitabe fotoğrafı). Fotoğraf konusu sözlüğü `PHOTO_SUBJECTS` = `SEAL_SUBJECTS` + `aerial` + `other`.

### 5.3 İstem dosyaları (Hüseyin yazar, iki taraf okur)

`data/pipeline/prompts/` altında, başında `version:` satırı olan Markdown dosyaları:

| Dosya | Kullanan | Çıktı (JSON, Zod/JSON Schema ile doğrulanır) |
|---|---|---|
| `book-map.md` | worker | içindekiler sayfalarından `book_map` |
| `asset-record.md` | worker | `PROMPT.md`'nin API'ye uyarlanmışı: tek eser kaydı |
| `photo-subject.md` | worker, API (Saha Defteri) | `{ subject: SEAL_SUBJECTS | 'other', confidence, alt }` |
| `inscription-read.md` | API (Kitabe Gönüllüleri) | `{ script, language, transliteration, translationTr, uncertain:[..], confidence }` |

### 5.4 Yerel fotoğraf deposu

- `createLocalMediaStore(root)`: R2 deposuyla aynı `MediaStore` arayüzü, dosyaları `data/build/media/<key>`'e yazar
  (R2'deki anahtar düzeniyle aynı).
- API `GET /local-media/*` ile bu klasörü sunar. Dosya yerelde yoksa `MEDIA_BASE_URL`'e (ortak medya sunucusu)
  **302 ile yönlendirir**. Okuma uzaktan olabilir, yazma her zaman yereldir.
- `INTAKE_LOCAL_ONLY` açıkken API fotoğraf adreslerini `LOCAL_MEDIA_BASE_URL` ile verir
  (boşsa `http://localhost:<PORT>/local-media`; telefonda `http://<bilgisayarın IP'si>:3000/local-media`).
- Koruma, `MEDIA_BASE_URL` `/local-media`'yı gösterirse API'yi açmaz: yerelde olmayan her dosya kendine
  yönlenip sonsuz döngüye girerdi.
- Anahtarlar `.` ile başlayan bir parça içeremez (`.env`, `.git` sunulmaz); göreli `LOCAL_MEDIA_DIR` repo kökünden okunur.
- **`MEDIA_BASE_URL`'ye dokunulmaz.** `.env` her dalda ortak; o değişkeni yerele çevirmek, bu uç noktanın
  olmadığı dallarda bütün fotoğrafları kırar. Yeni değişkenleri diğer dallar tanımaz ve yok sayar.
- Worker'ın çıkardığı fotoğraflar da aynı klasöre ve düzene yazılır (`media_pipeline.py` biçimi).

### 5.5 Yerel-yalnız koruması

- `INTAKE_LOCAL_ONLY=1` (yerel `.env`'de). API açılırken:
  - `DATABASE_URL`'in sunucusu `localhost`/`127.0.0.1` değilse ya da `MEDIA_S3_*` tanımlıysa **açılmayı reddeder**.
  - Bu bayrakla R2 deposu hiç kurulmaz, her zaman yerel depo kullanılır.
- `data/pipeline/db.py` aynı denetimi yapar. Uzak bir veritabanına bağlanmayı denerse hata verip durur.
- Özellik bayrağı `INTAKE_ENABLED` (varsayılan kapalı): yeni uç noktalar ve panel ekranları yalnızca açıkken
  görünür. `dev`'e girdiğinde bile demo sunucusunda hiçbir şey değişmez.

## 6. İş bölümü

Yük yaklaşık eşit: Yiğit API + ekranlar + uygulama akışı; Hüseyin worker + istemler + ölçüm + veri.

### Yiğit şeridi (TS: `packages/contracts`, `apps/api`, `apps/app`)

| # | İş | Bağımlılık | Bitti sayılır |
|---|---|---|---|
| Y0 | Sözleşmeler (§5.1-5.2) + migration + yerel-yalnız koruması (§5.5) + yerel fotoğraf deposu (§5.4) | yok | `npm test` ve tip denetimi geçiyor; uzak `DATABASE_URL` ile API açılmıyor; panelden yerelde fotoğraf yüklenebiliyor  ✓ 2026-11-08 |
| Y1 | Intake API (`INTAKE_ENABLED`; moderatör ve admin): `POST /admin/intake/jobs` (PDF, ≤200 MB, `data/build/cache/intake/<id>/source.pdf`), `GET /admin/intake/jobs[/:id]`, `POST /admin/intake/jobs/:id/map` (yalnızca `needs_map`'ten; anahtarlar ve önerilen id'ler benzersiz, üst eser haritada), `GET /admin/intake/drafts[/:id]` (en eskisi önce), `POST /admin/intake/drafts/:id/review` (yalnızca `pending`'den; doğrulama hatası varsa ancak düzeltilmiş kayıtla; yeni eserin id'si veri setinde varsa 409; onayda `status: published`). Migration `…110000_intake_apply`: `applied_at`, `apply_error` | Y0 | `test/intake.routes.test.ts` (9) ✓ 2026-11-08 |
| Y2 | **Sohbetten Kabul, sözleşme + migration + API** ([`yigit-veri-dongusu.md`](yigit-veri-dongusu.md) §1.1-1.3, §7 kararları): `kind = chat`, `input`, kaynak alıntısı, `validation.missing`; `POST /admin/intake/uploads`, `POST /admin/intake/chats`, `POST /admin/intake/chats/:id/messages`; iş yanıtında sohbetin taslağı | Y1 | API testleri; JSON Schema'da `intake_job.input`; Hüseyin'in testleri yeni migration'la geçiyor  ✓ 2026-11-08 (Hüseyin'in testleri onda doğrulanacak) |
| Y2b | **Sohbet ekranı** (panel): mesajlar, uzun metin, fotoğraf ekleme, taslak kartı (alanlar, alıntılar, eksik alan soruları), ilerleme | Y2 | Panelde metin + fotoğraf gönderilip worker'ın taslağı görülüyor |
| Y2c | (sonra) Panel: PDF Kabul ekranları (yükle, ilerleme, kitap haritası tablosu düzenle/onayla) | Y1 | Hatay PDF'iyle harita onaylanıp iş `drafting`'e geçiyor |
| Y3 | Panel: birleşik onay kuyruğu (eski katkılar + `intake_draft`), yan yana inceleme (PDF sayfası görüntüsü + alanlar + kaynak sayfa işaretleri + doğrulama + tekrar uyarısı) | Y1 | Bir taslak düzeltilip onaylanınca eser haritada görünüyor |
| Y4 | ~~Kitabe Gönüllüleri, API~~ → **Hüseyin'e geçti (H7)**, §7 | — | — |
| Y5 | Kitabe Gönüllüleri, uygulama: eser sayfasında ve Taşın Dili'nde "Bu kitabe listede yok mu?" → kamera → gönder → "taslak, onay bekliyor" + Profil'de durum; onayda "Kitabe Gönüllüsü" rozeti | Y4 | Telefonda uçtan uca: gönder → onayla → kamera tanıyor |
| Y6 | (zaman kalırsa) Saha Defteri: toplu fotoğraf yükleme + konum okuma (fotoğraf işlenmeden önce) + konu önerisi | Y0, H3 | — |

### Hüseyin şeridi (Python ve veri: `data/pipeline/`, `data/tools/`, istemler)

| # | İş | Bağımlılık | Bitti sayılır |
|---|---|---|---|
| H0 | `data/pipeline/` iskeleti: `db.py` (yerel-yalnız denetimi, §5.5), `llm.py` (EVREN istemcisi: OpenAI uyumlu `/chat/completions`, adres ve anahtar API ile aynı ortam değişkenlerinden — `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY`; metin ve görüntü modeli ayrı değişkenlerle seçilir; zaman aşımı, yeniden deneme, oran sınırına uyma), `worker.py` döngüsü (`FOR UPDATE SKIP LOCKED`, yarıda kalan iş kaldığı yerden sürer) | Y0'ın tabloları (o gelene kadar §5.2'ye göre yerel bir taslak tabloyla) | Worker boş kuyrukta bekliyor, sahte bir işi `done`'a taşıyor ✓ 2026-11-08 |
| H1 | Ölçüm düzeni: `data/pipeline/eval/`. Altın set: var olan, insanca kontrol edilmiş kayıtlar (Hatay ve Konya). Alan alan doğruluk (tarih, banı, mimar, ilçe, tür, dönem, kitabe sayısı, fotoğraf konusu) | yok | `python3 data/pipeline/eval/run.py --book hatay` bir rapor üretiyor |
| H2 | Düzen tespiti + kitap haritası: karşılıklı sayfa/sütun/dil tespiti (`hatay_book.py`, `konya_book.py`'deki kuralların genelleştirilmesi) + `book-map.md` istemi | H0 | Hatay ve Konya kitaplarında harita, el yazımı `CONTENTS` listesiyle ≥%90 örtüşüyor |
| H3 | İstemler (§5.3): `asset-record.md` (PROMPT.md'den), `photo-subject.md`, `inscription-read.md`; her biri H1 ile ölçülür | H1 | Her istem için ölçüm sonucu bu dosyada (§7) |
| H4 | Eser başına hat: metin dilimi + fotoğraf + açıklama eşleme → taslak kayıt → JSON Schema doğrulama → hata varsa 1 onarım → konum (`geocode.py`) → tekrar uyarısı → `intake_draft` | H2, H3 | Hatay PDF'i uçtan uca: tüm eserler kuyrukta, `validate.py` hatası yok |
| H5 | EVREN modelleriyle ayar: EVREN'deki metin modelleri (asistanın kullandığı `qwen3.8-flash-next` ve varsa diğerleri) ve görüntü modeli (`qwen3-vl-30b`) aynı altın sette karşılaştırılır; istemler ölçüme göre iyileştirilir. Uzun bölümler modelin bağlamına sığmazsa metin parçalanır. Sonuç §7'ye yazılır | H1, H3 | Tablo + seçilen EVREN modelleri + istem sürümleri |
| H6 | **Yayın adımı** (worker): `status = 'approved' AND applied_at IS NULL` taslakları sırayla al → kaydı `data/eserler/<il>/<ilçe>/<id>.json` olarak yaz → `validate.py` → fotoğrafları `media_pipeline.py` ile işle (yerel depoya, §5.4) → `import_to_db.py` ile o eseri yerel veritabanına aktar → `applied_at = now()`. Yeni eserin id'si yayın anında veri setinde (`data/eserler`) ya da `asset` tablosunda **zaten varsa üzerine yazma**, `apply_error`'a yaz: API onayda bakar, ama onay ile yayın arasında başka bir yoldan eklenmiş olabilir. Hata olursa dosyayı geri al, `apply_error`'a yaz. **`import_to_db.py` kendi bağlantısını açar: çağırmadan önce `db.py`'nin yerel-yalnız denetimi aynı `DATABASE_URL` için çalışmalı (§0.1).** `inscription` taslakları için de: kitabeyi eserin dosyasına ekle, aynı yol (Y4 ile birlikte). `data/README.md`'ye bölüm | Y1 | Onaylanan bir kitap taslağı birkaç saniye içinde haritada; dosyası `validate.py`'den geçiyor ✓ 2026-11-09 kitap ve sohbet taslakları (`publish.py`); kitabe taslakları H7 ile |
| H7 | Kitabe Gönüllüleri, API (eski Y4): `POST /assets/:id/inscription-proposals` (hesap zorunlu, saatte 5) → fotoğrafı `photo-process.ts` kuralıyla işle → `inscription-read.md` ile taslak (`VISION_MODEL`) → `intake_draft(kind=inscription)`. API TypeScript'te olduğu için uç `apps/api`'ye yazılır; bu tek istisna için Hüseyin `apps/api/src/modules/intake/` altında yeni bir dosya açar, sözleşme değişikliği gerekirse Yiğit'e not eder | H3 (istem) | Ziyaretçinin gönderdiği kitabe kuyrukta; onaylanınca `/ar-targets`'ta ✓ 2026-11-09 (`inscription-proposals.routes.ts`, `GET /me/inscription-proposals`; yayın `publish.py`). **Model okumaz, yalnızca ön eler** (§7). Onaylanan kitabe eser sayfasında hemen; `/ar-targets`'a `npm run data:ar-targets -- --no-seals` ve eserin yeniden aktarılmasından sonra girer |

### Ortak

- **Demo verisi ve prova** (ikisi, son aşama).
- **Ölçüm sayısının panelde gösterilmesi:** H1 raporu `data/pipeline/eval/latest.json`'a yazar, panel okur (Y3'ün parçası).

## 7. Ölçüm sonuçları ve kararlar

Kararlar ve ölçümler buraya yazılır (tarih + kim).

| Tarih | Konu | Sonuç / karar | Kim |
|---|---|---|---|
| 2026-11-08 | Model sağlayıcısı | **Yalnızca EVREN.** Başka sağlayıcı (Claude API vb.) kullanılmaz. Hangi EVREN modelinin hangi işi yapacağı H5'te ölçülerek seçilir. `PROMPT.md` Sonnet ile denenmişti; EVREN'deki kalitesi bilinmiyor, ölçmeden vaat edilmez | Yiğit |
| 2026-11-08 | Kitabe Gönüllüleri kapsamı | Kitabe yalnızca var olan bir esere eklenir; yeni eser önerisi Saha Defteri'nin işi | Yiğit |
| 2026-11-08 | Saha ekibi rolü | Bu aşamada mevcut `moderator` rolü; `field` rolü sonra | Yiğit |
| 2026-11-08 | Worker'ın iş kilidi | `FOR UPDATE SKIP LOCKED` yerine oturum süren advisory lock (`pg_try_advisory_lock`). Satır kilidi iş bitene kadar bir işlemi açık tutar, ilerleme (`progress_done`) API'ye görünmez; advisory lock aynı korumayı verir, worker kapanınca kendiliğinden düşer. Taslaklar `ON CONFLICT (job_id, entry_key) … WHERE status = 'pending'` ile yazılır: onaylanmış/reddedilmiş taslağa dokunulmaz | Hüseyin |
| 2026-11-08 | **Kapsam: Sohbetten Kabul önce** | Yeni eser bilgisi admin panelinde tek bir sohbetten gelir (metin + fotoğraf), worker onu şemanın alanlarına böler (ayrıntı: [`yigit-veri-dongusu.md`](yigit-veri-dongusu.md)). PDF Kabul ikinci sıraya düşer; bir kitap bölümü sohbete yapıştırılarak elle de işlenebilir. Dört koşulla kabul edildi (aşağıdaki dört satır) | Yiğit (onay), Hüseyin (öneri) |
| 2026-11-08 | Alıntı kuralı (sert) | "Model yalnızca düzenler" istemle değil kodla sağlanır: taslaktaki her değerin `source_refs`'te bir `quote`'u olur ve worker bu alıntının sohbet mesajında **kelimesi kelimesine** geçtiğini denetler (boşluk ve büyük/küçük harf farkı dışında). Geçmeyen değer taslağa girmez, `validation.warnings`'e "kaynaksız" diye düşer. Bunun bir testi olur | Yiğit |
| 2026-11-08 | EVREN bütçesi | Sohbet ekranından önce Hüseyin gerçek bir eser metniyle tek bir taslak üretip **kredi ve süreyi** ölçer, §7'ye yazar. Bir tur 30 sn'yi ya da beklenenden fazla krediyi aşarsa istem kısaltılır, düşünme kapatılır ya da daha küçük bir EVREN modeli denenir | Yiğit |
| 2026-11-08 | İş bölümü (yeniden) | Kitabe Gönüllüleri'nin API'si (eski Y4: `POST /assets/:id/inscription-proposals` + okuma istemi) Hüseyin'e geçer (H7); uygulama ekranı (Y5) Yiğit'te kalır. Sohbet sözleşmesi, migration, API ve panel Yiğit'te | Yiğit |
| 2026-11-08 | Ölçüm sohbete uyarlanır | H1'in altın seti aynı kalır: var olan kayıtların kitap metni sohbete yapıştırılmış gibi verilir, çıkan taslak insanca kontrol edilmiş kayıtla alan alan karşılaştırılır. Sunumdaki "%X doğru" sayısı buradan gelir | Yiğit |
| 2026-11-08 | Onay = yayın (korunur) | Sohbet taslağında da onay yayın kararıdır: API kaydın `status`'unu `published` yapar, worker yayınlar (H6). "Onaydan sonra in_review" yok | Yiğit |
| 2026-11-08 | Sohbetin sınırları | Bir sohbet **tek yeni eser** getirir (külliyenin her yapısı ayrı sohbet; `parent_id` admin'in yazdığından). Var olan bir eseri sohbetle düzeltmek **şimdilik yok** (kayıt düzenleyicisi var); `input.assetId` her zaman `null`. Panelin kısa "yeni eser" formu kalır | Yiğit |
| 2026-11-08 | Fotoğraf yükleme | Çok parçalı istek yok (API'de bağımlılığı yok): fotoğraf önce tek tek `POST /admin/intake/uploads`'a (ham gövde, panel yüklemesi gibi) gider, mesaj bu yüklemelerin kimlikleriyle gönderilir. Worker yarım bir mesajı hiç görmez. `input.files[]` biçimi Hüseyin'in önerdiği gibi | Yiğit |
| 2026-11-08 | Fotoğraf işleme tek kural | Esas `apps/api/src/modules/admin/photo-process.ts`: 480/1280/2560 px, webp + jpg, EXIF yön uygulanır, konum dahil bütün üst veri silinir, anahtar `assets/<eser>/<medya>/<genişlik>.<biçim>`. `media_pipeline.py` zaten aynı (dosyadaki "Keep the two alike" notu). Sohbet yüklemelerinin işlenmiş sürümleri yayına kadar `intake/<yükleme>/<genişlik>.<biçim>` altında durur; worker yayında bunları `assets/<eser>/…` düzenine taşır | Yiğit |
| 2026-11-08 | PDF sayfa görüntüsü | Sabit yol kuralı, sözleşmede alan yok: `intake/<iş>/pages/<n>.webp` (n = PDF sayfası, 1'den), yerel depoda; panel `/local-media` üzerinden okur | Yiğit |
| 2026-11-08 | EVREN metin modeli | `qwen3.8-flash-next` cevaptan önce düşünüyor (ilk denemede 83 çıktı token'ının 65'i); `max_tokens` bol tutulmalı. Hesapta 1070 kredi var (`usage.evren.credits_remaining_cr`): H5 karşılaştırması bu bütçeyle sınırlı | Hüseyin |
| 2026-11-08 | EVREN düşünmesi kapalı | Düşünmeye bırakılan model bir sohbet taslağında 6000 token'ın hepsini düşünmeye harcayıp boş cevap verdi (136 sn). Worker her istekte `chat_template_kwargs: {enable_thinking: false}` gönderir (EVREN'in tanıdığı tek yol); aynı taslak 46 sn'de çıktı. Açmak için `INTAKE_LLM_THINKING=true` | Hüseyin |
| 2026-11-08 | EVREN bütçesi ölçüldü, sohbet modeli | Ördekli Hamam'ın metni (iki mesaj, ~3,6 bin karakter) EVREN'in dört metin modelinde: `gemma-4-31b` 14 sn, `qwen3.8-flash-next` 46-48 sn, `glm-5.3` 72 sn, `deepseek-v4.1-flash` 395 sn; dördü de aynı alanları verdi, kaynaksız değer kalmadı. **Kredi harcanmıyor:** EVREN'in bütün modelleri 2026-12-01'e kadar ücretsiz (`/models`). 30 sn sınırı yüzünden worker'ın metin modeli `gemma-4-31b` (`INTAKE_TEXT_MODEL` ile değişir; asistanınki değişmez). Kesin seçim H5'te ölçümle | Hüseyin |
| 2026-11-09 | Konumsuz eser yayınlanır | Koordinatı olmayan eser onaylanınca yayınlanır: listede, aramada, kendi sayfasında görünür; haritada ve yakındakilerde görünmez (API ve uygulama bunu zaten böyle yapıyor; veri setinde 117 örneği var). Koordinat sonradan eklenince haritaya çıkar. Uçtan uca denendi (yerel, kurgusal bir çeşmeyle; sonra silindi) | Hüseyin (kullanıcı isteği) |
| 2026-11-09 | Sohbet kaydında İngilizce | `validate.py`'de `meta.from = panel-sohbet` olan yayınlanmış kayıtta bölümlerin İngilizcesi eksikse uyarı, hata değil (öbür kayıtlarda hata kalır). Model çeviri yapmaz; uygulama Türkçesini gösterir (`pick`) | Hüseyin |
| 2026-11-09 | Kitabe Gönüllüleri: model kitabe okumaz | `qwen3-vl-30b`'ye veri setindeki 3 gerçek kitabe fotoğrafı okutuldu (Üftade Türbesi, Küçük Ayasofya Çeşmesi, Azeb Bey Türbesi). Üçünde de akıcı ama uydurma bir metin yazdı: Osmanlıca kitabelere Arapça dedi, içerik bambaşkaydı, güveni 0,4-0,6; biri döngüye girip kesildi. Dil ve hat türü tahmini de tutmadı (hepsine "ar", "sülüs"; istemdeki örneği kopyalıyordu). Uzmanı yanlış yönlendireceği için model **yalnızca ön eler**: kitabe var mı, alfabe, satır sayısı, okunaklı mı, ne engelliyor, Taşın Dili'ne uygun mu (3/3 alfabe doğru, 1-2 sn). Bunlar taslağa değil uyarılara yazılır; dil, okuma ve çeviri uzmanın, taslak olduğu gibi onaylanamaz. §12'deki B yolu | Hüseyin (ölçüm) |

## 8. Aşamalar ve kontrol noktaları

| Aşama | Yiğit | Hüseyin | Kontrol noktası (ikisi birlikte) |
|---|---|---|---|
| 0 | Y0 | H0, H1 | Tablolar yerelde; worker sahte işi bitiriyor; ölçüm raporu çıkıyor |
| 1 | Y1, Y2 | H2, H3 | Hatay PDF'i yüklenip harita onaylanıyor |
| 2 | Y3, Y4 | H4, H5 | Hatay taslakları kuyrukta, biri onaylanıp haritada; model kararı verildi |
| 3 | Y5, (Y6) | H6, ölçüm iyileştirme | Telefonda kitabe gönder → onayla → tanı |
| 4 | Demo, prova, §9 | Demo, prova, §9 | 3 dakikalık senaryo kesintisiz |

Bir aşama bitmeden sonrakine geçilebilir; kontrol noktaları birleşme anlarıdır.

## 9. `dev`'e alma ölçütleri ("kararlı")

Hepsi sağlanmadan `feat/veri-dongusu` → `dev` PR'ı açılmaz:

- [ ] `npm test`, `npm run typecheck` ve Python testleri geçiyor; CI yeşil
- [ ] Migration yalnızca ekleme yapıyor; mevcut tablolar ve veriler değişmiyor
- [ ] Sözleşme sürümü (`CONTRACT_VERSION`, `packages/contracts/package.json`) `dev`'in o anki sürümünden bir üste
      çıkarıldı. Bu dalda bilerek artırılmıyor: `dev` her sürüm artırdığında çakışma çıkmasın diye
- [ ] Migration'ın adı `dev`'deki son migration'dan sonra geliyor; gelmiyorsa yeniden adlandırıldı
- [ ] `INTAKE_ENABLED` kapalıyken uygulama ve API eskisiyle birebir aynı davranıyor
- [ ] Yerel-yalnız koruması ve yerel fotoğraf deposu üretimde devre dışı (yalnızca bayrakla)
- [ ] Sohbet fotoğrafları bu dalda yalnızca yerel depoya yazılıyor (`server.ts`, `intake.store`); üretimde R2'ye
      yazılması isteniyorsa bilerek açıldı
- [ ] Demo senaryosu (§2) yerelde baştan sona çalışıyor
- [ ] `docs/upgrade-notes.md`'ye kurulum notu (yeni tablolar, Python bağımlılıkları, ortam değişkenleri)
- [ ] Üretimde açmak (migration + bayrak) ayrı bir karar; Ahmet'in deploy'una kadar kapalı kalır

## 10. Dal ve günlük akış

```
dev ──► feat/veri-dongusu (ortak, uzun ömürlü; PR ile beslenir)
          ├── vd/y0-contracts, vd/y1-intake-api, …    (Yiğit)
          └── vd/h0-worker, vd/h1-eval, …             (Hüseyin)
```

- Her iş kendi kısa dalında (`vd/<şerit+no>-<konu>`), PR ile `feat/veri-dongusu`'na birleşir.
- `feat/veri-dongusu` günde bir kez `dev`'i içine alır (`git merge dev`); çatışmayı birleştiren çözer.
- İş başında: `git switch feat/veri-dongusu && git pull && git switch -c vd/<iş>`.
- İş bitince bu dosyadaki kendi tablonda satırın sonuna `✓ <tarih>` ekle (yalnızca kendi şeridin; çakışma olmasın).

**İhtiyaç notları** (öbür şeritten istenen değişiklik; ekleyen yazar, sahibi işaretler):

- **Hüseyin → Yiğit (kapsam değişikliği):** Yeni eser bilgisi admin panelinde tek bir sohbetten gelecek (Sohbetten Kabul). Sözleşme, migration, API ve panel değişiklikleri: [`yigit-veri-dongusu.md`](yigit-veri-dongusu.md).
- **Hüseyin → Yiğit:** Worker'ın metin modeli için `INTAKE_TEXT_MODEL` (yoksa `ASSISTANT_MODEL`), görüntü modeli için `VISION_MODEL` okunuyor. API'de başka bir ad kullanılacaksa söyle, ikisi aynı olsun.
- **Hüseyin → Yiğit (Y3):** İnceleme ekranındaki PDF sayfası görüntüsünü worker üretebilir (sayfayı PNG'ye çevirip `data/build/media/intake/<iş>/pages/<n>.png`). Sözleşmede bunun yeri yok: `intake_job`'a ya da taslağa bir alan mı, yoksa sabit bir yol kuralı mı? Karar senin.
- **Yiğit → Hüseyin (acil):** ✓ 2026-11-08 Hüseyin: yerel adla bağlanınca yalnızca Docker'ın ağı (`172.16.0.0/12`) kabul ediliyor, öbür özel ağlar değil; testi var. `db.check_server` Docker'daki PostgreSQL'i reddediyor: `localhost:5432` üzerinden bağlanınca `inet_server_addr()` konteynerin ağ adresini (`172.18.0.2`) döndürüyor, loopback değil. Yiğit'in makinesinde worker hiç açılmıyor, `test_db_guard`'lardan biri bu hatayla düşüyor. Öneri: adres yerel bir adla verildiyse (`localhost`/`127.0.0.1`/soket) Docker'ın özel ağ aralığını (`172.16.0.0/12`) da kabul et; başka özel aralıkları değil.
- **Yiğit → Hüseyin:** `INTAKE_*` bayrakları API'de artık `1`/`0`'ı da kabul ediyor.
- **Hüseyin → Yiğit (H6'dan, küçük):** Onay ucu (`intake.routes.ts`, `record = { ...record, id: assetId, status: "published" }`) durumu kaydın **en üstüne** yazıyor; veri setinin şemasında o alan yok (`additionalProperties: false`), yeri `meta.status`. Worker bugün en üstteki `status`'u silip `meta.status = published` yazıyor, yani yayın bozulmuyor; ama panelin taslak önizlemesi ve kayıt düzenleyicisi aynı kaydı okuyorsa `meta.status`'a yazmak daha doğru. Ayrıca `meta.reviewed_by`'ı worker onaylayanın `full_name`/`nickname`'inden dolduruyor.
- **Hüseyin → Yiğit (Y2 incelemesine cevap, ✓ 2026-11-08, aae6d73):** (1) Mesaj kaybı: `run_chat` işi `UPDATE … SET status = 'drafting' … WHERE … status IN ('queued','drafting') RETURNING input` ile alıyor, taslağı dönen girdiyle yazıyor; `done` yalnızca iş hâlâ `drafting`'teyse yazılıyor (`yigit-veri-dongusu.md` §1.6'daki "bugün claim'de okuyor" notu eskidi). (2) Docker: `localhost` üzerinden gelen `172.16.0.0/12` kabul. Makinende `python3 -m unittest discover -s data/pipeline/tests` ile doğrula. (3) Testler önerilen SQL'i değil `2026*_intake*` migration'larını sırasıyla kuruyor; 54 test, Hüseyin'in makinesinde (Homebrew PostgreSQL) geçiyor.
- **Hüseyin → Yiğit:** Fotoğrafları iki yer işliyor: API'de `photo-process.ts` (sharp), worker'da `media_pipeline.py` biçimi. Boyutlar (480/1280/2560), anahtar düzeni ve konum bilgisinin silinmesi aynı olmalı; esas alınacak tarafı yazalım. Ben `photo-process.ts`'e uyarım.
- **Hüseyin → Yiğit (H7, Y5 için):** Kitabe Gönüllüleri'nin API'si hazır (`apps/api/src/modules/intake/inscription-proposals.routes.ts`,
  `INTAKE_ENABLED` arkasında). (1) Sözleşme: istek ve cevap şemaları şimdilik o dosyada (`InscriptionProposalQuerySchema`,
  `InscriptionProposalSchema`, `…ResponseSchema`, `…ListResponseSchema`); sözleşme senin olduğu için `intake.schema.ts`'e taşıyıp
  oradan almanı bekliyorum. (2) Uçlar: `POST /assets/:id/inscription-proposals` (hesap zorunlu; gövde fotoğrafın kendisi, `?location=&note=`;
  saatte 5, aşan 429 `TOO_MANY_PROPOSALS`; cevap 1-3 sn) ve `GET /me/inscription-proposals` (Profil'deki durum: `pending` / `approved` +
  `published` / `rejected` + `reviewNote`). Ziyaretçi modelin değerlendirmesini görmez. (3) Panel: kitabe taslağının `record`'u
  `InscriptionDraft`; dil, okuma ve çeviri **boş gelir**, uzman doldurur (taslakta her zaman bir hata var, olduğu gibi onaylanamaz). Modelin
  ipuçları `validation.warnings`'te, fotoğraf `media[0]`. Onay ekranında fotoğrafı büyük göster, uzman ondan okuyacak. (4) Rozet
  ("Kitabe Gönüllüsü") Y5'te: `published: true` olan ilk gönderimde. (5) `VISION_MODEL` boşsa gönderim yine kabul edilir, ön eleme olmadan.

## 11. Yerel kurulum (bir kez)

```
npm install
npm run db:up
cd apps/api && npx prisma migrate deploy && cd ../..
npm run db:import
python3 -m pip install pymupdf "psycopg[binary]"
```

`apps/api/.env`'de olması gerekenler:
- `DATABASE_URL` (localhost)
- `INTAKE_LOCAL_ONLY=true`
- `INTAKE_ENABLED=true`
- EVREN: `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY`, `ASSISTANT_MODEL`, `VISION_MODEL`
- Telefonla deneyecekler için: `LOCAL_MEDIA_BASE_URL=http://<bilgisayarın IP'si>:3000/local-media`

Kurallar:
- `MEDIA_S3_*` **olmamalı**; varsa API açılmaz.
- `MEDIA_BASE_URL` değiştirilmez (§5.4).
- PDF'ler `data/build/cache/intake/` altında durur (git'e girmez).

Dal güncellendikçe: `npm run db:deploy -w @vagabonds/api` (yeni migration'lar) ve `npx prisma generate`
(`apps/api` içinde; tip hatası "alan yok" diyorsa istemci eskidir).

## 12. Riskler

| Risk | Önlem |
|---|---|
| Model kitabeyi yanlış okur | **Gerçekleşti** (§7, 2026-11-09): B yoluna geçildi, uzman okur; model yalnızca ön eler |
| Kitap düzeni tespit edilemez | Harita elle düzenlenebilir; sayfa aralığı girmek kod yazmaktan hızlı |
| Uzun işler yarıda kalır | Worker iş durumunu adım adım yazar, kaldığı yerden sürdürür |
| Kötüye kullanım (ziyaretçi gönderimi) | Hesap zorunlu, oran sınırı, onaysız yayın yok |
| Gizlilik | Fotoğraflardaki konum bilgisi yayınlananlardan silinir; onay ekranında "yüz var mı" hatırlatması |
| Sunuma yetişmemek | Dal ayrı; `dev` ve demo etkilenmez. Aşama 2 tek başına da gösterilebilir |

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
   onayla/reddet ─────▶ │ POST /admin/intake/drafts/:id/approve|reject             │
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
                       └──────────────────────────────────────────────────────────┘
```

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
| Y1 | Intake API: iş oluştur (PDF yükleme, ≤200 MB, diske), iş durumu, haritayı onayla, taslak listesi, onayla/reddet | Y0 | API testleri; onay `book_asset` taslağını `asset` + medya olarak yazıyor (yeni eserler `published` değil `in_review` başlar, sonra yayına alınır) |
| Y2 | Panel: PDF Kabul ekranları (yükle, ilerleme, kitap haritası tablosu düzenle/onayla) | Y1 | Hatay PDF'iyle harita onaylanıp iş `drafting`'e geçiyor |
| Y3 | Panel: birleşik onay kuyruğu (eski katkılar + `intake_draft`), yan yana inceleme (PDF sayfası görüntüsü + alanlar + kaynak sayfa işaretleri + doğrulama + tekrar uyarısı) | Y1 | Bir taslak düzeltilip onaylanınca eser haritada görünüyor |
| Y4 | Kitabe Gönüllüleri, API: `POST /assets/:id/inscription-proposals` (hesap zorunlu, saatte 5) → fotoğrafı işle → `inscription-read.md` ile taslak → `intake_draft(kind=inscription)`; onayda esere kitabe + `ar_target_media_key` | Y0, H3 (istem; o gelene kadar sahte taslak) | Onaylanan kitabe `/ar-targets`'ta |
| Y5 | Kitabe Gönüllüleri, uygulama: eser sayfasında ve Taşın Dili'nde "Bu kitabe listede yok mu?" → kamera → gönder → "taslak, onay bekliyor" + Profil'de durum; onayda "Kitabe Gönüllüsü" rozeti | Y4 | Telefonda uçtan uca: gönder → onayla → kamera tanıyor |
| Y6 | (zaman kalırsa) Saha Defteri: toplu fotoğraf yükleme + konum okuma (fotoğraf işlenmeden önce) + konu önerisi | Y0, H3 | — |

### Hüseyin şeridi (Python ve veri: `data/pipeline/`, `data/tools/`, istemler)

| # | İş | Bağımlılık | Bitti sayılır |
|---|---|---|---|
| H0 | `data/pipeline/` iskeleti: `db.py` (yerel-yalnız denetimi, §5.5), `llm.py` (EVREN istemcisi: OpenAI uyumlu `/chat/completions`, adres ve anahtar API ile aynı ortam değişkenlerinden — `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY`; metin ve görüntü modeli ayrı değişkenlerle seçilir; zaman aşımı, yeniden deneme, oran sınırına uyma), `worker.py` döngüsü (`FOR UPDATE SKIP LOCKED`, yarıda kalan iş kaldığı yerden sürer) | Y0'ın tabloları (o gelene kadar §5.2'ye göre yerel bir taslak tabloyla) | Worker boş kuyrukta bekliyor, sahte bir işi `done`'a taşıyor |
| H1 | Ölçüm düzeni: `data/pipeline/eval/`. Altın set: var olan, insanca kontrol edilmiş kayıtlar (Hatay ve Konya). Alan alan doğruluk (tarih, banı, mimar, ilçe, tür, dönem, kitabe sayısı, fotoğraf konusu) | yok | `python3 data/pipeline/eval/run.py --book hatay` bir rapor üretiyor |
| H2 | Düzen tespiti + kitap haritası: karşılıklı sayfa/sütun/dil tespiti (`hatay_book.py`, `konya_book.py`'deki kuralların genelleştirilmesi) + `book-map.md` istemi | H0 | Hatay ve Konya kitaplarında harita, el yazımı `CONTENTS` listesiyle ≥%90 örtüşüyor |
| H3 | İstemler (§5.3): `asset-record.md` (PROMPT.md'den), `photo-subject.md`, `inscription-read.md`; her biri H1 ile ölçülür | H1 | Her istem için ölçüm sonucu bu dosyada (§7) |
| H4 | Eser başına hat: metin dilimi + fotoğraf + açıklama eşleme → taslak kayıt → JSON Schema doğrulama → hata varsa 1 onarım → konum (`geocode.py`) → tekrar uyarısı → `intake_draft` | H2, H3 | Hatay PDF'i uçtan uca: tüm eserler kuyrukta, `validate.py` hatası yok |
| H5 | EVREN modelleriyle ayar: EVREN'deki metin modelleri (asistanın kullandığı `qwen3.8-flash-next` ve varsa diğerleri) ve görüntü modeli (`qwen3-vl-30b`) aynı altın sette karşılaştırılır; istemler ölçüme göre iyileştirilir. Uzun bölümler modelin bağlamına sığmazsa metin parçalanır. Sonuç §7'ye yazılır | H1, H3 | Tablo + seçilen EVREN modelleri + istem sürümleri |
| H6 | Dışa aktarma: onaylanan `book_asset` taslaklarını `data/eserler/<il>/<ilçe>/<id>.json` olarak yaz (`export_panel_assets.py` genişler) + `data/README.md`'ye bölüm | Y1 | Onaylanan bir eser `validate.py`'den geçen bir dosya oluyor |

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

- (boş)

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
| Model kitabeyi yanlış okur | `uncertain` işaretleri, güven puanı, zorunlu uzman onayı. Ölçüm kötüyse B "fotoğrafı gönder, uzman okusun"a düşer; akış aynı kalır |
| Kitap düzeni tespit edilemez | Harita elle düzenlenebilir; sayfa aralığı girmek kod yazmaktan hızlı |
| Uzun işler yarıda kalır | Worker iş durumunu adım adım yazar, kaldığı yerden sürdürür |
| Kötüye kullanım (ziyaretçi gönderimi) | Hesap zorunlu, oran sınırı, onaysız yayın yok |
| Gizlilik | Fotoğraflardaki konum bilgisi yayınlananlardan silinir; onay ekranında "yüz var mı" hatırlatması |
| Sunuma yetişmemek | Dal ayrı; `dev` ve demo etkilenmez. Aşama 2 tek başına da gösterilebilir |

# Vakıf Eserleri: Veri Seti ve Backend Rehberi (v1.0)

Bu belge **backend geliştiricisi** için yazıldı. Veri ekibinin ürettiği JSON dosyalarının ne içerdiğini, veritabanında hangi tablolarla tutulacağını, görsellerin nasıl saklanıp sunulacağını ve içe aktarmanın nasıl yapılacağını anlatır. Tek başına okunabilecek şekilde yazıldı; bir yapay zekâ asistanına da olduğu gibi verilebilir.

İçindekiler:
1. Bağlam
2. Dosyalar
3. Backend'in uyması gereken kurallar
4. Eser JSON'unun yapısı
5. Veritabanı şeması (PostgreSQL)
6. JSON → tablo eşlemesi
7. İçe aktarma (import)
8. Görseller: depolama, işleme, sunum
9. API önerisi
10. Genişletme: yeni il, tür, dil
11. Veri ekibi için: yeni eser ekleme
12. Veri görüntüleyici

### Hızlı başlangıç

Repoyu çektikten sonra:

```bash
pip install jsonschema pillow certifi "psycopg[binary]"

python3 data/tools/media_pipeline.py        # görselleri manifestteki yollarla üretir (ilk sefer Drive'dan indirir)
python3 data/tools/build_viewer.py          # viewer/data.js üretir
open data/viewer/index.html                 # tüm veriyi tarayıcıda gez (sunucu gerekmez)

export DATABASE_URL=postgresql://user:pass@localhost:5432/kokkod
python3 data/tools/import_to_db.py --create-schema --verify   # boş DB: şemayı kur, içe aktar, doğrula
python3 data/tools/import_to_db.py --verify                   # sonraki seferler (tekrar çalıştırılabilir)
```

---

## 1. Bağlam

KÖK&KOD Hackathonu (Vakıf Katılım × 42 Türkiye). Türkiye'deki vakıf eserlerini keşfettiren bir **mobil uygulama** geliştiriyoruz. Kaynak veri, Vakıf Katılım'ın *Vakıf Eserleri Envanteri* kitapları (Bursa, Konya, Hatay) ve Bursa fotoğraf arşividir (Google Drive).

Şartnamenin backend'i doğrudan ilgilendiren maddeleri:
- **İçerik ekleme ve düzenleme** imkânı olmalı. Admin panel gerekli.
- Sistem **yeni eser, şehir ve içerik türü** eklenmesine uygun olmalı.
- Tarihsel içerikte **kaynak gösterilmeli**; **doğrulanmamış bilgi kesin bilgi gibi sunulmamalı**.
- Topluluk katkısı varsa yayından önce **moderasyon/onay** gerekli.
- Kişisel veri işlenirse korunmalı (KVKK).

Uygulama özellikleri ve kullandıkları veri:

| Özellik | Kullandığı veri |
|---|---|
| Harita, filtre, arama | `asset` (konum, tür, il, dönem), `asset_media` (kapak) |
| Eser detay sayfası | `asset_section`, `asset_fact`, `timeline_event`, `asset_legend`, `source_citation` |
| Zaman Perdesi (eski/yeni foto) | `asset_media` (`kind = archive_photo`, opaklık ayarı) |
| Taşın Dili (AR kitabe) | `inscription` + AR işaretçisi olarak kullanılacak görsel |
| Kentsel Ağ / Sis Açma | `asset_relation` |
| Rota planlayıcı | `asset` (konum, ziyaret süresi, açık/kapalı alan) |
| Ziyaretçi Nabzı | `visitor_tip` |
| Sesli Zaman Kapsülü | `asset.ambient_sound_key` + altyazı |
| Erişilebilirlik | `asset.a11y_*`, `audio_description_*`, her görselde `alt_*` |
| Topluluk katkısı | `contribution`, `media.status` |

---

## 2. Dosyalar

```
data/
├── README.md                  # bu belge
├── eksikler.md                # eksikler ve yapılacaklar
├── enums.json                 # sabit listeler → lookup tabloları
├── sources.json               # kaynaklar (kitaplar, foto arşivi) → source tablosu
├── schema/eser.schema.json    # eser JSON'unun JSON Schema tanımı
├── eserler/<il>/<ilçe>/<id>.json   # her eser bir dosya → asset + alt tablolar
├── tools/
│   ├── validate.py            # şema + çapraz kontrol (veri ekibi her değişiklikte çalıştırır)
│   ├── media_pipeline.py      # fotoğrafları indirir, sürümlerini üretir, manifesti yazar
│   ├── db_rows.py             # JSON + manifest → DB satırları (TEK eşleme kaynağı)
│   ├── import_to_db.py        # referans içe aktarma + doğrulama (db_rows.py'yi kullanır)
│   └── build_viewer.py        # görüntüleyici verisi (db_rows.py'yi kullanır)
├── viewer/                    # statik veri görüntüleyici (index.html, app.js, styles.css; data.js üretilir)
└── build/
    ├── media-manifest.json    # her görselin hash, boyut ve sürüm bilgisi   ← git'e GİRER
    ├── media/                 # yüklemeye hazır görsel sürümleri           ← git'e girmez
    └── cache/                 # Drive'dan indirilen orijinaller            ← git'e girmez
```

Referans kayıt: [eserler/bursa/osmangazi/bursa-osmangazi-ulucami.json](eserler/bursa/osmangazi/bursa-osmangazi-ulucami.json)

Backend'e gelen her JSON `validate.py`'den geçmiştir: tipler doğru, kodlar geçerli, kaynak id'leri mevcut. Backend bu kontrolleri tekrar etmek zorunda değil, ama DB kısıtları (aşağıda) aynı kuralları ikinci kez korur.

---

## 3. Backend'in uyması gereken kurallar

1. **Yalnızca `status = 'published'` olan eserler** uygulamaya döner. `draft` ve `in_review` kayıtlar yalnızca admin panelde görünür.
2. **Güven düzeyi (`confidence`) arayüze kadar taşınır.** Her bölüm, bilgi ve olay bir güven düzeyi taşır:
   | kod | anlamı | arayüzde |
   |---|---|---|
   | `certain` | kaynak kesin dille söylüyor | normal |
   | `probable` | kaynak "tahmin edilmektedir" diyor | "Tahmini" rozeti |
   | `disputed` | birden çok görüş var | "Tartışmalı" rozeti |
   | `legend` | rivayet, halk inancı | ayrı "Rivayet" kartı |

   API bu alanı **atlamamalı**. Şartnamenin "doğrulanmamış içerik kesin sunulmamalı" maddesi buna dayanıyor.
3. **Rivayetler (`asset_legend`) ayrı tutulur**, tarihçe bölümleriyle karıştırılmaz. `source_verdict` alanı üç değer alır: `folk_belief` (halk inancı), `refuted_by_source` (kaynak reddediyor), `unverified` (doğrulanmamış).
4. **Her içerik parçasının kaynağı vardır** (`source_citation`). Detay ekranında "Kaynak: Bursa Vakıf Eserleri I. Cilt, s. 52-55" gösterilir.
5. **Dil:** Her metin `_tr` ve `_en` olarak tutulur. `_tr` zorunludur, `_en` boş olabilir. İstenen dil boşsa `_tr` döner.
6. **Bilinmeyen değer `NULL` ya da `'unknown'` olur**, tahminle doldurulmaz. Örneğin erişilebilirlik bilinmiyorsa arayüz "Bilgi yok" der, "Erişilebilir" demez.
7. **Fotoğrafın çekildiği GPS konumu** (`media.capture_lat`/`capture_lng`) API'de **asla dönmez**.
8. **Her görselde `alt_tr` ve `credit` zorunludur** ve arayüzde gösterilir (erişilebilirlik ve telif).

---

## 4. Eser JSON'unun yapısı

Kısaltılmış örnek; tamamı [bursa-osmangazi-ulucami.json](eserler/bursa/osmangazi/bursa-osmangazi-ulucami.json) dosyasında:

```jsonc
{
  "schema_version": "1.0",
  "id": "bursa-osmangazi-ulucami",                 // <il>-<ilçe>-<ad>; değişmez, upsert anahtarı
  "meta": { "status": "in_review", "created_at": "2026-10-14", "updated_at": "2026-10-14",
            "prepared_by": "...", "reviewed_by": null, "from": "Ulucamii", "todos": [], "data_quality_notes": [] },
  "name": { "tr": "Ulucami", "en": "Ulucami (Grand Mosque of Bursa)" },
  "subtitle": { "tr": "...", "en": "..." },
  "alternate_names": [{ "tr": "Bursa'nın Ayasofyası", "en": "...", "note": "..." }],
  "type": "cami", "secondary_types": [], "parent_id": null, "era": "erken-osmanli", "tags": ["..."],
  "location": { "region": "marmara", "city": "bursa", "district": "Osmangazi", "neighborhood": "...",
                "address": "...", "coordinates": { "lat": 40.18417, "lng": 29.06167, "source": "manual",
                "verified": true, "verification_note": "..." }, "source_refs": [...] },
  "dating":    { "display": {"tr": "H. 802 / M. 1399-1400"}, "start_year": 1396, "end_year": 1400,
                 "hijri_year": 802, "century": 14, "basis": {...}, "confidence": "certain", "source_refs": [...] },
  "founder":   { "name": "Sultan Yıldırım Bayezid", "role": "banî", "confidence": "certain", "source_refs": [...] },
  "architect": { "name": null, "candidates": [{ "name": "Ali Neccâr" }, ...], "confidence": "disputed", "source_refs": [...] },
  "waqf":      { "name": "...", "deed": null, "conditions": null, "land_note": {...}, "confidence": "certain", "source_refs": [...] },
  "summary":   { "tr": "...", "en": "..." },
  "sections":  [{ "id": "minber", "order": 7, "title": {...}, "body": {...}, "confidence": "certain",
                  "source_refs": [{ "source_id": "vk-bursa-c1", "pages": "52-55" }] }],
  "legends":   [{ "id": "vav-harfi", "title": {...}, "body": {...}, "source_verdict": "folk_belief", "source_refs": [...] }],
  "facts":     [{ "key": "kubbe_sayisi", "label": {...}, "value": 20, "unit": null, "note": {...}, "confidence": "certain", "source_refs": [...] }],
  "people":    [{ "name": "Süleyman Çelebi", "role": { "tr": "İlk imam", "en": "First imam" } }],
  "inscriptions": [{ "id": "minber-kapi-kitabesi", "location": {...}, "language": "ar", "script": null,
                     "transliteration": "Mimmâ umile ...", "translation": {...}, "author": null,
                     "date": { "hijri_year": 802, "gregorian": "1399-1400" }, "ar_target_media_id": null, "source_refs": [...] }],
  "timeline":  [{ "id": "deprem-1855", "year": 1855, "date": null, "hijri": null, "type": "damage",
                  "title": {...}, "note": {...}, "confidence": "certain", "source_refs": [...] }],
  "highlights":[{ "feature": "minber", "title": {...}, "hint": {...}, "section_id": "minber" }],
  "relations": [{ "target_id": "bursa-osmangazi-emir-hani", "type": "urban_context", "description": {...},
                  "confidence": "certain", "source_refs": [...] }],
  "visit":     { "setting": "mixed", "estimated_duration_min": 45, "estimated_duration_source": "team_estimate",
                 "entrance_fee": "free", "notes": {...}, "notes_source": "team_estimate", "visitor_tips": [] },
  "accessibility": { "wheelchair_access": "unknown", "step_free_entrance": "unknown", "ramp": "unknown",
                     "accessible_toilet": "unknown", "verified": false, "notes": null,
                     "audio_description": {...}, "audio_description_source": "..." },
  "ambient_sound": { "sound_key": "cami-sadirvan", "caption": { "tr": "[Şadırvandan akan su sesi ...]" } },
  "media_folder":  { "provider": "google_drive", "folder_id": "...", "path": "...", "book_layout_pdf_file_id": "...",
                     "links_folder_id": "...", "book_pdf_name": "4-Su Yapıları.pdf", "book_pages": "711-719" },
  "media": [{ "id": "m01", "type": "photo", "is_cover": true, "order": 1,
              "source": { "provider": "google_drive", "file_id": "1cXJ...", "original_name": "DJI_....jpeg",
                          "folder_id": "...", "folder_path": ".../Links", "book_pdf_file_id": "...",
                          "book_pdf_name": "4-Su Yapıları.pdf", "book_page": "717" },
              "subject": "exterior", "focal_point": { "x": 0.5, "y": 0.6 },
              "caption": {...}, "alt": {...}, "credit": "...", "photographer": null,
              "captured_at": "2024-11-29", "license": "vakif-katilim-hackathon", "source_id": "vk-bursa-foto-arsivi" }],
  "archive_media": [],     // Zaman Perdesi: media ile aynı + "year", "year_approx", "overlay": { opacity, aspect_ratio, shooting_hint }
  "exhibitions": []        // [{ name, venue, start_date, end_date, media_ids }]
}
```

Önemli noktalar:
- `source_refs` her zaman `[{ "source_id": "...", "pages": "..." }]` biçimindedir. `source_id` değeri `sources.json`'daki bir kayda karşılık gelir.
- Çok dilli alanlar her zaman `{ "tr": "...", "en": "..." | null }` biçimindedir.
- Kod alanlarının (`type`, `era`, `location.region`, `location.city`, `timeline[].type`, `relations[].type`) geçerli değerleri `enums.json`'dadır.
- `media[]` görselin boyutunu, sürümlerini ve depolama yolunu **içermez**. Bunlar `build/media-manifest.json`'dadır (Bölüm 8).

---

## 5. Veritabanı şeması (PostgreSQL)

### Genel bakış

```
region ─< city ─< asset >─ asset_type          (lookup tabloları enums.json'dan gelir)
                    │  └── era
                    │
                    ├─< asset_section            tarihçe bölümleri
                    ├─< asset_legend             rivayetler
                    ├─< asset_fact               sayısal bilgiler
                    ├─< asset_person             kişiler
                    ├─< timeline_event >─ timeline_event_type
                    ├─< asset_highlight
                    ├─< asset_relation >─ relation_type   (hedef id'ye FK yok, bkz. not)
                    ├─< visitor_tip
                    ├─< exhibition
                    ├─< source_citation >─ source         her içerik parçasının kaynağı
                    ├─< asset_media >─ media ─< media_variant
                    ├─< inscription  (AR görseli → asset_media)
                    ├─< contribution  (topluluk katkısı, moderasyon)
                    └─< asset_revision (değişiklik geçmişi)
```

Tasarım kararları:
- **Eser kimliği metin (`text`) türündedir**: `'bursa-osmangazi-ulucami'`. Okunabilir, URL'de kullanılabilir ve JSON ile birebir eşleşir. Görseller ve katkılar gibi kullanıcı tarafında üretilen kayıtlar `uuid` kullanır.
- **Çok dillilik `_tr` / `_en` sütunlarıyla** tutulur. İki dil için en sade çözüm budur; üçüncü bir dil gelirse Bölüm 10'a bakın.
- **Alt tablolar `(asset_id, slug)` birleşik anahtarı** kullanır. Slug, JSON'daki `id` alanıdır (`'minber'`, `'deprem-1855'`). Yeniden içe aktarmada aynı satır güncellenir.
- **Liste niteliğindeki ama sorgulanmayan alanlar `jsonb`** olarak tutulur: `alternate_names`, `architect_candidates`, `todos`. Sorgulanan her şey ayrı sütundur.
- **`asset.source_json`** içe aktarılan ham kaydı saklar. Bu, izlenebilirlik ve JSON'a geri dışa aktarım için gerekir.

### DDL

**PostgreSQL 15 veya üstü** gerekir (`ON DELETE SET NULL (sütun)` söz dizimi için). PostgreSQL 16 üzerinde çalıştırıldı ve Ulucami kaydı içe aktarılarak test edildi: 1 eser, 11 bölüm, 21 olay, 63 kaynak atfı, 10 görsel, 60 sürüm, 6 ilişki.

```sql
-- ─────────────────────────────── Ortak tipler
CREATE DOMAIN confidence  AS text CHECK (VALUE IN ('certain','probable','disputed','legend'));
CREATE DOMAIN a11y_status AS text CHECK (VALUE IN ('yes','partial','no','unknown'));

-- ─────────────────────────────── Lookup tabloları (enums.json'dan seed edilir)
CREATE TABLE region (
  code      text PRIMARY KEY,
  label_tr  text NOT NULL,
  label_en  text
);
CREATE TABLE city (
  code        text PRIMARY KEY,
  region_code text NOT NULL REFERENCES region(code),
  plate       smallint,
  label_tr    text NOT NULL,
  label_en    text
);
CREATE TABLE asset_type (
  code          text PRIMARY KEY,
  label_tr      text NOT NULL,
  label_en      text,
  ambient_sound text                       -- türün varsayılan ortam sesi
);
CREATE TABLE era                 (code text PRIMARY KEY, label_tr text NOT NULL, label_en text);
CREATE TABLE relation_type       (code text PRIMARY KEY, label_tr text NOT NULL, label_en text);
CREATE TABLE timeline_event_type (code text PRIMARY KEY, label_tr text NOT NULL, label_en text);

-- ─────────────────────────────── Kaynaklar (sources.json)
CREATE TABLE source (
  id          text PRIMARY KEY,            -- 'vk-bursa-c1'
  type        text NOT NULL,               -- book | photo_archive | article | website | archive_document
  title_tr    text NOT NULL,
  title_en    text,
  publisher   text,
  year        smallint,
  isbn        text,
  url         text,
  is_official boolean NOT NULL DEFAULT false,
  extra       jsonb   NOT NULL DEFAULT '{}' -- yazarlar, fotoğrafçılar vb.
);

-- ─────────────────────────────── Eser
CREATE TABLE asset (
  id               text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status           text NOT NULL CHECK (status IN ('draft','in_review','published')),
  type_code        text NOT NULL REFERENCES asset_type(code),
  secondary_types  text[] NOT NULL DEFAULT '{}',
  parent_id        text REFERENCES asset(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED, -- külliye
  era_code         text REFERENCES era(code),
  tags             text[] NOT NULL DEFAULT '{}',

  name_tr          text NOT NULL,
  name_en          text,
  subtitle_tr      text,
  subtitle_en      text,
  alternate_names  jsonb NOT NULL DEFAULT '[]',
  summary_tr       text NOT NULL,
  summary_en       text,

  -- konum
  city_code        text NOT NULL REFERENCES city(code),
  district         text NOT NULL,
  neighborhood     text,
  address          text,
  lat              double precision CHECK (lat BETWEEN 35.5 AND 42.5),   -- isteğe bağlı: NULL ise eser haritada görünmez
  lng              double precision CHECK (lng BETWEEN 25.5 AND 45.0),   -- lat ile birlikte dolu ya da boş (asset_coordinates_pair)
  coord_source     text,
  coord_verified   boolean NOT NULL DEFAULT false,

  -- tarihleme
  dating_display_tr text,
  dating_display_en text,
  start_year        smallint,
  end_year          smallint,
  hijri_year        smallint,
  century           smallint,
  dating_basis_tr   text,
  dating_basis_en   text,
  dating_confidence confidence,

  -- banî, mimar, vakıf
  founder_name          text,
  founder_role          text,
  founder_confidence    confidence,
  architect_name        text,                       -- kesin biliniyorsa
  architect_candidates  jsonb NOT NULL DEFAULT '[]', -- [{name, note}]
  architect_confidence  confidence,
  waqf_name             text,
  waqf_deed             jsonb,                       -- {date_display, excerpt{tr,en}}
  waqf_conditions_tr    text,
  waqf_conditions_en    text,
  waqf_land_note_tr     text,
  waqf_land_note_en     text,
  waqf_confidence       confidence,

  -- ziyaret (rota planlayıcı)
  visit_setting          text CHECK (visit_setting IN ('indoor','outdoor','mixed')),
  visit_duration_min     smallint CHECK (visit_duration_min >= 5),
  visit_duration_source  text CHECK (visit_duration_source IN ('source','team_estimate')),
  entrance_fee           text CHECK (entrance_fee IN ('free','paid','unknown')),
  visit_notes_tr         text,
  visit_notes_en         text,

  -- erişilebilirlik
  a11y_wheelchair       a11y_status NOT NULL DEFAULT 'unknown',
  a11y_step_free        a11y_status NOT NULL DEFAULT 'unknown',
  a11y_ramp             a11y_status NOT NULL DEFAULT 'unknown',
  a11y_toilet           a11y_status NOT NULL DEFAULT 'unknown',
  a11y_verified         boolean NOT NULL DEFAULT false,
  a11y_notes_tr         text,
  a11y_notes_en         text,
  audio_description_tr  text,                        -- görme engelliler için sesli betimleme metni
  audio_description_en  text,

  -- ortam sesi
  ambient_sound_key     text,
  ambient_caption_tr    text,                        -- işitme engelliler için altyazı
  ambient_caption_en    text,

  -- yönetim
  media_folder        jsonb,
  prepared_by         text,
  reviewed_by         text,
  todos               jsonb NOT NULL DEFAULT '[]',
  data_quality_notes  jsonb NOT NULL DEFAULT '[]',
  source_json         jsonb NOT NULL,                -- içe aktarılan ham kayıt
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CHECK (start_year IS NULL OR end_year IS NULL OR start_year <= end_year),
  CHECK (status <> 'published' OR reviewed_by IS NOT NULL)
);
CREATE INDEX asset_published_idx ON asset (city_code, type_code) WHERE status = 'published';
CREATE INDEX asset_geo_idx       ON asset (lat, lng);   -- PostGIS kurulursa: geography(Point) + GIST
CREATE INDEX asset_parent_idx    ON asset (parent_id);
CREATE INDEX asset_search_idx    ON asset USING gin (
  to_tsvector('simple', name_tr || ' ' || coalesce(name_en, '') || ' ' || summary_tr)
);

-- ─────────────────────────────── İçerik alt tabloları
CREATE TABLE asset_section (
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  sort_order  smallint NOT NULL,
  title_tr    text NOT NULL,
  title_en    text,
  body_tr     text NOT NULL,
  body_en     text,
  confidence  confidence NOT NULL,
  PRIMARY KEY (asset_id, slug)
);

CREATE TABLE asset_legend (
  asset_id        text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  sort_order      smallint NOT NULL,
  title_tr        text NOT NULL,
  title_en        text,
  body_tr         text NOT NULL,
  body_en         text,
  source_verdict  text NOT NULL CHECK (source_verdict IN ('folk_belief','refuted_by_source','unverified')),
  PRIMARY KEY (asset_id, slug)
);

CREATE TABLE asset_fact (
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  key         text NOT NULL,
  sort_order  smallint NOT NULL,
  label_tr    text NOT NULL,
  label_en    text,
  value       text NOT NULL,          -- gösterim için ('55 × 69', '~170')
  value_num   numeric,                -- sayıysa ayrıca (sıralama, oyun soruları)
  unit        text,
  note_tr     text,
  note_en     text,
  confidence  confidence NOT NULL,
  PRIMARY KEY (asset_id, key)
);

CREATE TABLE asset_person (
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  sort_order  smallint NOT NULL,
  name        text NOT NULL,
  role_tr     text NOT NULL,
  role_en     text,
  PRIMARY KEY (asset_id, sort_order)
);

CREATE TABLE timeline_event (
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  year        smallint NOT NULL,
  date        date,                   -- tam tarih biliniyorsa
  hijri       text,                   -- '13 Cemaziyelevvel 899'
  type_code   text NOT NULL REFERENCES timeline_event_type(code),
  title_tr    text NOT NULL,
  title_en    text,
  note_tr     text,
  note_en     text,
  confidence  confidence NOT NULL,
  PRIMARY KEY (asset_id, slug)
);
CREATE INDEX timeline_year_idx ON timeline_event (asset_id, year);

CREATE TABLE asset_highlight (
  asset_id      text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  sort_order    smallint NOT NULL,
  feature       text NOT NULL,
  title_tr      text NOT NULL,
  title_en      text,
  hint_tr       text NOT NULL,
  hint_en       text,
  section_slug  text,
  PRIMARY KEY (asset_id, sort_order),
  FOREIGN KEY (asset_id, section_slug) REFERENCES asset_section(asset_id, slug) ON DELETE SET NULL (section_slug)
);

-- Eserler arası bağ. Hedef eser henüz veri setinde olmayabilir, bu yüzden target_asset_id'ye FK YOK.
-- Uygulama yalnızca hedefi mevcut ve yayında olan bağları gösterir (asset_relation_live görünümü).
CREATE TABLE asset_relation (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_asset_id  text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  target_asset_id  text NOT NULL CHECK (target_asset_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  type_code        text NOT NULL REFERENCES relation_type(code),
  description_tr   text NOT NULL,
  description_en   text,
  confidence       confidence NOT NULL,
  UNIQUE (source_asset_id, target_asset_id, type_code),
  CHECK (source_asset_id <> target_asset_id)
);
CREATE INDEX relation_target_idx ON asset_relation (target_asset_id);

CREATE VIEW asset_relation_live AS
SELECT r.*
FROM asset_relation r
JOIN asset s ON s.id = r.source_asset_id AND s.status = 'published'
JOIN asset t ON t.id = r.target_asset_id AND t.status = 'published';

CREATE TABLE visitor_tip (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id      text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  text_tr       text NOT NULL,
  text_en       text,
  origin        text NOT NULL CHECK (origin IN ('field_visit','visitor_reviews_summary','official')),
  collected_at  date
);

CREATE TABLE exhibition (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  name_tr     text NOT NULL,
  name_en     text,
  venue       text,
  start_date  date,
  end_date    date
);

-- Her içerik parçasının kaynağı. entity + entity_key ile hangi satıra ait olduğu belirlenir:
--   entity = location | dating | founder | architect | waqf  → entity_key = ''
--   entity = section | legend | inscription | timeline       → entity_key = slug
--   entity = fact                                            → entity_key = key
--   entity = relation                                        → entity_key = '<target_id>:<type>'
CREATE TABLE source_citation (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  entity      text NOT NULL CHECK (entity IN ('location','dating','founder','architect','waqf',
                                              'section','legend','fact','inscription','timeline','relation')),
  entity_key  text NOT NULL DEFAULT '',
  source_id   text NOT NULL REFERENCES source(id),
  pages       text
);
CREATE INDEX citation_lookup_idx ON source_citation (asset_id, entity, entity_key);
CREATE INDEX citation_source_idx ON source_citation (source_id);  -- "bu kitap hangi eserlerde kaynak?"

-- ─────────────────────────────── Görseller (ayrıntı: Bölüm 8)
-- Fiziksel dosya: bir kez saklanır, birden çok esere bağlanabilir
CREATE TABLE media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256          char(64) NOT NULL UNIQUE,            -- aynı dosya iki kez saklanmaz
  kind            text NOT NULL CHECK (kind IN ('photo','archive_photo','drawing','audio','video','document')),
  original_key    text NOT NULL,                       -- private bucket'taki yol
  original_bytes  bigint NOT NULL,
  width           int NOT NULL,
  height          int NOT NULL,
  aspect_ratio    numeric(6,4) NOT NULL,
  dominant_color  char(7),                             -- '#9a9b97'
  lqip            text,                                -- 16 px bulanık önizleme (data URI, ~300 bayt)
  captured_at     timestamp,                           -- EXIF yerel saati; saat dilimi bilgisi yok, bu yüzden timestamptz değil
  capture_lat     double precision,                    -- EXIF GPS: yalnızca iç kullanım, API'de DÖNMEZ
  capture_lng     double precision,
  credit          text NOT NULL,
  photographer    text,
  license         text NOT NULL,
  source_id       text REFERENCES source(id),          -- resmi arşivden geldiyse
  source_provider text,                                -- 'google_drive' | 'upload' | 'url'
  source_ref      text,                                -- Drive file_id, yükleme id'si...
  status          text NOT NULL DEFAULT 'published'
                  CHECK (status IN ('pending','approved','rejected','published')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Üretilmiş sürümler (480/1280/2560 px × webp/jpg)
CREATE TABLE media_variant (
  media_id  uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  format    text NOT NULL CHECK (format IN ('webp','jpg','avif')),
  width     int  NOT NULL,
  height    int  NOT NULL,
  bytes     int  NOT NULL,
  key       text NOT NULL UNIQUE,                      -- public bucket'taki yol
  PRIMARY KEY (media_id, format, width)
);

-- Görselin bir eserdeki kullanımı: açıklama, alt metin, sıra, kapak
CREATE TABLE asset_media (
  asset_id          text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  media_key         text NOT NULL,                     -- JSON'daki 'm01' / 'a01'
  media_id          uuid NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  sort_order        smallint NOT NULL DEFAULT 0,
  is_cover          boolean NOT NULL DEFAULT false,
  subject           text,                              -- exterior, portal, minber...
  focal_x           real CHECK (focal_x BETWEEN 0 AND 1),
  focal_y           real CHECK (focal_y BETWEEN 0 AND 1),
  caption_tr        text NOT NULL,
  caption_en        text,
  alt_tr            text NOT NULL,                     -- erişilebilirlik: boş geçilemez
  alt_en            text,
  archive_year      smallint,                          -- yalnız archive_photo
  archive_year_approx boolean,
  overlay_opacity   real CHECK (overlay_opacity BETWEEN 0.1 AND 0.8),
  overlay_aspect    text,                              -- '4:3'
  shooting_hint_tr  text,
  shooting_hint_en  text,
  PRIMARY KEY (asset_id, media_key),
  UNIQUE (asset_id, media_id)
);
CREATE UNIQUE INDEX one_cover_per_asset ON asset_media (asset_id) WHERE is_cover;

-- Kitabeler (Taşın Dili / AR). AR işaretçisi olarak kullanılacak görsel asset_media'ya bağlanır.
CREATE TABLE inscription (
  asset_id            text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  slug                text NOT NULL,
  sort_order          smallint NOT NULL,
  location_tr         text NOT NULL,
  location_en         text,
  language            text NOT NULL CHECK (language IN ('ar','fa','tr-ottoman','tr','el','la','hy','other')),
  script              text,                            -- 'celi sülüs', 'talik'...
  transliteration     text,
  translation_tr      text,
  translation_en      text,
  author              text,
  hijri_year          smallint,
  gregorian           text,
  note_tr             text,
  note_en             text,
  ar_target_media_key text,
  PRIMARY KEY (asset_id, slug),
  FOREIGN KEY (asset_id, ar_target_media_key) REFERENCES asset_media(asset_id, media_key)
);

-- ─────────────────────────────── Topluluk katkısı ve moderasyon
CREATE TABLE contribution (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,                        -- kullanıcı tablosu backend'e ait (FK eklenir)
  kind           text NOT NULL CHECK (kind IN ('photo','memory','tip','correction')),
  media_id       uuid REFERENCES media(id),            -- kind = photo ise
  body           text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  reject_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'photo' OR media_id IS NOT NULL),
  CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX contribution_queue_idx ON contribution (created_at) WHERE status = 'pending';

-- ─────────────────────────────── Değişiklik geçmişi (admin panelde her kayıt)
CREATE TABLE asset_revision (
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  version     int  NOT NULL,
  data        jsonb NOT NULL,                          -- o anki tam kayıt (JSON formatında)
  changed_by  text NOT NULL,                           -- 'import' ya da admin kullanıcı
  changed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, version)
);
```

---

## 6. JSON → tablo eşlemesi

| JSON | Tablo / sütun |
|---|---|
| `enums.json` → `regions`, `cities`, `asset_types`, `eras`, `relation_types`, `timeline_event_types` | aynı adlı lookup tabloları (`code`, `label.tr` → `label_tr`…) |
| `sources.json` → `sources[]` | `source` (tanımsız alanlar `extra` jsonb'ye) |
| `id`, `meta.status`, `type`, `era`, `parent_id`, `tags`, `secondary_types` | `asset.id`, `status`, `type_code`, `era_code`, `parent_id`, `tags`, `secondary_types` |
| `name`, `subtitle`, `summary` | `asset.name_tr/en`, `subtitle_tr/en`, `summary_tr/en` |
| `alternate_names` | `asset.alternate_names` (jsonb, olduğu gibi) |
| `location.*` (region hariç; city üzerinden bulunur) | `asset.city_code`, `district`, `neighborhood`, `address`, `lat`, `lng`, `coord_source`, `coord_verified` |
| `dating.*` | `asset.dating_display_tr/en`, `start_year`, `end_year`, `hijri_year`, `century`, `dating_basis_tr/en`, `dating_confidence` |
| `founder.*`, `architect.*`, `waqf.*` | `asset.founder_*`, `architect_*` (`candidates` → jsonb), `waqf_*` |
| `visit.*` (tips hariç) | `asset.visit_*`, `entrance_fee` |
| `visit.visitor_tips[]` | `visitor_tip` |
| `accessibility.*` | `asset.a11y_*`, `audio_description_tr/en` |
| `ambient_sound.*` | `asset.ambient_sound_key`, `ambient_caption_tr/en` |
| `media_folder`, `meta.todos`, `meta.data_quality_notes`, `meta.prepared_by`, `meta.reviewed_by` | aynı adlı `asset` sütunları |
| `sections[]` | `asset_section` (`id` → `slug`, `order` → `sort_order`) |
| `legends[]` | `asset_legend` (dizideki sıra → `sort_order`) |
| `facts[]` | `asset_fact` (`value` → `value`; sayıysa `value_num`'a da yaz) |
| `people[]` | `asset_person` |
| `inscriptions[]` | `inscription` (`date.hijri_year`, `date.gregorian` düzleşir; `ar_target_media_id` → `ar_target_media_key`) |
| `timeline[]` | `timeline_event` (`type` → `type_code`) |
| `highlights[]` | `asset_highlight` (`section_id` → `section_slug`) |
| `relations[]` | `asset_relation` (`type` → `type_code`) |
| `exhibitions[]` | `exhibition` |
| `media[]`, `archive_media[]` + manifest | `media`, `media_variant`, `asset_media` (Bölüm 8) |
| her nesnedeki `source_refs[]` | `source_citation` (entity/entity_key kuralları DDL'deki yorumda) |
| dosyanın tamamı | `asset.source_json` |

---

## 7. İçe aktarma (import)

Sıra önemlidir; her adım bir öncekine bağlıdır:

```
1. enums.json   → lookup tabloları     (upsert: code)
2. sources.json → source               (upsert: id)
3. build/media-manifest.json okunur    (görseller önceden işlenmiş ve depolamaya yüklenmiş olmalı)
4. Tüm eser JSON'ları TEK transaction içinde:
     her eser için:
       a. asset           upsert (id)  -- parent_id FK'si DEFERRABLE, külliye aynı transaction'da sonra gelebilir
       b. alt tablolar    o esere ait satırlar silinir, yeniden eklenir (asset_section, asset_legend,
                          asset_fact, asset_person, timeline_event, asset_highlight, asset_relation,
                          visitor_tip, exhibition, source_citation, inscription, asset_media)
       c. media           upsert (sha256), media_variant upsert (media_id, format, width)
       d. asset_media     ekle; ardından inscription (AR görseline FK'si olduğu için)
       e. asset_revision  yeni version (changed_by = 'import')
   COMMIT
```

Notlar:
- **Idempotent olmalı.** Aynı dosyalar iki kez içe aktarılınca sonuç değişmemeli. Bu yüzden alt tablolarda "sil, yeniden ekle", ana tablolarda upsert kullanılır.
- **Eksik ilişki hedefi hata değildir.** `relations[].target_id` henüz veri setinde olmayan bir eseri gösterebilir (ör. `manisa-ulucami`). Satır yine eklenir; `asset_relation_live` görünümü onu hedef eklenip yayına alınana kadar gizler. Sis Açma'da "henüz keşfedilmemiş bağ" olarak da gösterilebilir.
- **İlişkiler tek yönlü yazılır** (A → B). "B'nin bağları" sorgusu `source_asset_id = B OR target_asset_id = B` ile yapılır; veri ekibi aynı bağı iki dosyaya yazmaz.
- **İçe aktarmadan sonra hangi taraf esas?** Hackathon boyunca JSON dosyaları esastır ve DB her içe aktarmada yeniden kurulur. Admin panel canlıya alınınca **DB esas olur**. Admin panelde yapılan her değişiklik `asset_revision`'a yazılır ve `GET /admin/assets/{id}/export` aynı JSON formatını geri üretir. Böylece veri seti her zaman dışa aktarılabilir ve yedeklenebilir kalır.
- Kayıtları içe aktarırken `validate.py` hatası olan dosya varsa import durmalıdır (veri ekibi bunu önceden çalıştırır).

**Referans uygulama:** [tools/import_to_db.py](tools/import_to_db.py) yukarıdaki algoritmayı uygular (Python + psycopg). Backend başka bir dilde yazılsa da sırası, upsert anahtarları ve silme sırası örnek alınabilir. Satırları kendisi kurmaz, [tools/db_rows.py](tools/db_rows.py)'den alır. Bu modül JSON → tablo eşlemesinin tek kaynağıdır ve görüntüleyici de aynı modülü kullanır.

`--verify` seçeneği içe aktarmadan sonra iki şeyi kontrol eder:
- DB'deki her tablonun sütunları `db_rows.TABLES` ile aynı mı? (Şemaya sütun eklenip eşleme unutulursa yakalar.)
- Her eserin DB'deki satırları `db_rows` çıktısıyla birebir aynı mı? (Görüntüleyicide görünen = DB'de olan.)

PostgreSQL 16'da test edildi: iki kez üst üste içe aktarma aynı sonucu verdi. Elle değiştirilmiş bir metin, silinmiş bir satır ve fazladan eklenmiş bir sütun `--verify` ile yakalandı.

**DDL değişirse:** `db_rows.py` içindeki `TABLES` ve ilgili eşleme de güncellenmelidir; `--verify` aksi halde hata verir.

---

## 8. Görseller: depolama, işleme, sunum

### İlkeler

1. **Veritabanında dosya tutulmaz.** Görselin kendisi (BLOB/base64) DB'ye girmez. Dosyalar nesne depolamasında (S3 uyumlu) durur; DB yalnızca **depolama anahtarını ve metadata'yı** tutar.
2. **DB'de tam URL değil, anahtar (key) tutulur.** Örnek: `assets/bursa-osmangazi-ulucami/m02-e06842fd8d/1280.webp`. Tam adres, yapılandırmadaki `MEDIA_BASE_URL` ile çalışma anında birleştirilir. CDN ya da sağlayıcı değişirse DB'de hiçbir şey değişmez.
3. **Orijinal dosya korunur, kullanıcıya hiç gönderilmez.** Envanter fotoğrafları 4-22 MB ve 50 MP'ye kadar büyüklükte. Orijinaller **özel (private)** bir alanda durur; uygulamaya yalnızca küçültülmüş sürümler gider.
4. **Her görselin birden çok sürümü vardır.** 480 / 1280 / 2560 px genişlikte, WebP ve JPEG olarak. Telefon küçük sürümü, tablet ve masaüstü büyüğünü indirir.
5. **Dosya yolu içerik özetini içerir, bu yüzden önbellek kalıcıdır.** Yoldaki `e06842fd8d`, dosyanın sha256 özetinin başıdır. Fotoğraf değişirse yol da değişir. Bu sayede CDN'de `Cache-Control: public, max-age=31536000, immutable` güvenle kullanılır.
6. **Yayınlanan dosyalarda metadata yoktur.** EXIF (GPS, kamera) üretilen sürümlerden silinir. Envanter fotoğraflarının bir kısmında GPS kayıtlı (Ulucami'de 10 fotoğrafın 3'ünde). Kullanıcı yüklemelerinde bu silme işlemi **KVKK açısından zorunludur**.
7. **Google Drive'a doğrudan bağlanılmaz.** Drive bir kaynak arşividir, CDN değildir; kota ve izin sorunları demoyu çökertebilir.
8. **`alt` ve `credit` olmadan görsel yayına çıkmaz.**

### Depolama düzeni

```
kok-kod-media-private                     ← herkese kapalı
  originals/<sha256>.jpg                   orijinal dosya
  uploads/pending/<uuid>                   kullanıcı yüklemeleri (onay bekleyen)

kok-kod-media-public  (+ CDN)             ← herkese açık, salt okunur
  assets/<eser-id>/<media-key>-<sha10>/480.webp
                                      /480.jpg
                                      /1280.webp
                                      /1280.jpg
                                      /2560.webp
                                      /2560.jpg
```

**Önerilen sağlayıcılar:**
- **Cloudflare R2:** S3 uyumlu, çıkış trafiği (egress) ücretsiz, CDN'i hazır, ücretsiz kotası hackathon için yeterli.
- Alternatifler: Supabase Storage, AWS S3 + CloudFront.
- **Yerel geliştirme:** Docker'da MinIO.

Kod S3 API'siyle yazılırsa sağlayıcı değiştirmek yalnızca yapılandırma değişikliği olur.

### İşleme (pipeline) ve manifest

Veri tarafı resmi fotoğrafları `tools/media_pipeline.py` ile hazırlar. Betik her görsel için şunları yapar:
1. Orijinali Drive'dan indirir.
2. sha256 hesaplar.
3. EXIF yönünü uygular.
4. Sürümleri üretir ve metadata'yı siler.
5. LQIP ve baskın rengi hesaplar.
6. `build/media/` altına depolama düzeniyle aynı yapıda yazar ve `build/media-manifest.json`'u günceller.

Değişmeyen görselleri atlar. Ulucami'nin 10 fotoğrafı (toplam 133 MB orijinal) 27 MB'lık sürüme indi.

Manifest kaydı (`manifest[asset_id][media_key]`):

```json
{
  "sha256": "e06842fd8d41f29a0196b65e0fb48364be34e514a227ce1f05f961a101123a9c",
  "source": { "provider": "google_drive", "file_id": "10v5RWXGE2DmVvROgtvgvNSPLcaijJqZw", "original_name": "DJI_20241027172515_0203_D_ODAK.jpeg" },
  "original": { "key": "originals/e06842fd….jpg", "format": "jpeg", "width": 5023, "height": 9357, "bytes": 10445667 },
  "aspect_ratio": 0.5368,
  "variants": [
    { "key": "assets/bursa-osmangazi-ulucami/m02-e06842fd8d/480.webp", "format": "webp", "width": 480, "height": 894, "bytes": 79128 },
    { "key": "assets/bursa-osmangazi-ulucami/m02-e06842fd8d/480.jpg",  "format": "jpg",  "width": 480, "height": 894, "bytes": 102600 }
  ],
  "lqip": "data:image/webp;base64,UklGRg4BAABXRUJQ…",
  "dominant_color": "#9a9b97",
  "exif": { "captured_at": "2024-10-27T17:25:15", "gps": { "lat": 40.184286, "lng": 29.0618 }, "camera": "Hasselblad L2D-20c" },
  "pipeline_version": 2,
  "processed_at": "2026-10-14T11:42:52+00:00"
}
```

Depolamaya yükleme:
- Sürümler: `rclone sync data/build/media r2:kok-kod-media-public`
- Orijinaller: `build/cache/originals/<drive-id>` dosyaları `originals/<sha256>.<ext>` adıyla private bucket'a yüklenir.

**Git'e ne girer?**
- **Girer:** `build/media-manifest.json`. Küçük bir metin dosyasıdır (görsel başına ~1 KB) ve hangi görselin hangi yolda, hangi boyutta olduğunun kaydıdır. Backend içe aktarmayı bununla yapar.
- **Girmez:** `build/media/` (sürümler) ve `build/cache/` (orijinaller). Bunlar büyüktür (Ulucami tek başına 133 MB orijinal + 27 MB sürüm) ve yeniden üretilebilir.

Repoyu yeni çeken biri `media_pipeline.py` çalıştırınca, manifestte kayıtlı görseller Drive'dan indirilip **manifestteki yollarla aynı adlarla** yeniden üretilir; manifest değişmez. Bu senaryo test edildi: dosyalar birebir aynı üretildi. Depolama (R2) kurulduktan sonra görseller oradan da çekilebilir: `rclone sync r2:kok-kod-media-public data/build/media`.

Yeni ya da değişen bir fotoğraf olursa manifest güncellenir ve **veri ekibi commit eder**.

İçe aktarmada JSON'daki `media[]` kaydı (açıklama, alt metin, telif, kapak) ile manifest kaydı (hash, boyut, sürümler) **`(asset_id, media_key)` üzerinden birleştirilir**:
- `media`: sha256 üzerinden upsert. `width`, `height`, `aspect_ratio`, `lqip`, `dominant_color`, `original_*` manifestten gelir; `captured_at`, `capture_lat` ve `capture_lng` manifestin `exif` alanından gelir. `credit`, `license`, `photographer` ve `source_id` JSON'dan gelir.
- `media_variant`: manifestteki `variants[]` listesi.
- `asset_media`: JSON'daki `id`, `order`, `is_cover`, `subject`, `focal_point`, `caption`, `alt`; arşiv fotoğrafıysa `year`, `year_approx`, `overlay`.

### Admin panelden yükleme ve topluluk katkısı

Admin panelden ya da kullanıcıdan gelen yüklemeler aynı işlemden geçer; pipeline'ın sunucu tarafındaki karşılığı bir arka plan işidir (Node'da `sharp`, Python'da Pillow).

1. İstemci, backend'den **tek kullanımlık ve süreli bir yükleme URL'i** (presigned PUT, 5 dk) ister. Dosya `uploads/pending/<uuid>` yoluna doğrudan yüklenir; API sunucusundan geçmez.
2. Backend dosyayı doğrular:
   - Tür, dosya uzantısına göre değil **ilk baytlarına** (magic bytes) bakılarak belirlenir. Yalnızca JPEG, PNG, WebP ve HEIC kabul edilir.
   - Boyut ≤ 15 MB, çözünürlük ≤ 50 MP.
3. Dosya arka plan işinde **yeniden kodlanır**: EXIF ve GPS silinir, sürümler üretilir, `media.status = 'pending'` olur ve bir `contribution` kaydı açılır.
4. Moderatör onaylamadan dosya public bucket'a taşınmaz ve API'de görünmez. Onaylanınca `contribution.status = 'approved'`, `media.status = 'published'` olur ve `credit` alanına "Kullanıcı katkısı: <takma ad>" yazılır.
5. Reddedilen dosyalar 30 gün sonra silinir.

### Sunum (istemci tarafı)

- Görsel inmeden önce kutu `aspectRatio` ile çizilir ve `dominantColor` ile boyanır; ardından `lqip` bulanık önizleme gösterilir. Böylece sayfa yüklenirken kaymaz.
- Web'de `<picture>` + `srcset`, React Native'de `expo-image` (`placeholder={{ uri: lqip }}`, `contentPosition` = odak noktası) kullanılır.
- Kartlarda kırpma `focalPoint` etrafında yapılır. Uzun dikey fotoğraflarda kapının ya da minarenin kesilmesini bu önler.

---

## 9. API önerisi

| Uç nokta | Ne döner |
|---|---|
| `GET /assets?city=bursa&type=cami&era=&q=&bbox=minLng,minLat,maxLng,maxLat&lang=tr` | Liste ve harita: id, ad, tür, konum, kapak görseli, özet |
| `GET /assets/{id}?lang=tr` | Detay: bölümler, bilgiler, zaman çizelgesi, rivayetler, kitabeler, kişiler, görseller, kaynaklar |
| `GET /assets/{id}/relations` | Yayındaki bağlar (iki yönlü) + yayında olmayan bağların sayısı |
| `GET /assets/{id}/nearby?radius=1000` | Yakındaki eserler (rota planlayıcı) |
| `GET /meta/enums?lang=tr` | Filtre seçenekleri: iller, türler, dönemler, ilişki türleri |
| `POST /assets/{id}/contributions` | Topluluk katkısı (oturum gerekli) |
| `GET /admin/contributions?status=pending` | Moderasyon kuyruğu |
| `PUT /admin/assets/{id}` / `GET /admin/assets/{id}/export` | Düzenleme / JSON formatında dışa aktarma |

Detay yanıtı örneği (kısaltılmış, `lang=tr`):

```json
{
  "id": "bursa-osmangazi-ulucami",
  "name": "Ulucami",
  "type": { "code": "cami", "label": "Cami" },
  "city": { "code": "bursa", "label": "Bursa" },
  "location": { "lat": 40.18417, "lng": 29.06167, "district": "Osmangazi", "address": "Atatürk Caddesi, Cami Sokak" },
  "dating": { "display": "H. 802 / M. 1399-1400", "confidence": { "code": "certain", "label": "Kaynakta kesin" } },
  "architect": { "name": null, "candidates": ["Ali Neccâr", "Hacı İvaz Paşa", "..."], "confidence": { "code": "disputed", "label": "Tartışmalı" } },
  "sections": [
    {
      "id": "minber",
      "title": "Kündekâri Minber",
      "body": "Minber, çivi, tutkal ya da...",
      "confidence": { "code": "certain", "label": "Kaynakta kesin" },
      "sources": [{ "title": "Bursa Vakıf Eserleri – I. Cilt", "pages": "52-55", "url": "https://..." }]
    }
  ],
  "legends": [{ "id": "vav-harfi", "title": "...", "body": "...", "verdict": "folk_belief" }],
  "media": [
    {
      "key": "m02",
      "kind": "photo",
      "isCover": false,
      "width": 5023, "height": 9357, "aspectRatio": 0.5368,
      "dominantColor": "#9a9b97",
      "lqip": "data:image/webp;base64,UklGRg4BAABXRUJQ…",
      "focalPoint": { "x": 0.5, "y": 0.5 },
      "caption": "Mermer taç kapı",
      "alt": "Beyaz mermerden yüksek bir taç kapı; sivri kemerli nişin üst kısmı mukarnaslı, altta yeşil boyalı ahşap kapı.",
      "credit": "Vakıf Katılım – Vakıf Eserleri Envanteri",
      "sources": {
        "webp": [
          { "url": "https://media.<alan-adı>/assets/bursa-osmangazi-ulucami/m02-e06842fd8d/480.webp",  "width": 480 },
          { "url": "https://media.<alan-adı>/assets/bursa-osmangazi-ulucami/m02-e06842fd8d/1280.webp", "width": 1280 },
          { "url": "https://media.<alan-adı>/assets/bursa-osmangazi-ulucami/m02-e06842fd8d/2560.webp", "width": 2560 }
        ],
        "jpg": ["..."]
      }
    }
  ],
  "accessibility": { "wheelchair": "unknown", "verified": false, "audioDescription": "Ulucami, Uludağ'ın eteğinde..." },
  "ambientSound": { "url": "https://media.<alan-adı>/sounds/cami-sadirvan.mp3", "caption": "[Şadırvandan akan su sesi, ...]" }
}
```

- Dil `?lang=` parametresine, yoksa `Accept-Language` başlığına göre seçilir. İstenen dil boşsa TR döner.
- Güven etiketleri (`label`) `enums.json`'daki `confidence` listesinden gelir.
- `capture_lat` ve `capture_lng` hiçbir yanıtta yer almaz.

---

## 10. Genişletme: yeni il, tür, dil

| İhtiyaç | Yapılacak | Kod değişikliği |
|---|---|---|
| Yeni il (ör. İzmir) | `enums.json`'a satır ekle → lookup tablosuna seed | Yok |
| Yeni eser türü (ör. "kütüphane") | `enums.json`'a satır ekle | Yok |
| Yeni eser | `eserler/<il>/<ilçe>/<id>.json` ekle → import | Yok |
| Yeni kaynak (kitap, makale) | `sources.json`'a ekle | Yok |
| Yeni ilişki türü (ör. "aynı hattat") | `enums.json` → `relation_types` | Yok |
| Üçüncü dil (ör. Arapça) | `_ar` sütunları eklenir **ya da** metinler `*_i18n jsonb` sütunlarına taşınır (`{"tr": ..., "en": ..., "ar": ...}`) | Migration |

---

## 11. Veri ekibi için: yeni eser ekleme

> Kitap bölüklerinden yapay zekâ destekli taslak üretmek için: [`tools/extract/README.md`](tools/extract/README.md). Aşağıdaki kurallar taslakların kontrolünde de geçerlidir. Taslaklar (`meta.status = "draft"`) içe aktarılmaz. Koordinat ve fotoğraf her durumda isteğe bağlıdır: koordinatı olmayan eser haritada ve yakındaki eserlerde görünmez, fotoğrafı olmayan eser yer tutucu görselle gösterilir. `validate.py` eksikleri uyarı olarak raporlar.

Kurallar:
1. Her metin bir kaynağa (`source_refs`) bağlanır. Sayfa numarası kitabın **basılı** sayfa numarasıdır.
2. Kaynak "tahmin edilmektedir" diyorsa `probable`, birden çok görüş veriyorsa `disputed` yazılır. Rivayetler `legends[]`'e gider.
3. Bilinmeyen değer `null` ya da `"unknown"` olur ve `meta.todos`'a yazılır. Ekip tahmini `team_estimate` olarak işaretlenir.
4. Kaynaktaki hata düzeltilmez, `meta.data_quality_notes`'a not edilir.
5. `alt` metni fotoğrafa **bakılarak** yazılır: görüntüde ne olduğunu anlatır, yorum yapmaz. `caption` ise kısa bilgi verir.
6. Id: `<il>-<ilçe>-<ad>`, küçük harf, Türkçe karakter yok. Dosya adı id ile aynıdır ve id bir kez verildikten sonra değişmez.

Adımlar:
1. Ulucami dosyasını kopyalayın ve yeni id ile adlandırın.
2. Kitaptaki bölümü okuyun ve doldurun: paragraflar `sections`, sayılar `facts`, tarihler `timeline`, kitabeler `inscriptions`, diğer eserlere atıflar `relations`.
3. Fotoğrafları Drive'daki `<Cilt> / <Bölüm> Klasörü / <Eser> Klasörü / Links` yolundan seçin ve `media[]`'ya ekleyin.
4. Kontrol edin ve görselleri işleyin:
   ```bash
   pip install jsonschema pillow certifi
   python3 data/tools/validate.py                  # ✗ varsa düzeltin; uyarılar engel değil
   python3 data/tools/media_pipeline.py <id>       # EXIF'te GPS varsa koordinatı onunla doğrulayın
   python3 data/tools/build_viewer.py               # görüntüleyicide kontrol edin
   ```
5. Manifesti (`build/media-manifest.json`) eser JSON'uyla birlikte commit edin.
6. `meta.status = "in_review"` yapın. İkinci kişi kontrol edince `reviewed_by` doldurulur ve durum `published` olur.

---

## 12. Veri görüntüleyici

`data/viewer/index.html`: elimizdeki verinin tamamını tarayıcıda gösteren statik site (HTML + CSS + JS; sunucu gerekmez, dosyayı açmak yeterli).

```bash
python3 data/tools/build_viewer.py && open data/viewer/index.html
```

Sayfalar:
- **Genel bakış:** eser, il, ilçe, görsel ve satır sayıları; şehir kartları; tablo başına satır sayısı.
- **Ortak tablolar:** lookup tabloları ve `source`.
- **Eser sayfası:** görsel galerisi (büyütünce alt metin, telif, boyut ve kaynak görünür) ve esere ait **17 tablonun tamamı**, DB'deki sütun sırasıyla. Boş tablolar da sütunlarıyla gösterilir.

Kenar çubuğunda şehir → ilçe → eser ağacı ve arama vardır.

Gösterim kuralları:
- `NULL` ayrıca belirtilir.
- DB'nin ürettiği değerler (identity id, uuid, `now()`) **"DB üretir"** olarak gösterilir.
- `media.id` DB'de uuid'dir; görüntüleyicide `media:<hash'in ilk 10 hanesi>` olarak gösterilir. `asset_media.media_id` ve `media_variant.media_id` alanlarında aynı etiket kullanılır, böylece bağ izlenebilir.
- `jsonb` alanlar açılır kapanır blok olarak gösterilir.

Satırlar `db_rows.py`'den geldiği için görüntüleyicide görünen ile `import_to_db.py`'nin DB'ye yazdığı **aynıdır**. `--verify` bunu gerçek DB'de kontrol eder.

Görseller önce `build/media/`'dan yüklenir. Dosyalar yoksa (pipeline çalıştırılmamışsa) Drive önizlemesi, o da olmazsa LQIP bulanık önizleme gösterilir.

`viewer/data.js` üretilmiş bir dosyadır ve git'e girmez.

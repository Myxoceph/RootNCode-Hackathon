-- Switch to the dataset model defined by the data team (data/README.md, section 5).
--
-- The DDL below is copied verbatim from data/README.md so that table and column
-- names, column order and constraints match data/tools/db_rows.py exactly;
-- `data/tools/import_to_db.py --verify` checks this on every CI run.
-- Constructs Prisma cannot express (domains, the asset_relation_live view, partial
-- and expression indexes, the DEFERRABLE parent FK, ON DELETE SET NULL (col))
-- live only here. When generating future migrations, review any DROP statements
-- Prisma proposes for them.

-- ─────────────────────────────── Remove the initial monuments model
DROP TABLE IF EXISTS "visitor_tips", "monument_relations", "inscriptions", "city_cuisines", "monuments" CASCADE;
DROP TYPE IF EXISTS "monument_type", "relation_type", "tip_status";

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
  lat              double precision NOT NULL CHECK (lat BETWEEN 35.5 AND 42.5),
  lng              double precision NOT NULL CHECK (lng BETWEEN 25.5 AND 45.0),
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

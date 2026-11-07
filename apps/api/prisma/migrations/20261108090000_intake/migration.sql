-- Veri Döngüsü (docs/plans/veri-dongusu.md): gelen veri onaydan geçene kadar burada bekler.
-- Yalnızca yeni tablolar; var olan tablolara dokunulmaz. Python worker (data/pipeline) aynı tablolara yazar;
-- jsonb sütunlarının biçimi packages/contracts/src/intake.schema.ts (JSON Schema: data/pipeline/contracts/).

-- Bir kitap PDF'i: worker onu böler, kitap haritasını bir kişi onaylar, sonra eser başına taslak yazılır.
CREATE TABLE intake_job (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf')),
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'mapping', 'needs_map', 'map_confirmed', 'drafting', 'done', 'failed')),
  title             text NOT NULL,
  city              text NOT NULL,
  source_id         text,
  -- data/build/cache/intake/<id>/source.pdf; git'e girmez.
  file_path         text NOT NULL,
  layout            jsonb,
  book_map          jsonb,
  map_confirmed_at  timestamptz,
  map_confirmed_by  uuid REFERENCES app_user (id) ON DELETE SET NULL,
  progress_done     integer NOT NULL DEFAULT 0 CHECK (progress_done >= 0),
  progress_total    integer NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
  error             text,
  created_by        uuid REFERENCES app_user (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- Worker sıradaki işi böyle bulur (FOR UPDATE SKIP LOCKED).
CREATE INDEX intake_job_status_idx ON intake_job (status, created_at);

-- Onay kuyruğunun bir öğesi: kitaptan bir eser, ziyaretçinin kitabesi ya da (sonra) sahadan bir eser.
CREATE TABLE intake_draft (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('book_asset', 'inscription', 'field_asset')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  job_id        uuid REFERENCES intake_job (id) ON DELETE CASCADE,
  asset_id      text NOT NULL CHECK (asset_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Kitap haritasındaki satırı; worker yeniden çalışınca aynı taslağı bulur.
  entry_key     text,
  record        jsonb NOT NULL DEFAULT '{}'::jsonb,
  media         jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs   jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation    jsonb NOT NULL DEFAULT '{"errors": [], "warnings": []}'::jsonb,
  ai            jsonb,
  duplicate_of  text,
  note          text,
  created_by    uuid REFERENCES app_user (id) ON DELETE SET NULL,
  reviewed_by   uuid REFERENCES app_user (id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Kitap taslağı işine bağlıdır; ziyaretçinin kitabesi değildir.
  CHECK ((kind = 'book_asset') = (job_id IS NOT NULL)),
  -- Onaylanan ya da reddedilen taslağın kimin, ne zaman karar verdiği bellidir.
  CHECK ((status = 'pending') = (reviewed_at IS NULL))
);
CREATE INDEX intake_draft_queue_idx ON intake_draft (status, kind, created_at);
CREATE INDEX intake_draft_asset_idx ON intake_draft (asset_id);
-- Bir kitap satırının tek taslağı olur: worker yeniden çalışınca üzerine yazar, çoğaltmaz.
CREATE UNIQUE INDEX intake_draft_entry_idx ON intake_draft (job_id, entry_key) WHERE job_id IS NOT NULL;

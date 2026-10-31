-- Sesli Zaman Kapsülü (modül 7): ortam sesi kayıtları (data/sounds.json).
-- Anahtar, eserlerin ambient_sound_key'i ya da eser türünün ambient_sound'udur; dosya medya
-- bucket'ında file_key yolundadır. source ve city_dish gibi ortak bir tablo olarak içe aktarılır.
CREATE TABLE sound (
  key              text PRIMARY KEY CHECK (key ~ '^[a-z]+(-[a-z]+)*$'),
  sort_order       smallint NOT NULL,
  title_tr         text NOT NULL,
  title_en         text,
  file_key         text NOT NULL,
  duration_seconds real NOT NULL CHECK (duration_seconds > 0),
  captions         jsonb NOT NULL DEFAULT '[]',
  license          text NOT NULL CHECK (license IN ('CC0-1.0','CC-BY-4.0')),
  author           text,
  source_url       text NOT NULL,
  status           text NOT NULL CHECK (status IN ('draft','in_review','published')),
  CHECK (license <> 'CC-BY-4.0' OR author IS NOT NULL)
);

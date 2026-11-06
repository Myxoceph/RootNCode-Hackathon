-- Fotoğrafın eserin dosyasındaki yeri: altına geleceği blok (identity, timeline…), Tarihçe'deki konu
-- (section:<id>) ya da eklenen bölüm (custom:<id>). Boşsa fotoğraf dosyaya kendiliğinden dağıtılır.
ALTER TABLE asset_media
  ADD COLUMN dossier_after text CHECK (char_length(dossier_after) BETWEEN 1 AND 120);

-- Ziyaretçi fotoğraf önerileri: fotoğraf bir katkıdır (kind = 'photo', body = açıklama), dosyası
-- photo_upload'da durur. Onaylanan fotoğraflar eserin galerisine (asset_media) yazılmaz: içe aktarma
-- her eserin asset_media satırlarını yeniden kurar ve onları silerdi; ayrı bir uçtan listelenir.

-- Eski şart (fotoğraf katkısı media'ya bağlı olmalı) R2 hattı içindi; fotoğraf artık photo_upload'da.
ALTER TABLE contribution DROP CONSTRAINT contribution_check;

CREATE TABLE photo_upload (
  contribution_id  uuid PRIMARY KEY REFERENCES contribution(id) ON DELETE CASCADE,
  content_type     text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  bytes            bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 5242880),  -- en çok 5 MB, meta verisi silinmiş
  width            integer NOT NULL CHECK (width > 0),
  height           integer NOT NULL CHECK (height > 0),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz NOT NULL DEFAULT now()
);

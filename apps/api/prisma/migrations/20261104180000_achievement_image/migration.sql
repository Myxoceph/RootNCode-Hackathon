-- Başarım rozetinin görseli: admin panelinden yüklenir, uygulamada emoji yerine daire içinde çizilir.
-- Başarım başına bir görsel; yenisi eskisinin yerine yazılır. Meta verisi silinmiş olarak durur ve herkese açıktır.
CREATE TABLE achievement_image (
  achievement_code text PRIMARY KEY REFERENCES achievement(code) ON DELETE CASCADE ON UPDATE CASCADE,
  content_type     text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  bytes            bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),  -- en çok 2 MB
  width            integer NOT NULL CHECK (width > 0),
  height           integer NOT NULL CHECK (height > 0),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

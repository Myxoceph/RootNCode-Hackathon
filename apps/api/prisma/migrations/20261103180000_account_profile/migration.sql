-- Hesap profili: kayıtta e-posta (zorunlu; bu migration'dan önce açılan hesaplarda boş kalır),
-- isteğe bağlı ad soyad ve profil fotoğrafı. E-posta küçük harfle saklanır, bir hesaba bir e-posta.
ALTER TABLE app_user
  ADD COLUMN email     text CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  ADD COLUMN full_name text CHECK (char_length(full_name) BETWEEN 2 AND 64);
CREATE UNIQUE INDEX app_user_email_key ON app_user (email);

-- Kullanıcı başına bir profil fotoğrafı; yenisi eskisinin yerine yazılır. Ziyaretçi fotoğrafları gibi
-- meta verisi silinmiş olarak PostgreSQL'de durur ve yalnızca sahibine imzalı adresle gösterilir.
CREATE TABLE user_avatar (
  user_id      uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  bytes        bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),  -- en çok 2 MB
  width        integer NOT NULL CHECK (width > 0),
  height       integer NOT NULL CHECK (height > 0),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Hesaplar: kullanıcı adı + parola ile kayıt ve giriş, cihaz başına oturum, admin rolü.
-- Anonim ziyaretçiler aynen çalışır; hesap açınca katkıları kendilerinde kalır.

-- Oturumlar: bir kullanıcının birden çok cihazda açık oturumu olabilir; çıkış yalnızca o
-- oturumu kapatır. Token'ın kendisi saklanmaz, yalnızca SHA-256 özeti tutulur.
CREATE TABLE user_session (
  token_hash  text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_session_user_idx ON user_session (user_id);

-- Mevcut her kullanıcının token'ı bir oturum olur; uygulamada saklanan token'lar geçerli kalır.
INSERT INTO user_session (token_hash, user_id, created_at)
SELECT token_hash, id, created_at FROM app_user;

ALTER TABLE app_user DROP COLUMN token_hash;

-- Kullanıcı adı küçük harfle saklanır; parola scrypt özetidir (`scrypt$N$r$p$tuz$özet`).
-- İkisi birlikte vardır ya da ikisi de yoktur (anonim ziyaretçi).
ALTER TABLE app_user
  ADD COLUMN username      text UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_.]{2,31}$'),
  ADD COLUMN password_hash text CHECK (password_hash LIKE 'scrypt$%'),
  ADD CONSTRAINT app_user_credentials_check CHECK ((username IS NULL) = (password_hash IS NULL));

-- admin: moderatörün yapabildiklerine ek olarak eser ekler ve rol verir.
ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('visitor', 'moderator', 'admin'));

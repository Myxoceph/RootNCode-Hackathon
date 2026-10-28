-- Ziyaretçi Nabzı (modül 6): katkı gönderen ve moderasyon yapan kullanıcılar.
-- Kullanıcılar anonimdir (yalnızca takma ad); kimlik, API'nin verdiği opak bir token'dır.
-- Token'ın kendisi saklanmaz, yalnızca SHA-256 özeti tutulur.
CREATE TABLE app_user (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    text NOT NULL CHECK (char_length(nickname) BETWEEN 2 AND 32),
  role        text NOT NULL DEFAULT 'visitor' CHECK (role IN ('visitor','moderator')),
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  banned_at   timestamptz
);

-- contribution.user_id / reviewed_by artık app_user'a bağlı. Moderatör silinemez (reviewed_by
-- NULL olursa onaylı kaydın CHECK'i bozulur); ziyaretçi silinirse katkıları da silinir.
ALTER TABLE contribution
  ADD CONSTRAINT contribution_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
  ADD CONSTRAINT contribution_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES app_user(id);

-- Nabız akışı: bir eserin onaylanmış katkıları, yeniden eskiye.
CREATE INDEX contribution_approved_idx ON contribution (asset_id, created_at DESC) WHERE status = 'approved';
-- Kullanıcı başına gönderim sınırı ve "katkılarım" listesi.
CREATE INDEX contribution_user_idx ON contribution (user_id, created_at DESC);

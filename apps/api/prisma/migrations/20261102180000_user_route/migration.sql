-- Rotalarım: kullanıcının kaydettiği rotalar artık hesabında; her cihazda aynı liste, hesaplar birbirinin
-- rotasını görmez. Rota uygulamanın gösterdiği hâliyle JSON olarak saklanır (planlayıcı rotası ya da
-- Rehber'in gezi planı); `key` aynı planı adlandırır, aynı plan ikinci kez kaydedilince öncekinin yerine geçer.
CREATE TABLE user_route (
  user_id   uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id        text NOT NULL CHECK (id ~ '^[a-z0-9-]{1,40}$'),
  key       text NOT NULL CHECK (length(key) BETWEEN 1 AND 300),
  kind      text NOT NULL CHECK (kind IN ('planner', 'trip')),
  route     jsonb NOT NULL,
  saved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT user_route_key_unique UNIQUE (user_id, key)
);
CREATE INDEX user_route_user_time_idx ON user_route (user_id, saved_at DESC);

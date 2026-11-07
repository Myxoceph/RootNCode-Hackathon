-- Ödül kataloğu ve cüzdan. Başarımlardan kazanılan puan, ortak kurumların (Vakıf Katılım, VGM…)
-- verdiği ödüllere harcanır: kurum tek kullanımlık kodları yükler, kullanıcı puanla bir kod alır.
-- Puan parayla alınmaz, paraya çevrilmez; bakiye = kazanılan başarım puanları − harcanan puanlar.

-- Kanıtlanmış ziyaret: konumun yanında eserin telefonda tanınması (Zaman Perdesi, MindAR) ya da
-- ileride sunucuda fotoğraf eşleştirmesi. Bazı ödüller en az N kanıtlanmış ziyaret ister.
ALTER TABLE visit
  ADD COLUMN proven_at     timestamptz,
  ADD COLUMN proof_method  text CHECK (proof_method IN ('device_recognition', 'server_match')),
  ADD CONSTRAINT visit_proof_check CHECK ((proven_at IS NULL) = (proof_method IS NULL));

CREATE TABLE reward (
  code                text PRIMARY KEY CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_tr            text NOT NULL,
  title_en            text,
  description_tr      text NOT NULL,
  description_en      text,
  partner             text NOT NULL,                 -- ödülü veren kurum
  kind                text NOT NULL CHECK (kind IN ('merch', 'museum', 'discount', 'experience')),
  cost_points         integer NOT NULL CHECK (cost_points BETWEEN 1 AND 100000),
  min_proven_visits   integer NOT NULL DEFAULT 0 CHECK (min_proven_visits >= 0),
  sample              boolean NOT NULL DEFAULT false, -- sunum için örnek (gerçek anlaşma yok)
  active              boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 1000,
  created_by          text NOT NULL,                 -- 'seed' ya da admin'in kullanıcı adı
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Kurumun verdiği tek kullanımlık kodlar. Kullanılmışsa redemption'da bir satırı vardır.
CREATE TABLE reward_code (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_code  text NOT NULL REFERENCES reward(code) ON DELETE CASCADE,
  code         text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{4,64}$'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reward_code, code)
);

CREATE TABLE redemption (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reward_code  text NOT NULL REFERENCES reward(code) ON DELETE CASCADE,
  code_id      uuid NOT NULL UNIQUE REFERENCES reward_code(id) ON DELETE CASCADE,
  points       integer NOT NULL CHECK (points > 0),  -- harcanan puan, o günkü bedel
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redemption_user_idx ON redemption (user_id, created_at DESC);

-- Sunum için örnek ödüller ve kodlar (sample = true; gerçek bir anlaşma yok).
INSERT INTO reward (code, title_tr, title_en, description_tr, description_en, partner, kind, cost_points, min_proven_visits, sample, sort_order, created_by) VALUES
  ('vakif-kupa', 'Vagabonds Kupası', 'Vagabonds Mug', 'Vakıf eserleri desenli kupa; Vakıf Katılım şubesinden teslim alınır.', 'A mug with foundation heritage motifs, picked up at a Vakıf Katılım branch.', 'Vakıf Katılım', 'merch', 150, 0, true, 10, 'seed'),
  ('vakif-defter', 'Kitabe Defteri', 'Inscription Notebook', 'Kapağında kitabe hattı olan defter; şubeden teslim alınır.', 'A notebook with calligraphy from an inscription on its cover, picked up at a branch.', 'Vakıf Katılım', 'merch', 120, 0, true, 20, 'seed'),
  ('vakif-sapka', 'Gezgin Şapkası', 'Explorer Cap', 'Vagabonds logolu şapka; şubeden teslim alınır.', 'A Vagabonds cap, picked up at a branch.', 'Vakıf Katılım', 'merch', 200, 1, true, 30, 'seed'),
  ('vakif-tisort', 'Üç Şehir Tişörtü', 'Three Cities T-shirt', 'Bursa, Hatay ve Konya vakıf eserleri baskılı tişört.', 'A T-shirt printed with foundation sites of Bursa, Hatay and Konya.', 'Vakıf Katılım', 'merch', 350, 3, true, 40, 'seed'),
  ('vgm-muze-giris', 'Vakıf Eserleri Müzesi Girişi', 'Foundation Works Museum Entry', 'Vakıflar Genel Müdürlüğü müzesine tek kişilik giriş kodu.', 'A single entry code for a Directorate General of Foundations museum.', 'Vakıflar Genel Müdürlüğü', 'museum', 250, 2, true, 50, 'seed'),
  ('han-kafe-indirim', 'Tarihî Han Kafesinde %20 İndirim', '20% Off at a Historic Inn Café', 'Vakıf hanlarındaki kafelerde bir seferlik %20 indirim.', 'A one-time 20% discount at cafés in foundation inns.', 'Vakıf Katılım', 'discount', 80, 0, true, 60, 'seed');

INSERT INTO reward_code (reward_code, code)
SELECT r.code, 'ORNEK-' || upper(substr(md5(r.code || n::text), 1, 8))
FROM reward r CROSS JOIN generate_series(1, 20) AS n
WHERE r.sample;

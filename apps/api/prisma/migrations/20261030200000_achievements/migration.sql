-- Başarımlar: ziyaretler ve onaylanan katkılar rozet ve puan kazandırır. Her başarım bir kuraldır
-- (achievement.rule, sözleşmedeki AchievementRuleSchema); admin panelden yenisini ekler. Puan parayla
-- alınmaz ve paraya çevrilmez. Liste: docs/achievements.md.

-- Ziyaret: bir eser kullanıcı başına bir kez sayılır (ilk ziyaret). Eserin noktası varsa konum
-- 200 m içinde olmalı (verified); noktası olmayan eserin ziyareti doğrulanmadan kabul edilir.
CREATE TABLE visit (
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  asset_id     text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  visited_at   timestamptz NOT NULL DEFAULT now(),
  verified     boolean NOT NULL,
  distance_m   integer CHECK (distance_m >= 0),
  PRIMARY KEY (user_id, asset_id)
);
CREATE INDEX visit_user_time_idx ON visit (user_id, visited_at);

CREATE TABLE achievement (
  code            text PRIMARY KEY CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_tr        text NOT NULL,
  title_en        text,
  description_tr  text NOT NULL,
  description_en  text,
  badge           text NOT NULL CHECK (char_length(badge) BETWEEN 1 AND 16),
  points          integer NOT NULL CHECK (points BETWEEN 0 AND 1000),
  rule            jsonb NOT NULL CHECK (rule ? 'kind'),
  sort_order      integer NOT NULL DEFAULT 1000,
  active          boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL,                 -- 'seed' ya da admin'in kullanıcı adı
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_achievement (
  user_id           uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  achievement_code  text NOT NULL REFERENCES achievement(code) ON DELETE CASCADE,
  earned_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_code)
);

-- Başlangıç başarımları (docs/achievements.md ile aynı liste).
INSERT INTO achievement (code, title_tr, title_en, description_tr, description_en, badge, points, rule, sort_order, created_by) VALUES
  ('bursa-ilk-adim', 'Bursa''ya Merhaba', 'Hello, Bursa', 'Bursa''da ilk eserini ziyaret et.', 'Visit your first site in Bursa.', '🌱', 10, '{"kind": "visit_count", "count": 1, "city": "bursa"}'::jsonb, 10, 'seed'),
  ('hatay-ilk-adim', 'Hatay''a Merhaba', 'Hello, Hatay', 'Hatay''da ilk eserini ziyaret et.', 'Visit your first site in Hatay.', '🌱', 10, '{"kind": "visit_count", "count": 1, "city": "hatay"}'::jsonb, 20, 'seed'),
  ('konya-ilk-adim', 'Konya''ya Merhaba', 'Hello, Konya', 'Konya''da ilk eserini ziyaret et.', 'Visit your first site in Konya.', '🌱', 10, '{"kind": "visit_count", "count": 1, "city": "konya"}'::jsonb, 30, 'seed'),
  ('osmangazi-gezgini', 'Osmangazi Gezgini', 'Osmangazi Explorer', 'Osmangazi''de 10 eser ziyaret et.', 'Visit 10 sites in Osmangazi.', '🏛️', 30, '{"kind": "visit_count", "count": 10, "city": "bursa", "district": "Osmangazi"}'::jsonb, 40, 'seed'),
  ('yildirim-gezgini', 'Yıldırım Gezgini', 'Yıldırım Explorer', 'Yıldırım''da 5 eser ziyaret et.', 'Visit 5 sites in Yıldırım.', '🏛️', 25, '{"kind": "visit_count", "count": 5, "city": "bursa", "district": "Yıldırım"}'::jsonb, 50, 'seed'),
  ('iznik-gezgini', 'İznik Gezgini', 'İznik Explorer', 'İznik''te 5 eser ziyaret et.', 'Visit 5 sites in İznik.', '🏛️', 25, '{"kind": "visit_count", "count": 5, "city": "bursa", "district": "İznik"}'::jsonb, 60, 'seed'),
  ('antakya-gezgini', 'Antakya Gezgini', 'Antakya Explorer', 'Antakya''da 10 eser ziyaret et.', 'Visit 10 sites in Antakya.', '🏛️', 30, '{"kind": "visit_count", "count": 10, "city": "hatay", "district": "Antakya"}'::jsonb, 70, 'seed'),
  ('meram-gezgini', 'Meram Gezgini', 'Meram Explorer', 'Meram''da 5 eser ziyaret et.', 'Visit 5 sites in Meram.', '🏛️', 25, '{"kind": "visit_count", "count": 5, "city": "konya", "district": "Meram"}'::jsonb, 80, 'seed'),
  ('selcuklu-ilcesi-gezgini', 'Selçuklu (ilçe) Gezgini', 'Selçuklu District Explorer', 'Konya''nın Selçuklu ilçesinde 5 eser ziyaret et.', 'Visit 5 sites in Konya''s Selçuklu district.', '🏛️', 25, '{"kind": "visit_count", "count": 5, "city": "konya", "district": "Selçuklu"}'::jsonb, 90, 'seed'),
  ('karatay-gezgini', 'Karatay Gezgini', 'Karatay Explorer', 'Karatay''da 5 eser ziyaret et.', 'Visit 5 sites in Karatay.', '🏛️', 25, '{"kind": "visit_count", "count": 5, "city": "konya", "district": "Karatay"}'::jsonb, 100, 'seed'),
  ('bursa-ilceleri', 'Bursa''nın Dört Yanı', 'All Around Bursa', 'Bursa''da 3 farklı ilçede eser ziyaret et.', 'Visit sites in 3 districts of Bursa.', '🧭', 40, '{"kind": "districts", "count": 3, "city": "bursa"}'::jsonb, 110, 'seed'),
  ('hatay-ilceleri', 'Hatay''ın Dört Yanı', 'All Around Hatay', 'Hatay''da 3 farklı ilçede eser ziyaret et.', 'Visit sites in 3 districts of Hatay.', '🧭', 40, '{"kind": "districts", "count": 3, "city": "hatay"}'::jsonb, 120, 'seed'),
  ('konya-ilceleri', 'Konya''nın Dört Yanı', 'All Around Konya', 'Konya''da 3 farklı ilçede eser ziyaret et.', 'Visit sites in 3 districts of Konya.', '🧭', 40, '{"kind": "districts", "count": 3, "city": "konya"}'::jsonb, 130, 'seed'),
  ('ilce-avcisi', 'İlçe Avcısı', 'District Hunter', 'Toplam 10 farklı ilçede eser ziyaret et.', 'Visit sites in 10 different districts.', '🗺️', 80, '{"kind": "districts", "count": 10}'::jsonb, 140, 'seed'),
  ('iki-sehir', 'İki Şehir', 'Two Cities', '2 farklı ilde eser ziyaret et.', 'Visit sites in 2 cities.', '🛤️', 50, '{"kind": "cities", "count": 2}'::jsonb, 150, 'seed'),
  ('uc-sehir', 'Üç Şehrin Vakıfları', 'Waqfs of Three Cities', 'Bursa, Hatay ve Konya''nın üçünde de eser ziyaret et.', 'Visit sites in all three cities: Bursa, Hatay and Konya.', '👑', 100, '{"kind": "cities", "count": 3}'::jsonb, 160, 'seed'),
  ('bir-gunde-uc-ilce', 'Bir Günde Üç İlçe', 'Three Districts in a Day', '24 saat içinde 3 farklı ilçede eser ziyaret et.', 'Visit sites in 3 districts within 24 hours.', '⚡', 60, '{"kind": "within", "level": "district", "count": 3, "hours": 24}'::jsonb, 170, 'seed'),
  ('hafta-sonu-rotasi', 'Hafta Sonu Rotası', 'Weekend Route', '3 gün içinde 5 farklı ilçede eser ziyaret et.', 'Visit sites in 5 districts within 3 days.', '⚡', 70, '{"kind": "within", "level": "district", "count": 5, "hours": 72}'::jsonb, 180, 'seed'),
  ('bir-haftada-iki-il', 'Bir Haftada İki İl', 'Two Cities in a Week', '7 gün içinde 2 farklı ilde eser ziyaret et.', 'Visit sites in 2 cities within 7 days.', '🚄', 80, '{"kind": "within", "level": "city", "count": 2, "hours": 168}'::jsonb, 190, 'seed'),
  ('cami-meraklisi', 'Cami Meraklısı', 'Mosque Lover', '10 cami ya da mescit ziyaret et.', 'Visit 10 mosques or masjids.', '🕌', 30, '{"kind": "visit_count", "count": 10, "types": ["cami", "mescit"]}'::jsonb, 200, 'seed'),
  ('hamam-yolu', 'Hamam Yolu', 'Bathhouse Trail', '3 hamam ziyaret et.', 'Visit 3 bathhouses.', '♨️', 20, '{"kind": "visit_count", "count": 3, "types": ["hamam"]}'::jsonb, 210, 'seed'),
  ('kervan-yolu', 'Kervan Yolu', 'Caravan Road', '3 han, kervansaray ya da bedesten ziyaret et.', 'Visit 3 inns, caravanserais or bedestens.', '🐪', 25, '{"kind": "visit_count", "count": 3, "types": ["han", "kervansaray", "bedesten"]}'::jsonb, 220, 'seed'),
  ('turbe-ziyaretcisi', 'Türbe Ziyaretçisi', 'Tomb Visitor', '5 türbe ya da hazire ziyaret et.', 'Visit 5 tombs or graveyards.', '🕯️', 20, '{"kind": "visit_count", "count": 5, "types": ["turbe", "hazire"]}'::jsonb, 230, 'seed'),
  ('ilim-yolu', 'İlim Yolu', 'Path of Learning', '3 medrese, mektep ya da kütüphane ziyaret et.', 'Visit 3 madrasas, schools or libraries.', '📜', 25, '{"kind": "visit_count", "count": 3, "types": ["medrese", "mektep", "kutuphane"]}'::jsonb, 240, 'seed'),
  ('selcuklu-izinde', 'Selçuklu İzinde', 'In Seljuk Footsteps', 'Selçuklu döneminden 5 eser ziyaret et.', 'Visit 5 Seljuk-era sites.', '🦅', 40, '{"kind": "visit_count", "count": 5, "era": "selcuklu"}'::jsonb, 250, 'seed'),
  ('erken-osmanli', 'Beylikten Cihan Devletine', 'From Principality to Empire', 'Erken Osmanlı döneminden 10 eser ziyaret et.', 'Visit 10 early Ottoman sites.', '🌿', 30, '{"kind": "visit_count", "count": 10, "era": "erken-osmanli"}'::jsonb, 260, 'seed'),
  ('muradiye-kulliyesi', 'Muradiye''nin Tamamı', 'All of Muradiye', 'Muradiye Külliyesi''nin bütün yapılarını ziyaret et.', 'Visit every building of the Muradiye Complex.', '🏯', 60, '{"kind": "complex", "parentId": "bursa-osmangazi-muradiye-kulliyesi"}'::jsonb, 270, 'seed'),
  ('esrefoglu-kulliyesi', 'Eşrefoğlu''nun Tamamı', 'All of Eşrefoğlu', 'Eşrefoğlu Süleyman Bey Külliyesi''nin bütün yapılarını ziyaret et.', 'Visit every building of the Eşrefoğlu Süleyman Bey Complex.', '🏯', 50, '{"kind": "complex", "parentId": "konya-beysehir-esrefoglu-suleyman-bey-kulliyesi"}'::jsonb, 280, 'seed'),
  ('sokullu-kulliyesi', 'Sokullu''nun Tamamı', 'All of Sokullu', 'Payas''taki Sokullu Mehmet Paşa Külliyesi''nin bütün yapılarını ziyaret et.', 'Visit every building of the Sokullu Mehmet Paşa Complex in Payas.', '🏯', 50, '{"kind": "complex", "parentId": "hatay-payas-sokullu-mehmet-pasa-kulliyesi"}'::jsonb, 290, 'seed'),
  ('ilk-not', 'İlk Not', 'First Note', 'Bir ziyaretçi notun onaylansın.', 'Have a visitor note approved.', '✍️', 15, '{"kind": "contributions", "count": 1, "contribution": "notes"}'::jsonb, 300, 'seed'),
  ('ilk-fotograf', 'İlk Fotoğraf', 'First Photo', 'Önerdiğin bir fotoğraf onaylansın.', 'Have a suggested photo approved.', '📸', 20, '{"kind": "contributions", "count": 1, "contribution": "photos"}'::jsonb, 310, 'seed'),
  ('katkici', 'Katkıcı', 'Contributor', '5 notun ya da fotoğrafın onaylansın.', 'Have 5 notes or photos approved.', '🤝', 50, '{"kind": "contributions", "count": 5, "contribution": "any"}'::jsonb, 320, 'seed');

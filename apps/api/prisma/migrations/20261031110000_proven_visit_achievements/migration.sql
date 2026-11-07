-- Kanıtlanmış ziyaret başarımları (kural türü proven_visits): Zaman Perdesi'nde eserin fotoğrafını
-- kamerada tanıtan ziyaretçi için. docs/achievements.md ile aynı liste.
INSERT INTO achievement (code, title_tr, title_en, description_tr, description_en, badge, points, rule, sort_order, created_by) VALUES
  ('zaman-yolcusu', 'Zaman Yolcusu', 'Time Traveller', 'Zaman Perdesi''nde bir eseri kamerada tanıtarak ziyaretini kanıtla.', 'Prove a visit by recognising a site through the camera in Zaman Perdesi.', '⏳', 40, '{"kind": "proven_visits", "count": 1}'::jsonb, 325, 'seed'),
  ('zaman-ustasi', 'Zaman Ustası', 'Master of Time', '5 eserde ziyaretini Zaman Perdesi ile kanıtla.', 'Prove visits to 5 sites with Zaman Perdesi.', '🕰️', 100, '{"kind": "proven_visits", "count": 5}'::jsonb, 326, 'seed')
ON CONFLICT (code) DO NOTHING;

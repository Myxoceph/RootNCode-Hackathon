-- Kitabe Gönüllüleri (Veri Döngüsü H7/Y5): gönderdiği kitabe uzman okuyup yayınlanınca kazanılan rozet.
-- Kural türü contributions, katkı türü inscriptions (yalnızca yayınlanan, applied_at dolu kitabeler sayılır).
-- docs/achievements.md ile aynı liste.
INSERT INTO achievement (code, title_tr, title_en, description_tr, description_en, badge, points, rule, sort_order, created_by) VALUES
  ('kitabe-gonullusu', 'Kitabe Gönüllüsü', 'Inscription Volunteer', 'Gönderdiğin bir kitabe uzman tarafından okunup uygulamaya eklensin.', 'Have an inscription you sent read by an expert and added to the app.', '📜', 20, '{"kind": "contributions", "count": 1, "contribution": "inscriptions"}'::jsonb, 330, 'seed')
ON CONFLICT (code) DO NOTHING;

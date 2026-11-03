-- Not bırakanlar için iki rozet daha (kural türü contributions, yalnızca onaylanan notlar sayılır).
-- Notlar ayrıca onaylanınca etkinlik puanı da kazandırır (ACTIVITY_POINTS). docs/achievements.md ile aynı liste.
INSERT INTO achievement (code, title_tr, title_en, description_tr, description_en, badge, points, rule, sort_order, created_by) VALUES
  ('on-not', 'Not Defteri', 'Notebook', '10 ziyaretçi notun onaylansın.', 'Have 10 visitor notes approved.', '📝', 60, '{"kind": "contributions", "count": 10, "contribution": "notes"}'::jsonb, 321, 'seed'),
  ('rehber-kalem', 'Rehber Kalem', 'Guide''s Pen', '25 ziyaretçi notun onaylansın.', 'Have 25 visitor notes approved.', '🖋️', 120, '{"kind": "contributions", "count": 25, "contribution": "notes"}'::jsonb, 322, 'seed')
ON CONFLICT (code) DO NOTHING;

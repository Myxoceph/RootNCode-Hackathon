-- Zaman Perdesi is now Ziyaret Mührü: the visitor proves a visit by showing the camera a chosen part of
-- the monument. The proven-visit achievements keep their codes (earned ones stay earned); only their
-- texts and badges follow the new name. Rows an admin has edited since are left alone.
UPDATE achievement SET title_tr = 'İlk Mühür', title_en = 'First Seal',
  description_tr = 'Ziyaret Mührü ile bir eserde bulunduğunu kanıtla.',
  description_en = 'Prove you were at a site with Ziyaret Mührü.',
  badge = '🔏'
WHERE code = 'zaman-yolcusu' AND title_tr = 'Zaman Yolcusu';

UPDATE achievement SET title_tr = 'Mühür Ustası', title_en = 'Seal Master',
  description_tr = '5 eserde ziyaretini Ziyaret Mührü ile kanıtla.',
  description_en = 'Prove visits to 5 sites with Ziyaret Mührü.',
  badge = '🏅'
WHERE code = 'zaman-ustasi' AND title_tr = 'Zaman Ustası';

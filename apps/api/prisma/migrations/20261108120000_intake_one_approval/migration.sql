-- Bir eser kimliği için tek onaylı yeni eser taslağı: iki moderatör iki ayrı taslağı aynı kimlikle onaylasa,
-- worker birini öbürünün üzerine yazardı. Kontrol uygulamada da var; bu index aynı anda gelen onayları da durdurur.
CREATE UNIQUE INDEX intake_draft_new_asset_idx ON intake_draft (asset_id)
  WHERE status = 'approved' AND kind IN ('book_asset', 'field_asset');

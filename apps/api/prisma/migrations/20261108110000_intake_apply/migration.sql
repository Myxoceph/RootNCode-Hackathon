-- Onay ile yayın ayrı: API onayı kaydeder; worker (data/pipeline) onaylanan taslağı ekibin yoluyla yayınlar
-- (data/eserler dosyası + media_pipeline + import_to_db) ve applied_at'i yazar. Yayın hata verirse apply_error'da
-- kalır, kuyrukta görünür.
ALTER TABLE intake_draft ADD COLUMN applied_at timestamptz;
ALTER TABLE intake_draft ADD COLUMN apply_error text;
ALTER TABLE intake_draft ADD CONSTRAINT intake_draft_applied_check CHECK (applied_at IS NULL OR status = 'approved');
-- Worker yayınlanacakları böyle bulur.
CREATE INDEX intake_draft_apply_idx ON intake_draft (status, applied_at) WHERE status = 'approved' AND applied_at IS NULL;

-- Sohbetten Kabul (docs/plans/yigit-veri-dongusu.md §1.2, plan §7): bir iş artık bir kitap (pdf) ya da bir
-- sohbet (chat) olabilir. Sohbetin mesajları ve fotoğrafları `input`'ta; tek taslağı entry_key = 'chat'.
-- Tablolar bu dalda yeni; var olan bir tabloya dokunulmaz (plan §9).

-- Otomatik adlı kısıtlar (intake_draft_check…) her veritabanında aynı adı almayabilir: adla değil,
-- tanımıyla bulunup kaldırılır.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'c' AND (
      (conrelid = 'intake_job'::regclass AND pg_get_constraintdef(oid) = 'CHECK ((kind = ''pdf''::text))')
      OR (conrelid = 'intake_draft'::regclass AND pg_get_constraintdef(oid) IN (
        'CHECK (((kind = ''book_asset''::text) = (job_id IS NOT NULL)))',
        'CHECK (((kind = ''book_asset''::text) = (entry_key IS NOT NULL)))'))
    )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE intake_job ADD CONSTRAINT intake_job_kind_check CHECK (kind IN ('pdf', 'chat'));
-- Kitabın dosyası var, sohbetin yok; sohbetin girdisi var, kitabın yok.
ALTER TABLE intake_job ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_file_check CHECK ((kind = 'pdf') = (file_path IS NOT NULL));
ALTER TABLE intake_job ADD COLUMN input jsonb;
ALTER TABLE intake_job ADD CONSTRAINT intake_job_input_check CHECK ((kind = 'chat') = (input IS NOT NULL));

-- Kitap ve sohbet taslakları bir işe ve o işin bir satırına bağlı; ziyaretçinin kitabesi ikisine de değil.
ALTER TABLE intake_draft ADD CONSTRAINT intake_draft_job_check CHECK ((kind = 'inscription') = (job_id IS NULL));
ALTER TABLE intake_draft ADD CONSTRAINT intake_draft_entry_key_check CHECK ((kind = 'inscription') = (entry_key IS NULL));

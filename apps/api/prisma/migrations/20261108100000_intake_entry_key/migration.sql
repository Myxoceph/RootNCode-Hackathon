-- Kitap taslağının kitap haritasındaki satırı zorunlu: (job_id, entry_key) benzersizliği NULL'ları ayrı
-- saydığı için satırsız bir taslak, worker yeniden çalışınca çoğalırdı. Öbür türlerin satırı yoktur.
ALTER TABLE intake_draft ADD CONSTRAINT intake_draft_entry_key_check
  CHECK ((kind = 'book_asset') = (entry_key IS NOT NULL));

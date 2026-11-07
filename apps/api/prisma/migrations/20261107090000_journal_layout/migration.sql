-- Anı Defteri: ziyaretçinin bir sayfada fotoğrafları ve yazıyı elle yerleştirdiği düzen. NULL: olağan düzen.
ALTER TABLE journal_entry ADD COLUMN layout jsonb;

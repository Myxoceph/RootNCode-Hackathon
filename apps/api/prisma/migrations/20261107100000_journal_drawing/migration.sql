-- Anı Defteri: elle çizim layout içinde durur; yalnızca çizim olan bir sayfa da listelenebilsin diye işaretlenir.
ALTER TABLE journal_entry ADD COLUMN has_drawing boolean NOT NULL DEFAULT false;

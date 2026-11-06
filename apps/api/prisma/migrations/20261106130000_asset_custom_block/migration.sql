-- Adminin eserin dosyasına eklediği ana bölümler: başlık, biçimli metin (## başlık, **kalın**, _eğik_,
-- liste, alıntı; düz metin olarak saklanır, HTML değil) ve dosyada hangi bölümden sonra geleceği.
CREATE TABLE asset_custom_block (
  asset_id    text NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  sort_order  smallint NOT NULL,
  after_block text NOT NULL,
  title_tr    text NOT NULL,
  title_en    text,
  body_tr     text NOT NULL,
  body_en     text,
  PRIMARY KEY (asset_id, slug)
);

-- Ödüllerim: panelde ödüle seçilen çizim. Boşsa uygulama ödülün kodundan ya da türünden seçer.
ALTER TABLE reward ADD COLUMN art text;
ALTER TABLE reward ADD CONSTRAINT reward_art_check
  CHECK (art IS NULL OR art IN ('mug', 'notebook', 'cap', 'shirt', 'ticket', 'tea', 'gift', 'museum', 'tag', 'lantern'));

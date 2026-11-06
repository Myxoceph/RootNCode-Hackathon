-- Panelden yüklenen fotoğraflar: içe aktarma veri setinin satırlarını silip yeniden kurar, bunlara dokunmaz.
ALTER TABLE asset_media ADD COLUMN panel_upload boolean NOT NULL DEFAULT false;

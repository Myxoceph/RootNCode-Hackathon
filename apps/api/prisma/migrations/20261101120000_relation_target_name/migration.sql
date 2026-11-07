-- Links to places outside the dataset (e.g. a Bursa han that funded a complex in Istanbul) carry the
-- target's name as the source gives it, so the app can show them without a record (contracts 0.3.15).
ALTER TABLE asset_relation ADD COLUMN target_name_tr text, ADD COLUMN target_name_en text;

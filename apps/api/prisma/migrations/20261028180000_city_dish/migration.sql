-- Yöresel Kültür & Gastronomi (modül 5): bir ilin yöresel lezzetleri (data/sehirler/<il>.json).
-- Her lezzet kaynaklıdır; şimdilik kaynak, Türk Patent'in coğrafi işaret sicil belgesidir (gi_*).
-- Eserlere bağlı değildir; source ve city gibi ortak bir tablo olarak içe aktarılır.
CREATE TABLE city_dish (
  id                     text PRIMARY KEY CHECK (id ~ '^[a-z]+-[a-z0-9]+(-[a-z0-9]+)*$'),
  city_code              text NOT NULL REFERENCES city(code),
  sort_order             smallint NOT NULL,
  kind                   text NOT NULL CHECK (kind IN ('main','meze','dessert','street')),
  name_tr                text NOT NULL,
  name_en                text,
  description_tr         text NOT NULL,
  description_en         text,
  story_tr               text,
  story_en               text,
  district               text,
  gi_portal_id           integer NOT NULL,
  gi_registration_number text NOT NULL,
  gi_registered_on       date NOT NULL,
  gi_type                text NOT NULL CHECK (gi_type IN ('mense','mahrec')),
  gi_registrant          text NOT NULL,
  gi_document_url        text NOT NULL,
  source_id              text NOT NULL REFERENCES source(id),
  source_url             text,
  confidence             confidence NOT NULL,
  status                 text NOT NULL CHECK (status IN ('draft','in_review','published'))
);

-- Bir ilin lezzetleri, dosyadaki sırasıyla.
CREATE INDEX city_dish_city_idx ON city_dish (city_code, sort_order);

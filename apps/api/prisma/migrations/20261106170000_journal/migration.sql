-- Anı Defteri: ziyaretçinin yalnızca kendisinin gördüğü yazı ve fotoğrafları (ADR 0004).
CREATE TABLE journal_entry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT journal_entry_pkey PRIMARY KEY (id),
  CONSTRAINT journal_entry_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX journal_entry_user_id_created_at_id_idx ON journal_entry (user_id, created_at DESC, id DESC);

CREATE TABLE journal_photo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  lqip text NOT NULL,
  dominant_color text NOT NULL,
  content_type text NOT NULL,
  thumb bytea NOT NULL,
  "full" bytea NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT journal_photo_pkey PRIMARY KEY (id),
  CONSTRAINT journal_photo_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES journal_entry (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT journal_photo_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX journal_photo_entry_id_created_at_idx ON journal_photo (entry_id, created_at);
CREATE INDEX journal_photo_user_id_created_at_idx ON journal_photo (user_id, created_at);

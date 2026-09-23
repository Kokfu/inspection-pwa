ALTER TABLE users ADD COLUMN display_name TEXT;

ALTER TABLE users ADD CONSTRAINT users_display_name_check
  CHECK (display_name IS NULL OR (length(trim(display_name)) BETWEEN 1 AND 160 AND length(display_name) <= 160));

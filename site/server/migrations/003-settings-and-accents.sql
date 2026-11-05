CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  blob TEXT NOT NULL,
  by TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX versions_key ON versions (kind, key, id);

ALTER TABLE profiles ADD COLUMN accent TEXT;

UPDATE profiles SET accent = CASE handle
  WHEN 'amrmscll' THEN '#6f8fd1'
  WHEN 'bluocaroot' THEN '#c9a15f'
  WHEN 'omar-mohamed24' THEN '#8fb86a'
  WHEN 'nier0o' THEN '#a98fd6'
  WHEN 'mahmoudhanyfathalla' THEN '#d47a86'
END;

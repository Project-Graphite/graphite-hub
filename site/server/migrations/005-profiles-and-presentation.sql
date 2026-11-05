ALTER TABLE profiles ADD COLUMN alias TEXT;
ALTER TABLE profiles ADD COLUMN avatar_upload TEXT;
ALTER TABLE profiles ADD COLUMN cover_upload TEXT;
ALTER TABLE profiles ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN edited_at TEXT;

CREATE UNIQUE INDEX profiles_alias ON profiles (alias) WHERE alias IS NOT NULL;

CREATE TABLE project_presentation (
  slug TEXT PRIMARY KEY,
  cover_upload TEXT,
  accent TEXT,
  summary TEXT,
  layout TEXT NOT NULL DEFAULT 'window' CHECK (layout IN ('window', 'card')),
  feature TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE short_links (
  handle TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  listed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (handle, name)
);

CREATE TABLE registry_pending (
  slug TEXT PRIMARY KEY,
  fields TEXT NOT NULL,
  pull_request TEXT,
  by TEXT NOT NULL,
  at TEXT NOT NULL
);

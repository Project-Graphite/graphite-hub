CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  cover_upload TEXT,
  project TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  editors TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'trashed')),
  publish_at TEXT,
  published_at TEXT,
  doc BLOB,
  html TEXT,
  reading_minutes INTEGER,
  before_trash TEXT,
  trashed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE (author, slug)
);
CREATE INDEX posts_published ON posts (status, published_at);

CREATE TABLE post_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  by TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  due_at TEXT NOT NULL,
  done_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX jobs_due ON jobs (done_at, due_at);

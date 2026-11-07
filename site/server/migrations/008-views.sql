CREATE TABLE views (
  kind TEXT NOT NULL CHECK (kind IN ('post', 'project')),
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, key, day)
);

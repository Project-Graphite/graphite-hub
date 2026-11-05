CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  name TEXT,
  body TEXT NOT NULL,
  public INTEGER NOT NULL,
  published_by TEXT,
  published_at TEXT,
  address_hash TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX messages_wall ON messages (published_at) WHERE published_at IS NOT NULL;

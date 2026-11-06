CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  scope TEXT NOT NULL DEFAULT 'all',
  cadence TEXT NOT NULL DEFAULT 'each' CHECK (cadence IN ('each', 'weekly')),
  token TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  suppressed_at TEXT,
  suppressed_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sends (
  id INTEGER PRIMARY KEY,
  subscriber TEXT NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('confirm', 'manage', 'post', 'digest')),
  ref TEXT,
  due_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'bounced')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX sends_queue ON sends (status, due_at);
CREATE INDEX sends_subscriber ON sends (subscriber, created_at);
CREATE UNIQUE INDEX sends_once ON sends (subscriber, kind, ref) WHERE ref IS NOT NULL;

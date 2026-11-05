CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE members (
  handle TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  public_repos INTEGER,
  followers INTEGER,
  github_since TEXT,
  joined_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE profiles (
  handle TEXT PRIMARY KEY,
  headline TEXT,
  bio TEXT,
  blocks TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  slug TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  entry TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX projects_repo ON projects (repo COLLATE NOCASE);

CREATE TABLE repo_stats (
  repo TEXT PRIMARY KEY COLLATE NOCASE,
  stars INTEGER NOT NULL,
  forks INTEGER NOT NULL,
  open_issues INTEGER NOT NULL,
  pushed_at TEXT,
  languages TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  version TEXT NOT NULL,
  tag TEXT,
  previous TEXT,
  date TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  groups TEXT NOT NULL,
  UNIQUE (project, version)
);

CREATE TABLE deploys (
  id INTEGER PRIMARY KEY,
  project TEXT NOT NULL,
  tag TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  health_status INTEGER,
  health_ms INTEGER,
  by TEXT,
  UNIQUE (project, started_at)
);

CREATE TABLE uptime (
  project TEXT NOT NULL,
  minute TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER,
  PRIMARY KEY (project, minute)
);

CREATE TABLE uptime_days (
  project TEXT NOT NULL,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  up INTEGER NOT NULL,
  p95_ms INTEGER,
  PRIMARY KEY (project, day)
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY,
  seq TEXT UNIQUE,
  kind TEXT NOT NULL,
  public INTEGER NOT NULL,
  ref TEXT,
  actor TEXT,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX activity_at ON activity (at);

CREATE TABLE webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE errors (
  fingerprint TEXT PRIMARY KEY,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  count INTEGER NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT,
  request_id TEXT,
  resolved_at TEXT,
  alerted_at TEXT
);

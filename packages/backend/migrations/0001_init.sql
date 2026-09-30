-- better-t-stack analytics + content schema (Cloudflare D1 / SQLite)
-- Replaces the former Convex `schema.ts`.

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  database TEXT,
  orm TEXT,
  backend TEXT,
  runtime TEXT,
  -- JSON-encoded string arrays
  frontend TEXT,
  addons TEXT,
  examples TEXT,
  auth TEXT,
  payments TEXT,
  git INTEGER,
  package_manager TEXT,
  install INTEGER,
  db_setup TEXT,
  api TEXT,
  web_deploy TEXT,
  server_deploy TEXT,
  cli_version TEXT,
  node_version TEXT,
  platform TEXT,
  mode TEXT,
  quarantined_at INTEGER,
  quarantine_reason TEXT
);

CREATE INDEX IF NOT EXISTS by_quarantined ON analytics_events (quarantined_at);
CREATE INDEX IF NOT EXISTS by_created_at ON analytics_events (created_at);

-- Single-row aggregate (id is constrained to 1). `version` powers optimistic
-- concurrency so concurrent ingests never lose an increment.
CREATE TABLE IF NOT EXISTS analytics_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS analytics_daily_stats (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS showcase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  live_url TEXT NOT NULL,
  tags TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  embed_id TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tweets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  tweet_id TEXT NOT NULL,
  "order" INTEGER
);

/** Worker bindings and shared row/response types. */

export type Bindings = {
  DB: D1Database;
  OSS_STATS_KV: KVNamespace;
  /** Optional GitHub token to raise REST rate limits during cron sync. */
  GITHUB_TOKEN?: string;
  /** When unset, all `/api/admin/*` routes return 404 (fail closed). */
  ADMIN_TOKEN?: string;
  /** Injectable clock for tests. */
  now?: () => number;
};

export type AppEnv = { Bindings: Bindings };

export type AnalyticsEventRow = {
  id: number;
  created_at: number;
  database: string | null;
  orm: string | null;
  backend: string | null;
  runtime: string | null;
  frontend: string | null;
  addons: string | null;
  examples: string | null;
  auth: string | null;
  payments: string | null;
  git: number | null;
  package_manager: string | null;
  install: number | null;
  db_setup: string | null;
  api: string | null;
  web_deploy: string | null;
  server_deploy: string | null;
  cli_version: string | null;
  node_version: string | null;
  platform: string | null;
  mode: string | null;
  quarantined_at: number | null;
  quarantine_reason: string | null;
};

export type StatsRow = {
  data: string;
  version: number;
};

export type DailyRow = {
  date: string;
  count: number;
};

export type GithubCache = {
  starCount: number;
  contributorCount: number;
  fetchedAt: number;
};

export type NpmCache = {
  name: string;
  dayOfWeekAverages: number[];
  total: number;
  fetchedAt: number;
};

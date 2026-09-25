/**
 * Migrates a `npx convex export` dump into SQL for the D1 `bts-analytics`
 * database. Only the tables this backend reads are transformed; Convex system
 * fields (`_id`, `_creationTime`) are mapped to `id`/`created_at`.
 *
 * Usage:
 *   npx convex export --path ./convex-export.zip && unzip ./convex-export.zip -d ./convex-export
 *   bun scripts/migrate-convex.ts ./convex-export                 # print SQL
 *   bun scripts/migrate-convex.ts ./convex-export --out seed.sql  # write file
 *
 * Convex exports newer than 1.16 write one `<table>.jsonl` per table. Older
 * dumps use a single `documents.jsonl` with a `_table` field; both are accepted.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ConvexDoc = Record<string, unknown> & { _creationTime?: number; _table?: string };

const EVENT_COLUMNS =
  "created_at, database, orm, backend, runtime, frontend, addons, examples, auth, payments, git, package_manager, install, db_setup, api, web_deploy, server_deploy, cli_version, node_version, platform, mode, quarantined_at, quarantine_reason";

function readDocuments(root: string): Map<string, ConvexDoc[]> {
  const byTable = new Map<string, ConvexDoc[]>();
  const files: { name: string; path: string }[] = [];
  const stats = statSync(root);
  if (stats.isDirectory()) {
    for (const name of readdirSync(root)) {
      if (name.endsWith(".jsonl")) files.push({ name, path: join(root, name) });
    }
  } else {
    files.push({ name: "documents", path: root });
  }

  for (const file of files) {
    const fallbackTable = file.name.replace(/\.jsonl$/, "");
    for (const line of readFileSync(file.path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const doc = JSON.parse(line) as ConvexDoc;
      const table = typeof doc._table === "string" ? doc._table : fallbackTable;
      const bucket = byTable.get(table) ?? [];
      bucket.push(doc);
      byTable.set(table, bucket);
    }
  }
  return byTable;
}

function quote(value: unknown): string {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonOrNull(value: unknown): string {
  return Array.isArray(value) ? quote(JSON.stringify(value)) : "NULL";
}

function eventInsert(doc: ConvexDoc): string {
  const values = [
    quote(doc._creationTime),
    quote(doc.database),
    quote(doc.orm),
    quote(doc.backend),
    quote(doc.runtime),
    jsonOrNull(doc.frontend),
    jsonOrNull(doc.addons),
    jsonOrNull(doc.examples),
    quote(doc.auth),
    quote(doc.payments),
    quote(doc.git),
    quote(doc.packageManager),
    quote(doc.install),
    quote(doc.dbSetup),
    quote(doc.api),
    quote(doc.webDeploy),
    quote(doc.serverDeploy),
    quote(doc.cli_version),
    quote(doc.node_version),
    quote(doc.platform),
    quote(doc.mode),
    quote(doc.quarantinedAt),
    quote(doc.quarantineReason),
  ];
  return `INSERT INTO analytics_events (${EVENT_COLUMNS}) VALUES (${values.join(", ")});`;
}

function statsInsert(doc: ConvexDoc): string {
  const { _id, _creationTime, ...rest } = doc;
  void _id;
  void _creationTime;
  const data = JSON.stringify(rest);
  return `INSERT INTO analytics_stats (id, data, version, updated_at) VALUES (1, ${quote(data)}, 0, ${Date.now()});`;
}

function dailyInsert(doc: ConvexDoc): string {
  return `INSERT OR REPLACE INTO analytics_daily_stats (date, count) VALUES (${quote(doc.date)}, ${quote(doc.count)});`;
}

function contentInsert(table: string, doc: ConvexDoc): string | null {
  const created = quote(doc._creationTime);
  if (table === "showcase") {
    return `INSERT INTO showcase (created_at, title, description, image_url, live_url, tags) VALUES (${created}, ${quote(doc.title)}, ${quote(doc.description)}, ${quote(doc.imageUrl)}, ${quote(doc.liveUrl)}, ${quote(JSON.stringify(doc.tags ?? []))});`;
  }
  if (table === "videos") {
    return `INSERT INTO videos (created_at, embed_id, title) VALUES (${created}, ${quote(doc.embedId)}, ${quote(doc.title)});`;
  }
  if (table === "tweets") {
    return `INSERT INTO tweets (created_at, tweet_id, "order") VALUES (${created}, ${quote(doc.tweetId)}, ${quote(doc.order)});`;
  }
  return null;
}

const [root, ...flags] = process.argv.slice(2);
if (!root) {
  console.error("Usage: bun scripts/migrate-convex.ts <convex-export-dir|documents.jsonl> [--out file]");
  process.exit(1);
}

const documents = readDocuments(root);
const statements: string[] = ["PRAGMA foreign_keys = ON;"];
const push = (line: string | null): void => {
  if (line) statements.push(line);
};

for (const doc of documents.get("analyticsEvents") ?? []) push(eventInsert(doc));
const stats = (documents.get("analyticsStats") ?? [])[0];
if (stats) push(statsInsert(stats));
for (const doc of documents.get("analyticsDailyStats") ?? []) push(dailyInsert(doc));
for (const table of ["showcase", "videos", "tweets"]) {
  for (const doc of documents.get(table) ?? []) push(contentInsert(table, doc));
}

const sql = `${statements.join("\n")}\n`;
const outIndex = flags.indexOf("--out");
if (outIndex !== -1 && flags[outIndex + 1]) {
  writeFileSync(flags[outIndex + 1], sql);
  console.error(`Wrote ${statements.length - 1} statements to ${flags[outIndex + 1]}`);
} else {
  console.log(sql);
}

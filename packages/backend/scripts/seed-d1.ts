/**
 * Seeds D1 content tables from `scripts/seed/*.json`.
 *
 * Usage:
 *   bun scripts/seed-d1.ts                 # print SQL
 *   bun scripts/seed-d1.ts --apply --local # run via wrangler d1 execute
 *
 * The repository ships empty seed arrays because the Convex deployment (and its
 * data) are not part of the repo. Populate the JSON files first if you want to
 * carry content over.
 */
import { readFileSync } from "node:fs";

type ShowcaseSeed = {
  title: string;
  description: string;
  imageUrl: string;
  liveUrl: string;
  tags: string[];
};
type VideoSeed = { embedId: string; title: string };
type TweetSeed = { tweetId: string; order?: number };

function readSeed<T>(name: string): T[] {
  return JSON.parse(readFileSync(new URL(`./seed/${name}.json`, import.meta.url), "utf8")) as T[];
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql(): string {
  const lines: string[] = ["DELETE FROM showcase;", "DELETE FROM videos;", "DELETE FROM tweets;"];

  readSeed<ShowcaseSeed>("showcase").forEach((row, index) => {
    lines.push(
      `INSERT INTO showcase (created_at, title, description, image_url, live_url, tags) VALUES (` +
        `${index + 1}, ${quote(row.title)}, ${quote(row.description)}, ${quote(row.imageUrl)}, ` +
        `${quote(row.liveUrl)}, ${quote(JSON.stringify(row.tags))});`,
    );
  });

  readSeed<VideoSeed>("videos").forEach((row, index) => {
    lines.push(
      `INSERT INTO videos (created_at, embed_id, title) VALUES (${index + 1}, ${quote(row.embedId)}, ${quote(row.title)});`,
    );
  });

  readSeed<TweetSeed>("tweets").forEach((row, index) => {
    const order = row.order === undefined ? "NULL" : String(row.order);
    lines.push(
      `INSERT INTO tweets (created_at, tweet_id, "order") VALUES (${index + 1}, ${quote(row.tweetId)}, ${order});`,
    );
  });

  return lines.join("\n");
}

const sql = buildSql();
const args = process.argv.slice(2);

if (args.includes("--apply")) {
  const localFlag = args.includes("--local") ? ["--local"] : ["--remote"];
  const proc = Bun.spawnSync(
    ["bunx", "wrangler", "d1", "execute", "bts-analytics", ...localFlag, "--command", sql],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  process.exit(proc.exitCode ?? 1);
}

console.log(sql);

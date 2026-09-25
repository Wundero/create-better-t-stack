import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, test } from "bun:test";

import { app } from "../src/app";
import type { Bindings } from "../src/types";
import { D1Shim } from "./db-shim";

const MIGRATION = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

class MemoryKV {
  private readonly store = new Map<string, string>();

  async get(key: string, type?: string): Promise<unknown> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

const validEvent = {
  database: "postgres",
  orm: "drizzle",
  backend: "hono",
  runtime: "node",
  frontend: ["next"],
  addons: ["biome"],
  examples: ["todo"],
  auth: "better-auth",
  payments: "polar",
  git: true,
  packageManager: "bun",
  install: true,
  dbSetup: "neon",
  api: "trpc",
  webDeploy: "vercel",
  serverDeploy: "none",
  cli_version: "3.38.2",
  node_version: "v24.5.0",
  platform: "darwin",
  mode: "flags",
};

let db: D1Shim;
let env: Bindings;

function makeEnv(shim: D1Shim, overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: shim as unknown as D1Database,
    OSS_STATS_KV: new MemoryKV() as unknown as KVNamespace,
    ADMIN_TOKEN: "secret",
    ...overrides,
  };
}

function ingest(body: string | object, target: Bindings = env) {
  return app.request(
    "http://localhost/api/analytics/ingest",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    target,
  );
}

beforeEach(() => {
  db = new D1Shim();
  db.exec(MIGRATION);
  env = makeEnv(db);
});

describe("health", () => {
  test("GET /health returns OK", async () => {
    const res = await app.request("http://localhost/health", undefined, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});

describe("analytics ingest contract", () => {
  test("valid ingest returns 200 and increments stats + daily", async () => {
    const res = await ingest(validEvent);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");

    const stats = await app.request("http://localhost/api/analytics/stats", undefined, env);
    const statsBody = (await stats.json()) as { totalProjects: number; mode: Record<string, number> };
    expect(statsBody.totalProjects).toBe(1);
    expect(statsBody.mode).toEqual({ flags: 1 });

    const daily = (await (
      await app.request("http://localhost/api/analytics/daily?days=3", undefined, env)
    ).json()) as { date: string; count: number }[];
    expect(daily).toHaveLength(3);
    expect(daily[daily.length - 1]?.count).toBe(1);
    expect(daily[0]?.count).toBe(0);

    const recent = (await (
      await app.request("http://localhost/api/analytics/recent", undefined, env)
    ).json()) as { id: string; createdAt: number; backend: string }[];
    expect(recent).toHaveLength(1);
    expect(recent[0]?.backend).toBe("hono");
  });

  test("payload over 16 KiB returns 413", async () => {
    const res = await ingest(`${JSON.stringify(validEvent)}${" ".repeat(17 * 1024)}`);
    expect(res.status).toBe(413);
    expect(await res.text()).toBe("Payload Too Large");
  });

  test("malformed JSON returns 400", async () => {
    const res = await ingest("{not json");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Bad Request");
  });

  test("schema-invalid payload returns 400", async () => {
    const res = await ingest({ platform: "darwin" });
    expect(res.status).toBe(400);
  });
});

describe("analytics reads", () => {
  test("recent excludes quarantined events and orders newest first", async () => {
    const base = Date.UTC(2026, 0, 1);
    await ingest(validEvent, makeEnv(db, { now: () => base }));
    await ingest({ ...validEvent, backend: "express" }, makeEnv(db, { now: () => base + 3_600_000 }));

    const before = (await (
      await app.request("http://localhost/api/analytics/recent", undefined, env)
    ).json()) as { backend: string }[];
    expect(before.map((event) => event.backend)).toEqual(["express", "hono"]);

    db.prepare("UPDATE analytics_events SET quarantined_at = ? WHERE id = 1").bind(Date.now()).run();

    const after = (await (
      await app.request("http://localhost/api/analytics/recent", undefined, env)
    ).json()) as { backend: string }[];
    expect(after.map((event) => event.backend)).toEqual(["express"]);
  });

  test("stats is null when no events exist", async () => {
    const res = await app.request("http://localhost/api/analytics/stats", undefined, env);
    expect(await res.json()).toBeNull();
  });

  test("cold KV github/npm stats return zeros", async () => {
    const github = (await (
      await app.request(
        "http://localhost/api/stats/github?name=AmanVarshney01/create-better-t-stack",
        undefined,
        env,
      )
    ).json()) as { starCount: number; contributorCount: number };
    expect(github).toEqual({ starCount: 0, contributorCount: 0 });

    const npm = (await (
      await app.request("http://localhost/api/stats/npm?names=create-better-t-stack", undefined, env)
    ).json()) as { packages: { name: string; total: number }[] };
    expect(npm.packages).toEqual([
      { name: "create-better-t-stack", dayOfWeekAverages: [0, 0, 0, 0, 0, 0, 0], total: 0 },
    ]);
  });
});

describe("optimistic concurrency", () => {
  test("ingest retries when a concurrent writer wins the version race", async () => {
    let failedOnce = false;
    const racing = new D1Shim({
      beforeRun: (sql) => {
        if (!failedOnce && sql.startsWith("UPDATE analytics_stats SET data")) {
          failedOnce = true;
          return {
            results: [],
            success: true,
            meta: { changes: 0, last_row_id: 0, duration: 0 },
          };
        }
        return null;
      },
    });
    racing.exec(MIGRATION);

    const res = await ingest(validEvent, makeEnv(racing));
    expect(res.status).toBe(200);
    expect(failedOnce).toBe(true);

    const stats = (await (
      await app.request("http://localhost/api/analytics/stats", undefined, makeEnv(racing))
    ).json()) as { totalProjects: number };
    expect(stats.totalProjects).toBe(1);
  });
});

describe("content routes", () => {
  test("showcase, videos and ordered tweets map to the frozen shapes", async () => {
    db.prepare(
      "INSERT INTO showcase (created_at, title, description, image_url, live_url, tags) VALUES (?,?,?,?,?,?)",
    )
      .bind(1, "Demo", "desc", "img.png", "https://demo.dev", JSON.stringify(["hono"]))
      .run();
    db.prepare("INSERT INTO videos (created_at, embed_id, title) VALUES (?,?,?)")
      .bind(1, "abc", "Talk")
      .run();
    db.prepare("INSERT INTO tweets (created_at, tweet_id) VALUES (?,?)").bind(1, "no-order").run();
    db.prepare('INSERT INTO tweets (created_at, tweet_id, "order") VALUES (?,?,?)')
      .bind(1, "first", 1)
      .run();
    db.prepare('INSERT INTO tweets (created_at, tweet_id, "order") VALUES (?,?,?)')
      .bind(1, "second", 2)
      .run();

    const showcase = (await (
      await app.request("http://localhost/api/showcase", undefined, env)
    ).json()) as { title: string; tags: string[] }[];
    expect(showcase[0]?.title).toBe("Demo");
    expect(showcase[0]?.tags).toEqual(["hono"]);

    const videos = (await (
      await app.request("http://localhost/api/videos", undefined, env)
    ).json()) as { embedId: string }[];
    expect(videos[0]?.embedId).toBe("abc");

    const tweets = (await (
      await app.request("http://localhost/api/tweets", undefined, env)
    ).json()) as { tweetId: string; order?: number }[];
    expect(tweets.map((tweet) => tweet.tweetId)).toEqual(["first", "second", "no-order"]);
  });
});

describe("admin safety", () => {
  test("admin routes are 404 when ADMIN_TOKEN is unset", async () => {
    const res = await app.request(
      "http://localhost/api/admin/quarantine",
      { method: "POST", body: "{}" },
      makeEnv(db, { ADMIN_TOKEN: undefined }),
    );
    expect(res.status).toBe(404);
  });
});

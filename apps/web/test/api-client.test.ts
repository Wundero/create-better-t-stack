import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import {
  ApiValidationError,
  fetchAnalyticsStats,
  fetchDailyStats,
} from "../src/lib/api-client";

type StubMode = "valid" | "null" | "malformed";

let statsMode: StubMode = "valid";
let server: ReturnType<typeof Bun.serve>;

const validStats = {
  totalProjects: 4242,
  lastEventTime: 1_700_000_000_000,
  backend: { hono: 10 },
  frontend: { next: 12 },
  database: { sqlite: 8 },
  orm: { drizzle: 7 },
  api: { trpc: 6 },
  auth: { "better-auth": 5 },
  runtime: { bun: 9 },
  packageManager: { bun: 11 },
  platform: { linux: 4 },
  addons: { turborepo: 3 },
  examples: { none: 2 },
  dbSetup: { none: 2 },
  webDeploy: { none: 2 },
  serverDeploy: { none: 2 },
  payments: { none: 2 },
  git: { true: 13 },
  install: { true: 14 },
  nodeVersion: { "22.0.0": 1 },
  cliVersion: { "3.0.0": 1 },
  hourlyDistribution: { "09": 3 },
  stackCombinations: { "next+hono": 2 },
  dbOrmCombinations: { "sqlite+drizzle": 2 },
};

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);

      if (pathname === "/api/analytics/stats") {
        if (statsMode === "null") {
          return new Response("null", { headers: { "content-type": "application/json" } });
        }
        if (statsMode === "malformed") {
          return new Response(JSON.stringify({ totalProjects: "not-a-number" }), {
            headers: { "content-type": "application/json" },
          });
        }
        return Response.json(validStats);
      }

      if (pathname === "/api/analytics/daily") {
        return Response.json([{ date: "2026-01-01", count: 3 }]);
      }

      return new Response("not found", { status: 404 });
    },
  });

  process.env.API_URL = server.url.origin;
});

afterAll(() => {
  server.stop(true);
  delete process.env.API_URL;
});

beforeEach(() => {
  statsMode = "valid";
});

describe("fetchAnalyticsStats", () => {
  test("parses a valid stats payload", async () => {
    const stats = await fetchAnalyticsStats();

    expect(stats?.totalProjects).toBe(4242);
    expect(stats?.backend).toEqual({ hono: 10 });
    expect(stats?.hourlyDistribution).toEqual({ "09": 3 });
  });

  test("returns null when the API reports no stats", async () => {
    statsMode = "null";

    const stats = await fetchAnalyticsStats();

    expect(stats).toBeNull();
  });

  test("rejects a malformed stats payload", async () => {
    statsMode = "malformed";

    await expect(fetchAnalyticsStats()).rejects.toBeInstanceOf(ApiValidationError);
  });
});

describe("fetchDailyStats", () => {
  test("parses a daily series", async () => {
    const daily = await fetchDailyStats(30);

    expect(daily).toEqual([{ date: "2026-01-01", count: 3 }]);
  });
});

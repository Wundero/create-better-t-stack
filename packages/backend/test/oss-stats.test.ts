import { afterEach, describe, expect, test } from "bun:test";

import { readGithub, readNpm, syncGithub, syncNpm } from "../src/oss-stats";
import type { Bindings } from "../src/types";
import { asBinding } from "./db-shim";

class MemoryKV {
  readonly store = new Map<string, string>();

  async get(key: string, type?: string): Promise<unknown> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeEnv(kv: MemoryKV): Bindings {
  return { DB: asBinding({}) as D1Database, OSS_STATS_KV: asBinding(kv) as KVNamespace };
}

describe("oss stats KV cache", () => {
  test("syncGithub caches stars and contributor count from the REST API", async () => {
    const kv = new MemoryKV();
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/contributors?per_page=1&anon=true")) {
        return new Response(JSON.stringify([{ login: "a" }]), {
          headers: { link: '<https://api.github.com/x?page=42>; rel="last"' },
        });
      }
      return new Response(JSON.stringify({ stargazers_count: 1234 }));
    }) as typeof fetch;

    await syncGithub(makeEnv(kv), "AmanVarshney01/create-better-t-stack");

    const cached = await readGithub(makeEnv(kv), "AmanVarshney01/create-better-t-stack");
    expect(cached.starCount).toBe(1234);
    expect(cached.contributorCount).toBe(42);
  });

  test("syncNpm caches weekly download averages and total", async () => {
    const kv = new MemoryKV();
    const downloads = Array.from({ length: 28 }, (_, index) => ({
      day: new Date(Date.UTC(2026, 0, 5 + index)).toISOString().slice(0, 10),
      downloads: index + 1,
    }));
    globalThis.fetch = (async () => new Response(JSON.stringify({ downloads }))) as typeof fetch;

    await syncNpm(makeEnv(kv), "create-better-t-stack");

    const cached = await readNpm(makeEnv(kv), "create-better-t-stack");
    expect(cached.total).toBe(downloads.reduce((sum, day) => sum + day.downloads, 0));
    expect(cached.dayOfWeekAverages).toHaveLength(7);
  });

  test("cold cache returns zeros", async () => {
    const kv = new MemoryKV();
    expect(await readGithub(makeEnv(kv), "owner/repo")).toEqual({
      starCount: 0,
      contributorCount: 0,
      fetchedAt: 0,
    });
    expect((await readNpm(makeEnv(kv), "pkg")).total).toBe(0);
  });
});

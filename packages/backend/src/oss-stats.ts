import type { Bindings, GithubCache, NpmCache } from "./types";

export const GITHUB_REPOS = ["AmanVarshney01/create-better-t-stack"] as const;
export const NPM_PACKAGES = ["create-better-t-stack"] as const;

export function githubKey(name: string): string {
  return `github:${name}`;
}

export function npmKey(name: string): string {
  return `npm:${name}`;
}

type GithubHeaders = {
  accept: string;
  "user-agent": string;
  authorization?: string;
};

function githubHeaders(env: Bindings): GithubHeaders {
  const headers: GithubHeaders = {
    accept: "application/vnd.github+json",
    "user-agent": "bts-api",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

function parseLastPage(linkHeader: string | null, fallback: number): number {
  if (!linkHeader) return fallback;
  const match = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(linkHeader);
  return match ? Number(match[1]) : fallback;
}

export async function syncGithub(env: Bindings, repo: string): Promise<GithubCache | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: githubHeaders(env),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { stargazers_count?: number };

  let contributorCount = 0;
  const contributors = await fetch(
    `https://api.github.com/repos/${repo}/contributors?per_page=1&anon=true`,
    { headers: githubHeaders(env) },
  );
  if (contributors.ok) {
    const list = (await contributors.json()) as unknown[];
    contributorCount = parseLastPage(contributors.headers.get("link"), list.length);
  }

  const cache: GithubCache = {
    starCount: data.stargazers_count ?? 0,
    contributorCount,
    fetchedAt: Date.now(),
  };
  await env.OSS_STATS_KV.put(githubKey(repo), JSON.stringify(cache));
  return cache;
}

export async function syncNpm(env: Bindings, name: string): Promise<NpmCache | null> {
  const response = await fetch(`https://api.npmjs.org/downloads/range/last-year/${name}`);
  if (!response.ok) return null;
  const data = (await response.json()) as {
    downloads?: { day: string; downloads: number }[];
  };
  const days = data.downloads ?? [];
  const total = days.reduce((sum, day) => sum + day.downloads, 0);
  const last28 = days.slice(-28);
  const dayOfWeekAverages = Array.from({ length: 7 }, (_, weekday) => {
    const sum = last28
      .filter((day) => new Date(day.day).getUTCDay() === weekday)
      .slice(0, 4)
      .reduce((acc, day) => acc + day.downloads, 0);
    return Math.round(sum / 4);
  });

  const cache: NpmCache = { name, dayOfWeekAverages, total, fetchedAt: Date.now() };
  await env.OSS_STATS_KV.put(npmKey(name), JSON.stringify(cache));
  return cache;
}

/** Cron entrypoint: refresh every tracked repo/package, tolerating failures. */
export async function runScheduledSync(env: Bindings): Promise<void> {
  await Promise.allSettled([
    ...GITHUB_REPOS.map((repo) => syncGithub(env, repo)),
    ...NPM_PACKAGES.map((name) => syncNpm(env, name)),
  ]);
}

export async function readGithub(env: Bindings, repo: string): Promise<GithubCache> {
  const cached = await env.OSS_STATS_KV.get<GithubCache>(githubKey(repo), "json");
  return cached ?? { starCount: 0, contributorCount: 0, fetchedAt: 0 };
}

export async function readNpm(env: Bindings, name: string): Promise<NpmCache> {
  const cached = await env.OSS_STATS_KV.get<NpmCache>(npmKey(name), "json");
  return cached ?? { name, dayOfWeekAverages: [0, 0, 0, 0, 0, 0, 0], total: 0, fetchedAt: 0 };
}

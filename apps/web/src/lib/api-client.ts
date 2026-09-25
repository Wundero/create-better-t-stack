import { z } from "zod";

/**
 * Typed HTTP client for the Cloudflare Worker API that backs the website.
 *
 * The shapes here mirror the frozen backend contract. Every response is parsed
 * at the boundary so the rest of the app receives typed values and never has to
 * re-check them.
 */

const DEFAULT_API_URL = "https://api.create.1d.gg";
const LOCAL_API_URL = "http://localhost:8787";

/** `next` is a Next.js fetch extension; declared locally so Bun/tests stay typed. */
type NextFetchOptions = { revalidate?: number | false; tags?: string[] };
type FetchInit = RequestInit & { next?: NextFetchOptions };

export interface ApiRequestOptions {
  cache?: RequestCache;
  next?: NextFetchOptions;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, options: { status: number; path: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.path = options.path;
  }
}

export class ApiValidationError extends Error {
  readonly path: string;
  readonly issues: string[];

  constructor(options: { path: string; issues: string[] }) {
    super(`Invalid response from ${options.path}: ${options.issues.join("; ")}`);
    this.name = "ApiValidationError";
    this.path = options.path;
    this.issues = options.issues;
  }
}

const distributionSchema = z.record(z.string(), z.number());

export const analyticsStatsSchema = z.object({
  totalProjects: z.number(),
  lastEventTime: z.number(),
  backend: distributionSchema,
  frontend: distributionSchema,
  database: distributionSchema,
  orm: distributionSchema,
  api: distributionSchema,
  auth: distributionSchema,
  runtime: distributionSchema,
  packageManager: distributionSchema,
  platform: distributionSchema,
  addons: distributionSchema,
  examples: distributionSchema,
  dbSetup: distributionSchema,
  webDeploy: distributionSchema,
  serverDeploy: distributionSchema,
  payments: distributionSchema,
  git: distributionSchema,
  install: distributionSchema,
  nodeVersion: distributionSchema,
  cliVersion: distributionSchema,
  hourlyDistribution: distributionSchema.default({}),
  stackCombinations: distributionSchema.default({}),
  dbOrmCombinations: distributionSchema.default({}),
  /** Absent until the backend deployment that added it is live. */
  mode: distributionSchema.optional(),
});

export const dailyStatsSchema = z.array(z.object({ date: z.string(), count: z.number() }));

export const monthlyStatsSchema = z.object({
  monthly: z.array(z.object({ month: z.string(), totalProjects: z.number() })),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
});

export const analyticsEventSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  frontend: z.array(z.string()).optional(),
  backend: z.string().optional(),
  runtime: z.string().optional(),
  database: z.string().optional(),
  orm: z.string().optional(),
  api: z.string().optional(),
  auth: z.string().optional(),
  packageManager: z.string().optional(),
  payments: z.string().optional(),
  dbSetup: z.string().optional(),
  webDeploy: z.string().optional(),
  serverDeploy: z.string().optional(),
  addons: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
  cli_version: z.string().optional(),
  node_version: z.string().optional(),
  platform: z.string().optional(),
  mode: z.string().optional(),
  git: z.boolean().optional(),
  install: z.boolean().optional(),
});

export const recentEventsSchema = z.array(analyticsEventSchema);

export const showcaseProjectsSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.number(),
    title: z.string(),
    description: z.string(),
    imageUrl: z.string(),
    liveUrl: z.string(),
    tags: z.array(z.string()),
  }),
);

export const videosSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.number(),
    embedId: z.string(),
    title: z.string(),
  }),
);

export const tweetsSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.number(),
    tweetId: z.string(),
    order: z.number().optional(),
  }),
);

export const githubStatsSchema = z.object({
  starCount: z.number(),
  contributorCount: z.number(),
});

export const npmStatsSchema = z.object({
  packages: z.array(
    z.object({
      name: z.string(),
      dayOfWeekAverages: z.array(z.number()),
      total: z.number(),
    }),
  ),
});

export type AnalyticsStats = z.infer<typeof analyticsStatsSchema>;
export type DailyStat = z.infer<typeof dailyStatsSchema>[number];
export type MonthlyStats = z.infer<typeof monthlyStatsSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type ShowcaseProject = z.infer<typeof showcaseProjectsSchema>[number];
export type Video = z.infer<typeof videosSchema>[number];
export type Tweet = z.infer<typeof tweetsSchema>[number];
export type GithubStats = z.infer<typeof githubStatsSchema>;
export type NpmPackageStats = z.infer<typeof npmStatsSchema>["packages"][number];

/** Server code prefers `API_URL`; the browser only ever sees `NEXT_PUBLIC_API_URL`. */
export function resolveApiBaseUrl(): string {
  const configured =
    globalThis.window === undefined
      ? (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL)
      : process.env.NEXT_PUBLIC_API_URL;

  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "development" ? LOCAL_API_URL : DEFAULT_API_URL;
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const init: FetchInit = {
    headers: { accept: "application/json" },
    cache: options.cache,
    signal: options.signal,
  };
  if (options.next) init.next = options.next;

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, init);

  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with status ${response.status}`, {
      status: response.status,
      path,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`Request to ${path} returned invalid JSON`, {
      status: response.status,
      path,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiValidationError({
      path,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    });
  }

  return parsed.data;
}

export const fetchAnalyticsStats = (options?: ApiRequestOptions) =>
  requestJson("/api/analytics/stats", analyticsStatsSchema.nullable(), options);

export const fetchDailyStats = (days = 30, options?: ApiRequestOptions) =>
  requestJson(`/api/analytics/daily?days=${days}`, dailyStatsSchema, options);

export const fetchMonthlyStats = (options?: ApiRequestOptions) =>
  requestJson("/api/analytics/monthly", monthlyStatsSchema, options);

export const fetchRecentEvents = (limit = 20, options?: ApiRequestOptions) =>
  requestJson(`/api/analytics/recent?limit=${limit}`, recentEventsSchema, options);

export const fetchShowcaseProjects = (options?: ApiRequestOptions) =>
  requestJson("/api/showcase", showcaseProjectsSchema, options);

export const fetchVideos = (options?: ApiRequestOptions) =>
  requestJson("/api/videos", videosSchema, options);

export const fetchTweets = (options?: ApiRequestOptions) =>
  requestJson("/api/tweets", tweetsSchema, options);

export const fetchGithubStats = (name: string, options?: ApiRequestOptions) =>
  requestJson(`/api/stats/github?name=${encodeURIComponent(name)}`, githubStatsSchema, options);

export const fetchNpmStats = (names: readonly string[], options?: ApiRequestOptions) =>
  requestJson(
    `/api/stats/npm?names=${encodeURIComponent(names.join(","))}`,
    npmStatsSchema,
    options,
  );

/**
 * Build-time helper: a static page must still render when the API is
 * unreachable (CI builds before the worker exists), so failures fall back to an
 * explicit empty value instead of failing the build.
 */
export async function fetchWithFallback<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.warn(`[api-client] request failed, using fallback: ${String(error)}`);
    return fallback;
  }
}

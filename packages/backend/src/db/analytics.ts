import { buildDailyWindow, type DailyCount } from "../analytics/date-utils";
import type { AnalyticsStatsFields } from "../analytics/helpers";
import { createEmptyAnalyticsStats } from "../analytics/helpers";
import type { AnalyticsEventRow, DailyRow } from "../types";
import { rowToEvent } from "./mapping";

const MAX_DAILY_WINDOW = 366;
const MAX_RECENT_LIMIT = 50;
const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_DAILY_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function sanitizeDays(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), MAX_DAILY_WINDOW)
    : DEFAULT_DAILY_DAYS;
}

export function sanitizeLimit(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), MAX_RECENT_LIMIT)
    : DEFAULT_RECENT_LIMIT;
}

export async function loadStats(db: D1Database): Promise<AnalyticsStatsFields | null> {
  const row = await db
    .prepare("SELECT data FROM analytics_stats WHERE id = 1")
    .first<{ data: string }>();
  if (!row) return null;
  const parsed = JSON.parse(row.data) as Partial<AnalyticsStatsFields>;
  const empty = createEmptyAnalyticsStats();
  return {
    ...empty,
    ...parsed,
    hourlyDistribution: parsed.hourlyDistribution ?? {},
    stackCombinations: parsed.stackCombinations ?? {},
    dbOrmCombinations: parsed.dbOrmCombinations ?? {},
    mode: parsed.mode ?? {},
  };
}

export async function getDailyStats(db: D1Database, days: number): Promise<DailyCount[]> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const cutoff = new Date(now - (days - 1) * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
  const result = await db
    .prepare(
      "SELECT date, count FROM analytics_daily_stats WHERE date >= ? AND date <= ? ORDER BY date ASC",
    )
    .bind(cutoff, today)
    .all<DailyRow>();
  return buildDailyWindow(result.results, cutoff, today);
}

export async function getMonthlyStats(db: D1Database): Promise<{
  monthly: { month: string; totalProjects: number }[];
  firstDate: string | null;
  lastDate: string | null;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db
    .prepare("SELECT date, count FROM analytics_daily_stats WHERE date <= ? ORDER BY date ASC")
    .bind(today)
    .all<DailyRow>();

  if (result.results.length === 0) {
    return { monthly: [], firstDate: null, lastDate: null };
  }

  const byMonth = new Map<string, number>();
  for (const row of result.results) {
    const month = row.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.count);
  }

  return {
    monthly: [...byMonth.entries()]
      .map(([month, totalProjects]) => ({ month, totalProjects }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    firstDate: result.results[0]?.date ?? null,
    lastDate: result.results[result.results.length - 1]?.date ?? null,
  };
}

export async function getRecentEvents(
  db: D1Database,
  limit: number,
): Promise<({ id: string; createdAt: number } & ReturnType<typeof rowToEvent>)[]> {
  const result = await db
    .prepare(
      "SELECT * FROM analytics_events WHERE quarantined_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .bind(limit)
    .all<AnalyticsEventRow>();
  return result.results.map((row) => ({
    id: String(row.id),
    createdAt: row.created_at,
    ...rowToEvent(row),
  }));
}

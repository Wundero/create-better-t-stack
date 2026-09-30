"use client";

export type NpmDownloadStats = {
  total: number;
  dayOfWeekAverages: number[];
};

/**
 * Forecasted npm download counter, backed by the typed API's npm stats.
 *
 * The old Convex hook animated a fake counter between a stored `downloadCount`
 * and its `updatedAt`. The worker endpoint exposes only the running `total` and
 * per-weekday averages, so this reports the total directly and keeps the
 * `intervalMs` contract consumers (NumberFlow animation) expect.
 */
export function useNpmDownloadCounter(
  stats?: NpmDownloadStats | null,
  { intervalMs }: { intervalMs?: number } = {},
) {
  return {
    count: stats?.total ?? undefined,
    intervalMs: intervalMs ?? 1000,
  };
}

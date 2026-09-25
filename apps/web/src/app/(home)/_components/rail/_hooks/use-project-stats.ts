"use client";

import { useQuery } from "@tanstack/react-query";

import {
  analyticsStatsQuery,
  githubStatsQuery,
  monthlyStatsQuery,
  npmStatsQuery,
} from "@/lib/queries";
import { useNpmDownloadCounter } from "@/lib/use-npm-download-counter";

const GITHUB_REPO = "AmanVarshney01/create-better-t-stack";
const NPM_PACKAGES = ["create-better-t-stack"] as const;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function getDaySpan(firstDate: string | null, lastDate: string | null): number {
  if (!firstDate || !lastDate) return 0;
  const start = Date.parse(`${firstDate}T00:00:00Z`);
  const end = Date.parse(`${lastDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / MILLISECONDS_PER_DAY) + 1;
}

export function useProjectStats() {
  const stats = useQuery(analyticsStatsQuery());
  const monthlyStats = useQuery(monthlyStatsQuery());
  const githubRepo = useQuery(githubStatsQuery(GITHUB_REPO));
  const npmPackages = useQuery(npmStatsQuery(NPM_PACKAGES));

  const npmPackage = npmPackages.data?.packages[0] ?? null;
  const liveNpmDownloadCount = useNpmDownloadCounter(npmPackage);

  const totalProjects = stats.data?.totalProjects ?? null;
  const trackingDays = getDaySpan(
    monthlyStats.data?.firstDate ?? null,
    monthlyStats.data?.lastDate ?? null,
  );

  return {
    totalProjects,
    avgProjectsPerDay:
      trackingDays > 0 && totalProjects ? (totalProjects / trackingDays).toFixed(1) : null,
    lastUpdated: stats.data?.lastEventTime
      ? new Date(stats.data.lastEventTime).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
    starCount: githubRepo.data?.starCount ?? null,
    contributorCount: githubRepo.data?.contributorCount ?? null,
    downloadCount: liveNpmDownloadCount?.count ?? null,
    downloadIntervalMs: liveNpmDownloadCount?.intervalMs ?? 1000,
    npmAvgPerDay: npmPackage?.dayOfWeekAverages
      ? Math.round(
          npmPackage.dayOfWeekAverages.reduce((a: number, b: number) => a + b, 0) /
            npmPackage.dayOfWeekAverages.length,
        )
      : null,
  };
}

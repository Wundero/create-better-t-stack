"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { AnalyticsStats, DailyStat, MonthlyStats } from "@/lib/api-client";
import { analyticsStatsQuery, dailyStatsQuery, monthlyStatsQuery } from "@/lib/queries";

import {
  buildWeekdayDistribution,
  versionWithShare,
  withShare,
} from "./_components/analytics-helpers";
import AnalyticsPage from "./_components/analytics-page";
import type { AggregatedAnalyticsData, Distribution, TimeSeriesPoint } from "./_components/types";

type ConnectionStatus = "online" | "connecting" | "reconnecting" | "offline";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function getConnectionStatus({
  isError,
  isFetching,
  isSuccess,
}: {
  isError: boolean;
  isFetching: boolean;
  isSuccess: boolean;
}): ConnectionStatus {
  if (isError) return "offline";
  if (isFetching) return "reconnecting";
  if (isSuccess) return "online";
  return "connecting";
}

function recordToDistribution(record: Record<string, number>): Distribution {
  return Object.entries(record)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function getMostPopular(dist: Distribution) {
  return dist.length > 0 ? dist[0].name : "none";
}

function getCalendarDaySpan(timeSeries: DailyStat[]): number {
  if (timeSeries.length === 0) return 1;

  const firstDate = timeSeries[0]?.date;
  const lastDate = timeSeries[timeSeries.length - 1]?.date;
  if (!firstDate || !lastDate) return 1;

  const start = Date.parse(`${firstDate}T00:00:00Z`);
  const end = Date.parse(`${lastDate}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return Math.max(timeSeries.length, 1);
  }

  return Math.floor((end - start) / MILLISECONDS_PER_DAY) + 1;
}

function getCalendarDaySpanFromRange(
  firstDate: string | null,
  lastDate: string | null,
  fallbackSeries: DailyStat[],
): number {
  if (!firstDate || !lastDate) {
    return getCalendarDaySpan(fallbackSeries);
  }

  const start = Date.parse(`${firstDate}T00:00:00Z`);
  const end = Date.parse(`${lastDate}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return getCalendarDaySpan(fallbackSeries);
  }

  return Math.floor((end - start) / MILLISECONDS_PER_DAY) + 1;
}

function buildTimeSeries(dailyStats: DailyStat[]): TimeSeriesPoint[] {
  const sorted = [...dailyStats].sort((a, b) => a.date.localeCompare(b.date));
  let cumulativeProjects = 0;

  return sorted.map((day, index) => {
    cumulativeProjects += day.count;
    const trailingWindow = sorted.slice(Math.max(0, index - 6), index + 1);
    const rollingAverage =
      trailingWindow.reduce((sum, point) => sum + point.count, 0) / trailingWindow.length;

    return {
      date: day.date,
      dateValue: new Date(`${day.date}T00:00:00`),
      count: day.count,
      rollingAverage,
      cumulativeProjects,
    };
  });
}

function buildMonthlyTimeSeries(monthlyStats: MonthlyStats["monthly"]) {
  let cumulativeProjects = 0;

  return [...monthlyStats]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((month) => {
      cumulativeProjects += month.totalProjects;
      return {
        month: month.month,
        monthDate: new Date(`${month.month}-01T00:00:00`),
        totalProjects: month.totalProjects,
        cumulativeProjects,
      };
    });
}

function buildFromPrecomputed(
  stats: AnalyticsStats,
  dailyStats: DailyStat[],
  monthlyStats: MonthlyStats,
): AggregatedAnalyticsData {
  const totalProjects = stats.totalProjects;
  const backendDistribution = recordToDistribution(stats.backend);
  const frontendDistribution = recordToDistribution(stats.frontend);
  const databaseDistribution = recordToDistribution(stats.database);
  const ormDistribution = recordToDistribution(stats.orm);
  const apiDistribution = recordToDistribution(stats.api);
  const authDistribution = recordToDistribution(stats.auth);
  const runtimeDistribution = recordToDistribution(stats.runtime);
  const packageManagerDistribution = recordToDistribution(stats.packageManager);
  const platformDistribution = recordToDistribution(stats.platform);
  const addonsDistribution = recordToDistribution(stats.addons);
  const examplesDistribution = recordToDistribution(stats.examples);
  const dbSetupDistribution = recordToDistribution(stats.dbSetup);
  const webDeployDistribution = recordToDistribution(stats.webDeploy);
  const serverDeployDistribution = recordToDistribution(stats.serverDeploy);
  const paymentsDistribution = recordToDistribution(stats.payments);
  const gitDistribution = recordToDistribution(stats.git);
  const installDistribution = recordToDistribution(stats.install);
  const stackCombinationDistribution = withShare(
    recordToDistribution(stats.stackCombinations),
    totalProjects,
  );
  const databaseORMCombinationDistribution = withShare(
    recordToDistribution(stats.dbOrmCombinations),
    totalProjects,
  );
  // Mode was added later, so shares are relative to events that carry it.
  const modeDistribution = withShare(recordToDistribution(stats.mode ?? {}));

  const timeSeries = buildTimeSeries(dailyStats);
  const monthlyTimeSeries = buildMonthlyTimeSeries(monthlyStats.monthly);
  const calendarDaySpan = getCalendarDaySpanFromRange(
    monthlyStats.firstDate,
    monthlyStats.lastDate,
    dailyStats,
  );

  const hourlyDistribution = Array.from({ length: 24 }, (_, hourValue) => {
    const hour = String(hourValue).padStart(2, "0");
    return {
      hour: `${hour}:00`,
      hourValue,
      label: hour,
      count: stats.hourlyDistribution[hour] || 0,
    };
  });

  const weekdayDistribution = buildWeekdayDistribution(timeSeries);
  const nodeVersionDistribution = versionWithShare(
    recordToDistribution(stats.nodeVersion).map((item) => ({
      version: item.name,
      count: item.value,
    })),
    totalProjects,
  );
  const cliVersionDistribution = versionWithShare(
    recordToDistribution(stats.cliVersion)
      .filter((item) => item.name !== "unknown")
      .map((item) => ({
        version: item.name,
        count: item.value,
      })),
    totalProjects,
  );

  const recent7Days = timeSeries.slice(-7).reduce((sum, point) => sum + point.count, 0);
  const previous7Days = timeSeries.slice(-14, -7).reduce((sum, point) => sum + point.count, 0);
  const delta = recent7Days - previous7Days;
  const deltaPercentage = previous7Days > 0 ? delta / previous7Days : recent7Days > 0 ? null : 0;
  const peakDay = timeSeries.reduce<TimeSeriesPoint | null>(
    (max, point) => (max && max.count >= point.count ? max : point),
    null,
  );
  const busiestHourCandidate = hourlyDistribution.reduce<
    (typeof hourlyDistribution)[number] | null
  >((max, point) => (max && max.count >= point.count ? max : point), null);
  const busiestHour =
    busiestHourCandidate && busiestHourCandidate.count > 0 ? busiestHourCandidate : null;

  return {
    lastUpdated: new Date(stats.lastEventTime).toISOString(),
    totalProjects,
    avgProjectsPerDay: totalProjects / Math.max(calendarDaySpan, 1),
    timeSeries,
    monthlyTimeSeries,
    hourlyDistribution,
    weekdayDistribution,
    platformDistribution: withShare(platformDistribution, totalProjects),
    packageManagerDistribution: withShare(packageManagerDistribution, totalProjects),
    backendDistribution: withShare(backendDistribution, totalProjects),
    databaseDistribution: withShare(databaseDistribution, totalProjects),
    ormDistribution: withShare(ormDistribution, totalProjects),
    dbSetupDistribution: withShare(dbSetupDistribution, totalProjects),
    apiDistribution: withShare(apiDistribution, totalProjects),
    frontendDistribution: withShare(frontendDistribution, totalProjects),
    authDistribution: withShare(authDistribution, totalProjects),
    runtimeDistribution: withShare(runtimeDistribution, totalProjects),
    addonsDistribution: withShare(addonsDistribution, totalProjects),
    examplesDistribution: withShare(examplesDistribution, totalProjects),
    gitDistribution: withShare(gitDistribution, totalProjects),
    installDistribution: withShare(installDistribution, totalProjects),
    webDeployDistribution: withShare(webDeployDistribution, totalProjects),
    serverDeployDistribution: withShare(serverDeployDistribution, totalProjects),
    paymentsDistribution: withShare(paymentsDistribution, totalProjects),
    nodeVersionDistribution,
    cliVersionDistribution,
    stackCombinationDistribution,
    databaseORMCombinationDistribution,
    modeDistribution,
    summary: {
      mostPopularFrontend: getMostPopular(frontendDistribution),
      mostPopularBackend: getMostPopular(backendDistribution),
      mostPopularDatabase: getMostPopular(databaseDistribution),
      mostPopularORM: getMostPopular(ormDistribution),
      mostPopularAPI: getMostPopular(apiDistribution),
      mostPopularAuth: getMostPopular(authDistribution),
      mostPopularPackageManager: getMostPopular(packageManagerDistribution),
      mostPopularRuntime: getMostPopular(runtimeDistribution),
      topStack: stackCombinationDistribution[0]?.name ?? "none",
      topDatabasePair: databaseORMCombinationDistribution[0]?.name ?? "none",
    },
    momentum: {
      trackingDays: calendarDaySpan,
      last7Days: recent7Days,
      previous7Days,
      delta,
      deltaPercentage,
      activeDaysLast30: timeSeries.filter((point) => point.count > 0).length,
      peakDay: peakDay ? { date: peakDay.date, count: peakDay.count } : null,
      busiestHour: busiestHour ? { hour: busiestHour.hour, count: busiestHour.count } : null,
    },
  };
}

const emptyData: AggregatedAnalyticsData = {
  lastUpdated: null,
  totalProjects: 0,
  avgProjectsPerDay: 0,
  timeSeries: [],
  monthlyTimeSeries: [],
  hourlyDistribution: [],
  weekdayDistribution: [],
  platformDistribution: [],
  packageManagerDistribution: [],
  backendDistribution: [],
  databaseDistribution: [],
  ormDistribution: [],
  dbSetupDistribution: [],
  apiDistribution: [],
  frontendDistribution: [],
  authDistribution: [],
  runtimeDistribution: [],
  addonsDistribution: [],
  examplesDistribution: [],
  gitDistribution: [],
  installDistribution: [],
  webDeployDistribution: [],
  serverDeployDistribution: [],
  paymentsDistribution: [],
  nodeVersionDistribution: [],
  cliVersionDistribution: [],
  stackCombinationDistribution: [],
  databaseORMCombinationDistribution: [],
  modeDistribution: [],
  summary: {
    mostPopularFrontend: "none",
    mostPopularBackend: "none",
    mostPopularDatabase: "none",
    mostPopularORM: "none",
    mostPopularAPI: "none",
    mostPopularAuth: "none",
    mostPopularPackageManager: "none",
    mostPopularRuntime: "none",
    topStack: "none",
    topDatabasePair: "none",
  },
  momentum: {
    trackingDays: 0,
    last7Days: 0,
    previous7Days: 0,
    delta: 0,
    deltaPercentage: 0,
    activeDaysLast30: 0,
    peakDay: null,
    busiestHour: null,
  },
};

const emptyMonthlyStats: MonthlyStats = { monthly: [], firstDate: null, lastDate: null };

export function AnalyticsClient({
  initialStats,
  initialDailyStats,
  initialMonthlyStats,
}: {
  initialStats: AnalyticsStats | null;
  initialDailyStats: DailyStat[];
  initialMonthlyStats: MonthlyStats;
}) {
  const statsQuery = useQuery({
    ...analyticsStatsQuery(),
    initialData: initialStats ?? undefined,
    initialDataUpdatedAt: 0,
    refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const dailyQuery = useQuery({
    ...dailyStatsQuery(30),
    initialData: initialDailyStats,
    initialDataUpdatedAt: 0,
    refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const monthlyQuery = useQuery({
    ...monthlyStatsQuery(),
    initialData: initialMonthlyStats,
    initialDataUpdatedAt: 0,
    refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const queries = [statsQuery, dailyQuery, monthlyQuery];
  const connectionStatus = hasHydrated
    ? getConnectionStatus({
        isError: queries.some((query) => query.isError),
        isFetching: queries.some((query) => query.isFetching),
        isSuccess: queries.every((query) => query.isSuccess),
      })
    : "connecting";

  const data = statsQuery.data
    ? buildFromPrecomputed(
        statsQuery.data,
        dailyQuery.data ?? [],
        monthlyQuery.data ?? emptyMonthlyStats,
      )
    : emptyData;

  return <AnalyticsPage data={data} connectionStatus={connectionStatus} />;
}

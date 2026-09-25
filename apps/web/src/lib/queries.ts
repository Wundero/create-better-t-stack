"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import {
  fetchAnalyticsStats,
  fetchDailyStats,
  fetchGithubStats,
  fetchMonthlyStats,
  fetchNpmStats,
  fetchRecentEvents,
  fetchShowcaseProjects,
  fetchTweets,
  fetchVideos,
} from "@/lib/api-client";

const POLL_INTERVAL_MS = 30_000;

export const analyticsStatsQuery = () =>
  queryOptions({
    queryKey: ["analytics", "stats"],
    queryFn: () => fetchAnalyticsStats(),
    staleTime: POLL_INTERVAL_MS,
  });

export const dailyStatsQuery = (days = 30) =>
  queryOptions({
    queryKey: ["analytics", "daily", days],
    queryFn: () => fetchDailyStats(days),
    staleTime: POLL_INTERVAL_MS,
  });

export const monthlyStatsQuery = () =>
  queryOptions({
    queryKey: ["analytics", "monthly"],
    queryFn: () => fetchMonthlyStats(),
    staleTime: 5 * 60_000,
  });

export const recentEventsQuery = (limit = 20, enabled = true) =>
  queryOptions({
    queryKey: ["analytics", "recent", limit],
    queryFn: () => fetchRecentEvents(limit),
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  });

export const showcaseQuery = () =>
  queryOptions({
    queryKey: ["showcase"],
    queryFn: () => fetchShowcaseProjects(),
    staleTime: 5 * 60_000,
  });

export const videosQuery = () =>
  queryOptions({
    queryKey: ["videos"],
    queryFn: () => fetchVideos(),
    staleTime: 30 * 60_000,
  });

export const tweetsQuery = () =>
  queryOptions({
    queryKey: ["tweets"],
    queryFn: () => fetchTweets(),
    staleTime: 30 * 60_000,
  });

export const githubStatsQuery = (name: string) =>
  queryOptions({
    queryKey: ["stats", "github", name],
    queryFn: () => fetchGithubStats(name),
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

export const npmStatsQuery = (names: readonly string[]) =>
  queryOptions({
    queryKey: ["stats", "npm", [...names]],
    queryFn: () => fetchNpmStats(names),
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

export function useAnalyticsStats() {
  return useQuery(analyticsStatsQuery());
}

export function useDailyStats(days = 30) {
  return useQuery(dailyStatsQuery(days));
}

export function useMonthlyStats() {
  return useQuery(monthlyStatsQuery());
}

export function useRecentEvents(limit = 20, enabled = true) {
  return useQuery(recentEventsQuery(limit, enabled));
}

export function useShowcaseProjects() {
  return useQuery(showcaseQuery());
}

export function useVideos() {
  return useQuery(videosQuery());
}

export function useTweets() {
  return useQuery(tweetsQuery());
}

export function useGithubStats(name: string) {
  return useQuery(githubStatsQuery(name));
}

export function useNpmStats(names: readonly string[]) {
  return useQuery(npmStatsQuery(names));
}

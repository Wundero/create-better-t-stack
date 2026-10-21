import type { Metadata } from "next";

import {
  fetchAnalyticsStats,
  fetchDailyStats,
  fetchMonthlyStats,
  fetchWithFallback,
  type MonthlyStats,
} from "@/lib/api-client";
import { SITE_URL } from "@/lib/site";

import { AnalyticsClient } from "./analytics-client";

const EMPTY_MONTHLY_STATS: MonthlyStats = { monthly: [], firstDate: null, lastDate: null };

export const metadata: Metadata = {
  title: "Analytics - Better-T-Stack",
  description: "Convex-backed project creation analytics for Better-T-Stack.",
  alternates: {
    canonical: "/analytics",
  },
  openGraph: {
    title: "Analytics - Better-T-Stack",
    description: "Convex-backed project creation analytics for Better-T-Stack.",
    url: `${SITE_URL}/analytics`,
    images: [
      {
        url: `${SITE_URL}/og/site/analytics.png`,
        width: 1200,
        height: 630,
        alt: "Better-T-Stack Convex Analytics",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Analytics - Better-T-Stack",
    description: "Convex-backed project creation analytics for Better-T-Stack.",
    images: [`${SITE_URL}/og/site/analytics.png`],
  },
};

export default async function Analytics() {
  const [initialStats, initialDailyStats, initialMonthlyStats] = await Promise.all([
    fetchWithFallback(() => fetchAnalyticsStats({ cache: "no-store" }), null),
    fetchWithFallback(() => fetchDailyStats(30, { cache: "no-store" }), []),
    fetchWithFallback(() => fetchMonthlyStats({ cache: "no-store" }), EMPTY_MONTHLY_STATS),
  ]);

  return (
    <AnalyticsClient
      initialStats={initialStats}
      initialDailyStats={initialDailyStats}
      initialMonthlyStats={initialMonthlyStats}
    />
  );
}

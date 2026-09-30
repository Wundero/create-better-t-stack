export const dynamic = "force-static";

import type { Metadata } from "next";

import { fetchAnalyticsStats, fetchWithFallback } from "@/lib/api-client";
import { SITE_URL } from "@/lib/site";
import { fetchSponsors } from "@/lib/sponsors";

import { SponsorsPage } from "./_components/sponsors-page";

export const metadata: Metadata = {
  title: "Sponsors - Better-T-Stack",
  description: "The companies and developers funding Better-T-Stack development",
  alternates: {
    canonical: "/sponsors",
  },
  openGraph: {
    title: "Sponsors - Better-T-Stack",
    description: "The companies and developers funding Better-T-Stack development",
    url: `${SITE_URL}/sponsors`,
    images: [
      {
        url: `${SITE_URL}/og/site/sponsors.png`,
        width: 1200,
        height: 630,
        alt: "Better-T-Stack Sponsors",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sponsors - Better-T-Stack",
    description: "The companies and developers funding Better-T-Stack development",
    images: [`${SITE_URL}/og/site/sponsors.png`],
  },
};

export default async function Sponsors() {
  const [sponsorsData, stats] = await Promise.all([
    fetchSponsors(),
    fetchWithFallback(() => fetchAnalyticsStats({ cache: "force-cache" }), null),
  ]);
  return <SponsorsPage sponsorsData={sponsorsData} totalProjects={stats?.totalProjects ?? 0} />;
}

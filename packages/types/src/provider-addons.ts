import type { Addons, DatabaseSetup, ServerDeploy, WebDeploy } from "./types";

/**
 * Provider-scoped addons. These are selected by a dedicated prompt stage (a
 * later PR) rather than the generic addon picker, and are gated by the deploy
 * target / database setup that can actually host them.
 */
export const PROVIDER_ADDONS = [
  "cloudflare-durable-objects",
  "cloudflare-containers",
  "cloudflare-sandboxes",
  "cloudflare-r2",
  "cloudflare-kv",
  "cloudflare-queues",
  "cloudflare-workers-ai",
  "cloudflare-ai-search",
  "cloudflare-flagship",
  "cloudflare-pipelines",
  "cloudflare-stream",
  "cloudflare-realtime-kit",
  "aws-lambda-microvm",
  "aws-s3",
  "aws-bedrock",
  "aws-sns",
  "aws-sqs",
  "aws-kinesis",
  "aws-eventbridge",
  "aws-scheduler",
  "aws-cloudfront",
  "aws-elasticache",
  "fly-sprites",
  "fly-redis",
  "fly-tigris",
  "railway-redis",
  "railway-buckets",
  "railway-sandboxes",
  "neon-ai-gateway",
  "neon-buckets",
  "prisma-buckets",
] as const satisfies readonly Addons[];

export type ProviderAddon = (typeof PROVIDER_ADDONS)[number];

export type ProviderAddonProvider = "cloudflare" | "aws" | "fly" | "railway" | "neon" | "prisma";

export interface ProviderAddonMeta {
  id: ProviderAddon;
  label: string;
  hint: string;
  provider: ProviderAddonProvider;
  iconSlug: string;
  color: string;
}

export interface ProviderAddonAvailabilityConfig {
  webDeploy?: WebDeploy;
  serverDeploy?: ServerDeploy;
  dbSetup?: DatabaseSetup;
}

const PROVIDER_ADDON_COLORS = {
  cloudflare: "from-orange-500 to-orange-700",
  aws: "from-amber-500 to-amber-700",
  fly: "from-violet-500 to-violet-700",
  railway: "from-slate-500 to-slate-700",
  neon: "from-emerald-500 to-emerald-700",
  prisma: "from-indigo-500 to-indigo-700",
} satisfies Record<ProviderAddonProvider, string>;

type ProviderAddonData = Pick<ProviderAddonMeta, "label" | "hint" | "provider">;

const PROVIDER_ADDON_DATA = {
  "cloudflare-durable-objects": {
    label: "Durable Objects",
    hint: "Stateful edge actors",
    provider: "cloudflare",
  },
  "cloudflare-containers": {
    label: "Containers",
    hint: "Run containers on Cloudflare",
    provider: "cloudflare",
  },
  "cloudflare-sandboxes": {
    label: "Sandboxes",
    hint: "Run untrusted code in isolated containers",
    provider: "cloudflare",
  },
  "cloudflare-r2": { label: "R2", hint: "S3-compatible object storage", provider: "cloudflare" },
  "cloudflare-kv": {
    label: "KV",
    hint: "Global low-latency key-value store",
    provider: "cloudflare",
  },
  "cloudflare-queues": {
    label: "Queues",
    hint: "Durable message queues for Workers",
    provider: "cloudflare",
  },
  "cloudflare-workers-ai": {
    label: "Workers AI",
    hint: "Run AI models on Cloudflare via the Vercel AI SDK",
    provider: "cloudflare",
  },
  "cloudflare-ai-search": {
    label: "AI Search",
    hint: "Managed RAG search over an R2 bucket",
    provider: "cloudflare",
  },
  "cloudflare-flagship": {
    label: "Flagship",
    hint: "Feature flags evaluated at the edge",
    provider: "cloudflare",
  },
  "cloudflare-pipelines": {
    label: "Pipelines",
    hint: "Streaming ingest into R2",
    provider: "cloudflare",
  },
  "cloudflare-stream": {
    label: "Stream",
    hint: "Video streaming and live input",
    provider: "cloudflare",
  },
  "cloudflare-realtime-kit": {
    label: "RealtimeKit",
    hint: "Real-time audio/video apps",
    provider: "cloudflare",
  },
  "aws-lambda-microvm": {
    label: "Lambda MicroVMs",
    hint: "Isolated microVMs for running untrusted code",
    provider: "aws",
  },
  "aws-s3": { label: "S3", hint: "Object storage", provider: "aws" },
  "aws-bedrock": {
    label: "Bedrock",
    hint: "Managed foundation models via the Vercel AI SDK",
    provider: "aws",
  },
  "aws-sns": { label: "SNS", hint: "Pub/sub notifications", provider: "aws" },
  "aws-sqs": { label: "SQS", hint: "Managed message queues", provider: "aws" },
  "aws-kinesis": { label: "Kinesis", hint: "Real-time data streams", provider: "aws" },
  "aws-eventbridge": { label: "EventBridge", hint: "Event bus and rules", provider: "aws" },
  "aws-scheduler": { label: "Scheduler", hint: "Cron and one-off schedules", provider: "aws" },
  "aws-cloudfront": { label: "CloudFront", hint: "CDN in front of S3", provider: "aws" },
  "aws-elasticache": {
    label: "ElastiCache",
    hint: "Managed Redis/Memcached",
    provider: "aws",
  },
  "fly-sprites": {
    label: "Sprites",
    hint: "Ephemeral Firecracker sandboxes",
    provider: "fly",
  },
  "fly-redis": { label: "Fly Redis", hint: "Managed Redis (Upstash)", provider: "fly" },
  "fly-tigris": { label: "Tigris", hint: "S3-compatible object storage", provider: "fly" },
  "railway-redis": { label: "Railway Redis", hint: "Managed Redis", provider: "railway" },
  "railway-buckets": {
    label: "Railway Buckets",
    hint: "S3-compatible object storage",
    provider: "railway",
  },
  "railway-sandboxes": {
    label: "Railway Sandboxes",
    hint: "Ephemeral sandboxes for untrusted code",
    provider: "railway",
  },
  "neon-ai-gateway": {
    label: "Neon AI Gateway",
    hint: "OpenAI-compatible AI gateway via the Vercel AI SDK",
    provider: "neon",
  },
  "neon-buckets": { label: "Neon Buckets", hint: "S3-compatible object storage", provider: "neon" },
  "prisma-buckets": {
    label: "Prisma Buckets",
    hint: "S3-compatible object storage",
    provider: "prisma",
  },
} satisfies Record<ProviderAddon, ProviderAddonData>;

function providerAddonMeta(id: ProviderAddon): ProviderAddonMeta {
  const data = PROVIDER_ADDON_DATA[id];
  return { ...data, id, iconSlug: id, color: PROVIDER_ADDON_COLORS[data.provider] };
}

export const PROVIDER_ADDON_META: Record<ProviderAddon, ProviderAddonMeta> = Object.assign(
  {},
  ...PROVIDER_ADDONS.map((id) => ({ [id]: providerAddonMeta(id) })),
);

export const PROVIDER_ADDON_PROVIDER: Record<ProviderAddon, ProviderAddonProvider> = Object.assign(
  {},
  ...PROVIDER_ADDONS.map((id) => ({ [id]: PROVIDER_ADDON_DATA[id].provider })),
);

const PROVIDER_ADDON_IDS: readonly Addons[] = PROVIDER_ADDONS;

export function isProviderAddon(addon: Addons): addon is ProviderAddon {
  return PROVIDER_ADDON_IDS.some((value) => value === addon);
}

type ProviderAddonAvailabilityCheck = (config: ProviderAddonAvailabilityConfig) => boolean;

const PROVIDER_ADDON_AVAILABILITY = {
  cloudflare: (config) => config.webDeploy === "cloudflare" || config.serverDeploy === "cloudflare",
  aws: (config) => config.serverDeploy === "aws",
  fly: (config) => config.serverDeploy === "fly",
  railway: (config) => config.serverDeploy === "railway",
  neon: (config) => config.serverDeploy === "neon",
  prisma: (config) => config.serverDeploy === "prisma" || config.dbSetup === "prisma-postgres",
} satisfies Record<ProviderAddonProvider, ProviderAddonAvailabilityCheck>;

export function isProviderAddonAvailable(
  addon: ProviderAddon,
  config: ProviderAddonAvailabilityConfig,
): boolean {
  return PROVIDER_ADDON_AVAILABILITY[PROVIDER_ADDON_META[addon].provider](config);
}

export function getProviderAddonsFor(config: ProviderAddonAvailabilityConfig): ProviderAddon[] {
  return PROVIDER_ADDONS.filter((addon) => isProviderAddonAvailable(addon, config));
}

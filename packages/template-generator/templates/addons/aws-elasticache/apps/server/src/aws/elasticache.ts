import Redis from "ioredis";

export function createCacheClient() {
  return new Redis({
    host: process.env.ELASTICACHE_HOST!,
    port: Number(process.env.ELASTICACHE_PORT ?? 6379),
    tls: process.env.ELASTICACHE_TLS === "true" ? {} : undefined,
    maxRetriesPerRequest: 2,
  });
}

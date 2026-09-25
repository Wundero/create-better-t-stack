# Backend migration: Convex → Cloudflare Worker

This package used to host the better-t-stack website API on Convex. It now runs
as a Cloudflare Worker (`Hono` + D1 + KV + Cron) under the `api.create.1d.gg`
route. The `convex/` directory has been deleted; this note records where each
piece went.

> The `convex` **backend option offered by the CLI to generated projects** is
> unrelated and untouched — this migration only affects the repo's own hosting.

## Mapping

| Convex | Worker |
| --- | --- |
| `convex/analytics_helpers.ts` | `src/analytics/helpers.ts` (verbatim behaviour) |
| `convex/analytics_date_utils.ts` | `src/analytics/date-utils.ts` (verbatim) |
| `convex/schema.ts` | `migrations/0001_init.sql` |
| `convex/analytics.ts` `ingestEvent` | `src/analytics/ingest.ts` (optimistic `version` CAS) |
| `convex/analytics.ts` queries | `src/routes/analytics.ts` + `src/db/analytics.ts` |
| `convex/http.ts` (ingest + 16 KiB cap) | `src/routes/analytics.ts` |
| `convex/showcase.ts`, `testimonials.ts` | `src/routes/content.ts` + `src/db/content.ts` |
| `convex/stats.ts` (`@erquhart/convex-oss-stats`) | `src/oss-stats.ts` + `scheduled()` → KV |
| `convex/analytics.ts` quarantine/repair actions | `POST /api/admin/quarantine` (token-gated) + `scripts/migrate-convex.ts` |

## Decisions

- **Optimistic concurrency.** D1 has no interactive transactions across awaits,
  so the single aggregate row carries a `version`. Ingest writes `version + 1`
  guarded by `WHERE version = ?` and retries on conflict (up to 8 attempts).
- **Admin routes fail closed.** `/api/admin/*` returns `404` unless
  `ADMIN_TOKEN` is configured, and then requires `Authorization: Bearer <token>`.
  There are no unauthenticated destructive routes.
- **OSS stats.** The GitHub webhook component is replaced by a 6-hourly Cron
  trigger that refreshes `github:<owner/repo>` and `npm:<pkg>` KV keys. Reads
  return zeros while the cache is cold.
- **Content data.** No seed exists in the repo, so `scripts/seed/*.json` ship as
  empty arrays. Use `scripts/migrate-convex.ts` against a `convex export` dump to
  carry historical data (analytics events are re-aggregated; content rows keep
  their original `_creationTime`).

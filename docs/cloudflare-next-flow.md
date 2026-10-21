# create.1d.gg on Cloudflare — operator runbook (draft)

Everything runs on Cloudflare. No Convex. Two Workers:

| Worker    | App                                                  | Domain             | Config                            |
| --------- | ---------------------------------------------------- | ------------------ | --------------------------------- |
| `bts-web` | `apps/web` (Next.js 16 via `@opennextjs/cloudflare`) | `create.1d.gg`     | `apps/web/wrangler.jsonc`         |
| `bts-api` | `packages/backend` (Hono + D1 + KV + Cron)           | `api.create.1d.gg` | `packages/backend/wrangler.jsonc` |

Deployed by `.github/workflows/deploy-next.yml` on every push to `next`.
`next` is populated by `.github/workflows/aggregate-next.yml` (lives on fork `main`).

## 0. Plan requirement (important)

The Worker script gzips to ~7 MB (ts-morph + embedded TypeScript). Cloudflare's **free** limit is 3 MiB → **you need the Workers Paid plan**. Static `ASSETS` don't count toward the script limit. Removing `ts-morph` from the request path (Stage 2) would cut the size substantially.

## 1. Cloudflare resources (one-time)

```bash
cd packages/backend
bunx wrangler d1 create bts-analytics        # copy database_id  -> wrangler.jsonc d1_databases[].database_id
bunx wrangler kv namespace create OSS_STATS_KV   # copy id      -> wrangler.jsonc kv_namespaces[].id
```

Replace the placeholder ids in `packages/backend/wrangler.jsonc`.

## 2. Cloudflare API token

Dashboard → My Profile → API Tokens → Create Token → Custom:

- Account · **Workers Scripts: Edit**
- Account · **Workers Routes: Edit** (needed for `custom_domain`)
- Account · **D1: Edit**
- Account · **Workers KV Storage: Edit**
- Zone (`1d.gg`) · **Workers Routes: Edit**

Set repo secrets on `Wundero/create-better-t-stack`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` (Workers & Pages → Account Details)

## 3. Sync token (so pushes to `next` fire the deploy workflow)

`GITHUB_TOKEN` pushes do **not** trigger other workflows. Create a fine-grained PAT
(or GitHub App token) with `contents: write` + `pull-requests: write` on the fork and set:

- `NEXT_SYNC_TOKEN`

## 4. Domains

Both use Worker custom domains (`custom_domain: true` in wrangler), so `1d.gg` must be a
Cloudflare zone on the same account. Cloudflare creates the DNS records + certs automatically.

- `create.1d.gg` → `bts-web`
- `api.create.1d.gg` → `bts-api`

If you'd rather point the web worker at a different domain, edit the `routes` block in
`apps/web/wrangler.jsonc`. Also update `apps/web/src/lib/site.ts` (`SITE_URL`) and
`apps/web/public/robots.txt` so canonical/OG/sitemap URLs match.

## 5. First deploy

Push to `next`, or run **Actions → Deploy next (Cloudflare) → Run workflow**.
Order inside the workflow: `wrangler d1 migrations apply` → deploy `bts-api` → build web
(force-static pages fetch from the API at build time) → deploy `bts-web`.

## 6. Ongoing flow

- `aggregate-next.yml` (on fork `main`, every 6h + on PR events) local-merges every open
  PR targeting `main` into `next`, resolving what it can; conflicts are reported in the job
  summary (never force-pushed). It pushes `next` with `NEXT_SYNC_TOKEN`, which triggers deploy.
- Your PRs are **never closed** — the aggregator only reads their commits.
- New work: open a PR to `main` as usual; it lands in `next` automatically.

## Notes / caveats

- `handlebars` is precompiled at build time and rendered via `handlebars/runtime`
  (workerd forbids `new Function`). Do not re-add `handlebars` to `serverExternalPackages`.
- `ts-morph` runs fine on workerd (measured), but is large — Stage 2 (template-driven
  auth/PWA) would shrink the bundle.
- `/api/rpc/preview` (Stack Builder) runs the generator in-process; no child process/disk.
- Cold KV (`/api/stats/github|npm`) returns zeros until the 6-hourly Cron populates it.

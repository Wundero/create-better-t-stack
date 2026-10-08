# npm preview publishing (`@wundero/bts`)

This document is the operator runbook for the preview publish pipeline that ships the
Better-T-Stack CLI to npm as **`@wundero/bts`** from the **`next`** branch.

- Workflow: [`.github/workflows/publish-preview.yml`](../.github/workflows/publish-preview.yml)
- Staging logic: [`scripts/preview-publish-lib.ts`](../scripts/preview-publish-lib.ts)
- CLI entry: [`scripts/preview-publish.ts`](../scripts/preview-publish.ts)
- Unit tests: [`scripts/preview-publish.test.ts`](../scripts/preview-publish.test.ts)

## Version scheme

```
@wundero/bts@<baseVersion>-preview-<YYYYMMDD>-<shortSha>
```

Example: `3.44.1-preview-20260929-abc1234`.

- `<baseVersion>` is the `version` from `apps/cli/package.json` (e.g. `3.44.1`).
- `<YYYYMMDD>` is the UTC build date (override with `PREVIEW_DATE=YYYY-MM-DD`).
- `<shortSha>` is the first 7 characters of the commit (override with `SHORT_SHA`, or
  `GITHUB_SHA` in CI — the workflow passes the checkout's `github.sha`).
- Every commit therefore produces a unique, immutable, valid npm semver prerelease.

Previews are published to the **`latest`** dist-tag on purpose, so:

```
@wundero/bts@latest == newest preview from next
```

This is an intentional deviation from the usual "previews go to a `next`/`canary` tag"
convention: consumers always install the freshest `next` build with an unqualified
`@latest` spec.

## One-time operator setup

1. **Own the `@wundero` scope.** The npm org (or user) `@wundero` must exist and the
   publishing account must be allowed to publish scoped packages under it.
   Scoped packages require `publishConfig.access = "public"` — the staging script sets
   this automatically.

2. **Configure a GitHub Actions trusted publisher** for `@wundero/bts`:
   - On [npmjs.com](https://www.npmjs.com) open the `@wundero/bts` package settings →
     **Trusted Publisher** → **GitHub Actions**.
   - If the package does not exist yet, use **"Add trusted publisher"** for a pending
     package (npm supports registering the publisher before the first publish).
   - Repository: `Wundero/create-better-t-stack`
   - Workflow filename: `publish-preview.yml`
   - Environment: **leave empty** (the workflow declares no `environment`). If you do set
     an environment name, you **must** add `environment: <name>` to the job in
     `publish-preview.yml` or authentication will fail.

3. **Confirm repo permissions.** The workflow already requests `id-token: write` at the
   job level and `contents: read` at the top level. No repository secrets are needed —
   there is deliberately **no `NPM_TOKEN`**.

4. **Runner + repo requirements.** Provenance requires a **public** repository and a
   **GitHub-hosted** runner (`runs-on: ubuntu-latest`). The npm CLI version must be
   **≥ 11.5.1**; `actions/setup-node@v7` with `node-version-file: package.json`
   (`engines.node: 24.x`) bundles a compatible npm.

5. Do **not** create `NPM_TOKEN` or any npm token secret. Authentication is OIDC-only.

## What the workflow does

1. Triggers on `push` to `next` (and manual `workflow_dispatch`).
2. Checks out with `persist-credentials: false` and `fetch-depth: 0`.
3. Sets up Node (24.x via `package.json`) and Bun (`bun-version-file: package.json`).
4. `bun install --frozen-lockfile`, then `bun run build:cli`.
5. Runs `bun run scripts/preview-publish.ts --out "$RUNNER_TEMP/preview-package"`, which:
   - computes the preview version,
   - copies `apps/cli`'s manifest + built `dist/` into the temp dir,
   - rewrites `name` → `@wundero/bts`, `version` → preview version,
   - rewrites any `workspace:*`/`catalog:` dependency to a concrete `^<baseVersion>` range,
   - bundles the built `@better-t-stack/types` and `@better-t-stack/template-generator`
     packages into the tarball's `node_modules` (`bundleDependencies`) so the preview
     ships `next`'s versions instead of the divergent stable releases on npm,
   - merges the bundled packages' dependencies into the staged manifest so their
     transitive deps (for example `memfs`, `pathe`) install for consumers,
   - sets `publishConfig.access = "public"`.
6. Skips the publish if `npm view "@wundero/bts@<version>" version` already resolves
   (prevents duplicate-publish failures on re-runs).
7. Publishes from the staged directory:
   `npm publish --provenance --access public --tag latest`.

The workflow writes the published version to the GitHub Actions step summary.

## Verifying a preview

```bash
# The published version and its dist-tags:
npm view @wundero/bts version dist-tags

# What `@latest` currently resolves to:
npm view @wundero/bts@latest

# Full manifest, including the provenance attestation URL:
npm view @wundero/bts@<version> --json
```

The **provenance badge** on the package page (`https://www.npmjs.com/package/@wundero/bts`)
should show the `publish-preview.yml` workflow and the source commit.

Local dry run without publishing:

```bash
export PATH="/home/sam/.local/share/fnm/node-versions/v24.16.0/installation/bin:$PATH"
bun run build:cli
PREVIEW_DATE=20260929 GITHUB_SHA=$(git rev-parse HEAD) \
  bun run scripts/preview-publish.ts --out /tmp/bts-preview-stage
cd /tmp/bts-preview-stage && npm pack --dry-run --json
```

The tarball filename is `wundero-bts-<version>.tgz`.

## Rollback / deprecating a preview

Previews are cheap and immutable — prefer publishing a newer preview over mutating one.

```bash
# Mark a bad preview as deprecated (keeps it installable but warns):
npm deprecate "@wundero/bts@<version>" "Broken preview; use a newer @wundero/bts@latest"

# Point `latest` back at a known-good preview:
npm dist-tag add "@wundero/bts@<good-version>" latest
```

To stop future publishes, remove or disable the **Trusted Publisher** entry on npmjs.com,
or disable the workflow in the GitHub Actions UI. Do not delete the package unless the
scope is being retired.

## Notes

- This pipeline is **additive**: it does not touch `.github/workflows/release.yaml`
  (upstream `create-better-t-stack` publishing) or the CLI package identity in
  `apps/cli/package.json`.
- The preview **bundles the workspace packages** (`@better-t-stack/types`,
  `@better-t-stack/template-generator`) rather than resolving them from npm. `next`
  carries features that are not in the published stable packages, so an externalized
  workspace dependency would float to a stable version missing `next`'s exports (for
  example `ALL_PAYMENT_IDS`) and fail at import time.
- The website renders install commands as `bunx/npx/pnpm dlx @wundero/bts@latest`
  (see `apps/web/src/lib/cli-commands.ts`). Scoped packages cannot use `npm create`.

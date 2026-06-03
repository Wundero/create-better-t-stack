# Plan: Use Root `.dev.vars` And Explicit Cloudflare Env Bindings

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/787

## Problem

Cloudflare Workers do not receive arbitrary `.env` values at runtime. Values must be provided through Worker bindings, local dev vars, secrets, or deploy-time vars. The issue describes multiple failures caused by generated templates spreading env files across `apps/web`, `apps/server`, and `packages/*`, then relying on cwd-specific dotenv behavior.

The proposed direction is:

- Use one repo-root `.dev.vars` for local Cloudflare development.
- Pass that file explicitly to Wrangler/Alchemy workflows.
- Add a Node-only helper for tools like Drizzle Kit and Alchemy config generation.
- Keep Wrangler config values as safe placeholders and inject real values explicitly.

## Current Repo Surface

Relevant templates and processors:

- `packages/template-generator/templates/packages/infra/alchemy.run.ts.hbs`
- `packages/template-generator/templates/packages/env/src/cloudflare-local.ts.hbs`
- `packages/template-generator/templates/packages/env/src/server.ts.hbs`
- `packages/template-generator/src/processors/env-vars.ts`
- `packages/template-generator/src/processors/alchemy-plugins.ts`
- `packages/template-generator/src/processors/deploy-deps.ts`
- `packages/template-generator/src/post-process/package-configs.ts`
- `apps/cli/src/helpers/core/post-installation.ts`

Cloudflare-related tests already exist in:

- `apps/cli/test/cloudflare-db-clients.test.ts`

## Proposed Fix

Introduce a Cloudflare env model for generated projects:

1. Root `.dev.vars.example` or `.dev.vars` template containing all local Cloudflare vars.
2. Root `.dev.vars*` ignored in generated `.gitignore`.
3. A `packages/env/src/dev-vars.ts` or `scripts/read-dev-vars.ts` helper that merges:
   - selected `.dev.vars` file,
   - optional `DEV_VARS` dotenv string,
   - `process.env`.
4. Cloudflare dev scripts pass the root `.dev.vars` path explicitly.
5. Alchemy config loads the same helper before any `alchemy.env` or `alchemy.secret.env` access.
6. Generated Worker bindings remain explicit in Alchemy and Wrangler config.

## Recommended Helper

Add a Node-only helper, not imported by Worker runtime code:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

export function readDevVars(file = ".dev.vars", envName?: string) {
  const basePath = resolve(process.cwd(), file);
  const envPath =
    envName && existsSync(`${basePath}.${envName}`) ? `${basePath}.${envName}` : basePath;

  const fileEnv = existsSync(envPath) ? parse(readFileSync(envPath, "utf8")) : {};
  const inlineEnv = process.env.DEV_VARS ? parse(process.env.DEV_VARS) : {};

  return { ...fileEnv, ...inlineEnv, ...process.env };
}
```

For Alchemy, prefer a path relative to `packages/infra`:

```ts
Object.assign(process.env, readDevVars("../../.dev.vars"));
```

## Implementation Steps

1. Update env file generation in `processEnvVariables` to write Cloudflare vars into root `.dev.vars.example` or `.dev.vars` instead of app-local files for Cloudflare deploy targets.
2. Add `.dev.vars*` to generated root `.gitignore`.
3. Add a Node helper template for reading `.dev.vars`, `DEV_VARS`, and `process.env`.
4. Update `alchemy.run.ts.hbs` to call the helper before reading `alchemy.env` or `alchemy.secret.env`.
5. Update Wrangler scripts/config generation to explicitly pass the root `.dev.vars` file.
6. Update `packages/env/src/cloudflare-local.ts.hbs` to use the same helper or equivalent behavior.
7. Update Drizzle config plans from #765 to consume this helper for Cloudflare projects.
8. Update post-installation output to explain the root `.dev.vars` workflow.
9. Regenerate `packages/template-generator/src/templates.generated.ts`.

## Binding Strategy

For each Worker, define all expected runtime values explicitly:

- Public frontend URL vars.
- Server URL vars.
- Auth vars.
- Database vars or resource bindings.
- Payment vars.
- AI/API vars.

Use secrets for sensitive values:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `POLAR_ACCESS_TOKEN`
- provider API keys

Use plain vars for non-secret values:

- `CORS_ORIGIN`
- `BETTER_AUTH_URL`
- public frontend/backend URLs

## Tests

Add tests that generate Cloudflare combinations and assert:

- root `.dev.vars*` is ignored.
- Cloudflare projects get root `.dev.vars.example` or equivalent sample content.
- `alchemy.run.ts` imports and invokes the dev-vars helper before `alchemy.env`.
- Drizzle Cloudflare config does not rely on `../../apps/server/.env`.
- Worker runtime code reads bindings from Worker `env`, not `process.env`.
- Non-Cloudflare generated projects keep existing env behavior.

## Risk Notes

- Wrangler resolves env files relative to the config path in some workflows; use absolute paths or config-relative paths.
- Environment-specific `.dev.vars.<env>` behavior can be exclusive rather than merged depending on Wrangler behavior. Do not assume base `.dev.vars` always merges.
- Alchemy is not Cloudflare itself and needs explicit process env preload.

## References

- Issue #787: https://github.com/AmanVarshney01/create-better-t-stack/issues/787
- Cloudflare environment variables: https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare local env vars and secrets: https://developers.cloudflare.com/workers/local-development/environment-variables/
- Cloudflare bindings overview: https://developers.cloudflare.com/workers/configuration/bindings/

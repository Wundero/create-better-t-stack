# Plan: Fix Drizzle Config Env Loading

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/765

## Problem

Generated Drizzle configs currently import `dotenv`, load app-specific `.env` files by relative path, and then read `process.env.DATABASE_URL`. The issue proposes using the generated env package instead:

```ts
import { env } from "@<project>/env/server";

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
```

This removes brittle cwd assumptions like `../../apps/web/.env` versus `../../apps/server/.env`.

## Current Repo Surface

Drizzle config templates:

- `packages/template-generator/templates/db/drizzle/postgres/drizzle.config.ts.hbs`
- `packages/template-generator/templates/db/drizzle/mysql/drizzle.config.ts.hbs`
- `packages/template-generator/templates/db/drizzle/sqlite/drizzle.config.ts.hbs`

Env package templates and export post-processing:

- `packages/template-generator/templates/packages/env/src/server.ts.hbs`
- `packages/template-generator/templates/packages/env/package.json.hbs`
- `packages/template-generator/src/post-process/package-configs.ts`

Drizzle scripts are added in:

- `packages/template-generator/src/post-process/package-configs.ts`

## Proposed Fix

For non-Cloudflare Node tooling paths, switch Drizzle config templates from direct `dotenv` loading to the generated env package.

Target for Postgres:

```ts
import { defineConfig } from "drizzle-kit";
import { env } from "@{{projectName}}/env/server";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
```

Apply equivalent changes to MySQL and SQLite where the selected setup uses `DATABASE_URL`.

## Cloudflare Coordination

Do not blindly import `@{{projectName}}/env/server` in Drizzle configs when that export resolves to `cloudflare:workers`. Drizzle Kit runs in Node, not inside a Worker.

Handle this with the #787 env plan:

- Add a Node-safe dev env reader for Cloudflare-generated workspaces.
- Either expose a Node-safe `@{{projectName}}/env/dev` or `@{{projectName}}/env/tooling` export, or keep Drizzle configs importing `readDevVars` directly.
- Make Cloudflare Drizzle configs read repo-root `.dev.vars`, `DEV_VARS`, and `process.env`.

Recommended split:

- Non-Cloudflare templates use `@{{projectName}}/env/server`.
- Cloudflare templates use a Node tooling helper until `@{{projectName}}/env/server` can safely branch outside Workers.

## Implementation Steps

1. Update Postgres/MySQL/SQLite Drizzle config templates to remove direct `dotenv` imports for non-Cloudflare output.
2. Add a conditional branch for Cloudflare output that uses the shared dev-vars helper from #787.
3. Ensure `packages/env/package.json` exports the server env path before Drizzle imports it.
4. Confirm `packages/db/package.json` depends on `@{{projectName}}/env` through workspace dependency processing.
5. Regenerate `packages/template-generator/src/templates.generated.ts`.
6. Update tests for generated Drizzle configs.

## Tests

Add cases for:

- Drizzle + Postgres + Hono/Node generates `import { env } from "@<project>/env/server"`.
- Drizzle + MySQL generates env package usage for all DB credential fields.
- Drizzle + SQLite non-D1 keeps valid local config behavior.
- Drizzle + D1/Cloudflare does not import `cloudflare:workers` from a Node-run Drizzle config.
- Generated package graph includes the env package dependency needed by `packages/db`.

Likely test files:

- `apps/cli/test/db.test.ts`
- `apps/cli/test/cloudflare-db-clients.test.ts`

## Risk Notes

- `drizzle-kit` must be able to load TypeScript workspace imports from the generated monorepo.
- The env package currently uses `dotenv/config` for non-Cloudflare paths, so it may still load only cwd `.env`. That is acceptable for non-Cloudflare if env files are where commands run, but #787 should centralize this for Cloudflare.
- This fix should not obscure missing `DATABASE_URL`; env validation should fail clearly.

## References

- Issue #765: https://github.com/AmanVarshney01/create-better-t-stack/issues/765
- Related env consolidation issue #787: https://github.com/AmanVarshney01/create-better-t-stack/issues/787
- Drizzle config template: `packages/template-generator/templates/db/drizzle/postgres/drizzle.config.ts.hbs`

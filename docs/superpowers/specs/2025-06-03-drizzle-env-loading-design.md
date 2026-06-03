# Drizzle Config Environment Loading Design

## Goal

Fix generated Drizzle configs by replacing brittle `dotenv` cwd-relative `.env` loading with imports from the generated env package or a shared dev-vars helper for Cloudflare projects.

---

## Background

Generated Drizzle configs currently import `dotenv`, load app-specific `.env` files by relative path, and then read `process.env.DATABASE_URL`. This breaks when commands run from a different directory. The issue proposes using the generated env package instead.

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/765

---

## 1. Risk and Constraints

- `drizzle-kit` must be able to load TypeScript workspace imports from the generated monorepo.
- The env package currently uses `dotenv/config` for non-Cloudflare paths, so it may still load only cwd `.env`. That is acceptable for non-Cloudflare if env files are where commands run, but #787 should centralize this for Cloudflare.
- This fix should not obscure missing `DATABASE_URL`; env validation should fail clearly.
- Do not blindly import `@<project>/env/server` in Drizzle configs when that export resolves to `cloudflare:workers`. Drizzle Kit runs in Node, not inside a Worker.

---

## 2. Data Model

No new schema fields. This is a template change.

---

## 3. Architecture

### 3.1 Non-Cloudflare Path

Use the generated env package directly:

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

### 3.2 Cloudflare Path (Coordinated with #787)

- Add a Node-safe dev env reader for Cloudflare-generated workspaces.
- Either expose a Node-safe `@<project>/env/dev` or `@<project>/env/tooling` export, or keep Drizzle configs importing `readDevVars` directly.
- Make Cloudflare Drizzle configs read repo-root `.dev.vars`, `DEV_VARS`, and `process.env`.

### 3.3 Recommended Split

- Non-Cloudflare templates use `@<project>/env/server`.
- Cloudflare templates use a Node tooling helper until `@<project>/env/server` can safely branch outside Workers.

---

## 4. Implementation

1. Update Postgres/MySQL/SQLite Drizzle config templates to remove direct `dotenv` imports for non-Cloudflare output.
2. Add a conditional branch for Cloudflare output that uses the shared dev-vars helper from #787.
3. Ensure `packages/env/package.json` exports the server env path before Drizzle imports it.
4. Confirm `packages/db/package.json` depends on `@<project>/env` through workspace dependency processing.
5. Regenerate `packages/template-generator/src/templates.generated.ts`.
6. Update tests for generated Drizzle configs.

---

## 5. Existing Repo Surface

### 5.1 Drizzle Config Templates

- `packages/template-generator/templates/db/drizzle/postgres/drizzle.config.ts.hbs`
- `packages/template-generator/templates/db/drizzle/mysql/drizzle.config.ts.hbs`
- `packages/template-generator/templates/db/drizzle/sqlite/drizzle.config.ts.hbs`

### 5.2 Env Package Templates

- `packages/template-generator/templates/packages/env/src/server.ts.hbs`
- `packages/template-generator/templates/packages/env/package.json.hbs`
- `packages/template-generator/src/post-process/package-configs.ts`

---

## 6. Tests

- Drizzle + Postgres + Hono/Node generates `import { env } from "@<project>/env/server"`.
- Drizzle + MySQL generates env package usage for all DB credential fields.
- Drizzle + SQLite non-D1 keeps valid local config behavior.
- Drizzle + D1/Cloudflare does not import `cloudflare:workers` from a Node-run Drizzle config.
- Generated package graph includes the env package dependency needed by `packages/db`.

Likely test files:

- `apps/cli/test/db.test.ts`
- `apps/cli/test/cloudflare-db-clients.test.ts`

---

## 7. References

- Issue #765: https://github.com/AmanVarshney01/create-better-t-stack/issues/765
- Related env consolidation issue #787: https://github.com/AmanVarshney01/create-better-t-stack/issues/787
- Drizzle config: `packages/template-generator/templates/db/drizzle/postgres/drizzle.config.ts.hbs`

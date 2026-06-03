# Cloudflare Environment Variables Injection Design

## Goal

Use one repo-root `.dev.vars` for local Cloudflare development, pass that file explicitly to Wrangler/Alchemy workflows, and add a Node-only helper for tools like Drizzle Kit and Alchemy config generation.

---

## Background

Cloudflare Workers do not receive arbitrary `.env` values at runtime. Values must be provided through Worker bindings, local dev vars, secrets, or deploy-time vars. Currently, generated templates spread env files across `apps/web`, `apps/server`, and `packages/*`, then rely on cwd-specific dotenv behavior. This causes failures when env values are missing or loaded from the wrong directory.

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/787

---

## 1. Risk and Constraints

- Wrangler resolves env files relative to the config path in some workflows; use absolute paths or config-relative paths.
- Environment-specific `.dev.vars.<env>` behavior can be exclusive rather than merged depending on Wrangler behavior.
- Alchemy is not Cloudflare itself and needs explicit process env preload.

---

## 2. Data Model

No new schema fields. This is a template and post-process change.

---

## 3. Architecture

### 3.1 Generated Dev Vars Model

1. Root `.dev.vars.example` (or `.dev.vars`) containing all local Cloudflare vars.
2. Root `.dev.vars*` ignored in generated `.gitignore`.
3. A Node helper that merges:
   - Selected `.dev.vars` file
   - Optional `DEV_VARS` dotenv string
   - `process.env`
4. Cloudflare dev scripts pass the root `.dev.vars` path explicitly.
5. Alchemy config loads the same helper before any `alchemy.env` or `alchemy.secret.env` access.
6. Generated Worker bindings remain explicit in Alchemy and Wrangler config.

### 3.2 Recommended Helper

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

---

## 4. Implementation

### 4.1 Env File Generation

Update `processEnvVariables` to write Cloudflare vars into root `.dev.vars.example` (or `.dev.vars`) instead of app-local files for Cloudflare deploy targets.

### 4.2 Gitignore

Add `.dev.vars*` to generated root `.gitignore`.

### 4.3 Node Helper Template

Add a template for `readDevVars` that is never imported by Worker runtime code.

### 4.4 Alchemy Config

Update `alchemy.run.ts.hbs` to call the helper before reading `alchemy.env` or `alchemy.secret.env`.

### 4.5 Wrangler Scripts

Update Wrangler scripts/config generation to explicitly pass the root `.dev.vars` file.

### 4.6 Cloudflare Local Env

Update `packages/env/src/cloudflare-local.ts.hbs` to use the same helper or equivalent behavior.

### 4.7 Drizzle Coordination

Update Drizzle config plans (see #765) to consume this helper for Cloudflare projects.

### 4.8 Post-Install Instructions

Update post-installation output to explain the root `.dev.vars` workflow.

---

## 5. Binding Strategy

For each Worker, define all expected runtime values explicitly:

- Public frontend URL vars
- Server URL vars
- Auth vars
- Database vars or resource bindings
- Payment vars
- AI/API vars

### 5.1 Secrets

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `POLAR_ACCESS_TOKEN`
- Provider API keys

### 5.2 Plain Vars

- `CORS_ORIGIN`
- `BETTER_AUTH_URL`
- Public frontend/backend URLs

---

## 6. Tests

- Root `.dev.vars*` is ignored in generated Cloudflare stacks.
- Cloudflare projects get root `.dev.vars.example` or equivalent sample content.
- `alchemy.run.ts` imports and invokes the dev-vars helper before `alchemy.env`.
- Drizzle Cloudflare config does not rely on `../../apps/server/.env`.
- Worker runtime code reads bindings from Worker `env`, not `process.env`.
- Non-Cloudflare generated projects keep existing env behavior.

---

## 7. References

- Issue #787: https://github.com/AmanVarshney01/create-better-t-stack/issues/787
- Cloudflare environment variables: https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare local env vars: https://developers.cloudflare.com/workers/local-development/environment-variables/
- Cloudflare bindings overview: https://developers.cloudflare.com/workers/configuration/bindings/

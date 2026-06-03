# Plan: Reduce TypeScript LSP Load With Project References

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/854

## Problem

Generated monorepos can contain many `tsconfig.json` files. Some editors and LSP setups spawn or load too much TypeScript work across those configs, causing high CPU usage. The issue proposes:

- root `tsconfig.json` references for all workspaces.
- `composite: true` for apps.
- `composite: true` and `incremental: true` for packages.

TypeScript's own guidance recommends a solution-style root config with `files: []` and `references` to leaf projects.

## Current Repo Surface

Root tsconfig template:

- `packages/template-generator/templates/base/tsconfig.json.hbs`

Workspace tsconfig templates:

- `packages/template-generator/templates/backend/server/base/tsconfig.json.hbs`
- `packages/template-generator/templates/api/trpc/server/tsconfig.json.hbs`
- `packages/template-generator/templates/api/orpc/server/tsconfig.json.hbs`
- `packages/template-generator/templates/db/base/tsconfig.json.hbs`
- `packages/template-generator/templates/auth/better-auth/server/base/tsconfig.json.hbs`
- `packages/template-generator/templates/packages/env/tsconfig.json.hbs`
- `packages/template-generator/templates/packages/ui/tsconfig.json.hbs`
- `packages/template-generator/templates/frontend/react/*/tsconfig.json.hbs`
- `packages/template-generator/templates/frontend/native/*/tsconfig.json.hbs`
- `packages/template-generator/templates/frontend/solid/tsconfig.json.hbs`
- `packages/template-generator/templates/frontend/svelte/tsconfig.json.hbs`
- `packages/template-generator/templates/frontend/astro/tsconfig.json.hbs`
- `packages/template-generator/templates/frontend/nuxt/tsconfig.json.hbs`

Some generated server/package configs already set `composite: true`, but root references are missing.

## Proposed Fix

Add a post-processor that computes generated workspace projects and writes a solution-style root `tsconfig.json`.

Target root shape:

```json
{
  "extends": "@<project>/config/tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./apps/web" },
    { "path": "./apps/server" },
    { "path": "./packages/api" },
    { "path": "./packages/auth" },
    { "path": "./packages/db" },
    { "path": "./packages/env" },
    { "path": "./packages/ui" }
  ]
}
```

Only include paths that exist in the generated VFS and have a `tsconfig.json`.

## Composite Strategy

Use a conservative split:

- Packages and server-side workspaces:
  - `composite: true`
  - `incremental: true`
  - `tsBuildInfoFile`: stable path under `node_modules/.cache/tsbuildinfo` or local `.tsbuildinfo`
- Framework app tsconfigs:
  - evaluate per framework before setting `composite`.
  - preserve framework-required `noEmit`, generated references, and `extends`.

Do not blindly add `composite` to Next, Nuxt, SvelteKit, Expo, or Astro configs until generated test projects confirm their framework typecheck commands remain valid.

## Implementation Steps

1. Add a `processTsconfigReferences` post-processor after all templates are emitted.
2. Scan generated paths for `tsconfig.json`.
3. Exclude generated build internals:
   - `.next`
   - `.nuxt`
   - `.svelte-kit`
   - `node_modules`
4. Rewrite root `tsconfig.json.hbs` to a minimal solution file or let the post-processor own references.
5. Add `composite` and `incremental` to package tsconfigs that are missing them:
   - `packages/ui`
   - `packages/env`
   - `packages/config` only if it gets a tsconfig and source files.
6. Review app tsconfigs one-by-one:
   - Next currently has `noEmit: true` and `incremental: true`.
   - TanStack Start has `noEmit: true`.
   - Nuxt has its own `.nuxt` references.
   - Svelte extends `.svelte-kit/tsconfig.json`.
   - Expo extends `expo/tsconfig.base`.
7. Add `typecheck` script guidance using `tsc -b` where appropriate.
8. Regenerate `templates.generated.ts`.

## Tests

Add generated-output tests that assert:

- Root `tsconfig.json` has `files: []`.
- Root `references` includes only generated projects.
- `packages/ui` and `packages/env` get `composite` and `incremental`.
- Existing Nuxt `.nuxt` references are not destroyed.
- Framework app typecheck configs remain syntactically valid JSON.

If feasible, add fixture builds:

- Generate a small Next + API + DB project and run `tsc -b --dry`.
- Generate a Vite React + API project and run `tsc -b --dry`.

## Risk Notes

- `composite` changes TypeScript constraints, especially include patterns and declaration outputs.
- Framework configs often depend on `noEmit` and generated type files.
- A solution tsconfig should not double-compile source files; use `files: []`.

## References

- Issue #854: https://github.com/AmanVarshney01/create-better-t-stack/issues/854
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html

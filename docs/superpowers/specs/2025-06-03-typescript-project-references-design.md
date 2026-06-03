# TypeScript Project References Design

## Goal

Reduce TypeScript LSP load in generated monorepos by adding solution-style root `tsconfig.json` references, `composite: true` for packages, and `incremental: true` where appropriate.

---

## Background

Generated monorepos can contain many `tsconfig.json` files. Some editors and LSP setups spawn or load too much TypeScript work across those configs, causing high CPU usage. TypeScript's own guidance recommends a solution-style root config with `files: []` and `references` to leaf projects.

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/854

---

## 1. Risk and Constraints

- `composite` changes TypeScript constraints, especially include patterns and declaration outputs.
- Framework configs often depend on `noEmit` and generated type files.
- A solution tsconfig should not double-compile source files; use `files: []`.
- Do not blindly add `composite` to Next, Nuxt, SvelteKit, Expo, or Astro configs until generated test projects confirm their framework typecheck commands remain valid.

---

## 2. Target Root Shape

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

---

## 3. Composite Strategy

Use a conservative split:

### 3.1 Packages and Server-Side Workspaces

- `composite: true`
- `incremental: true`
- `tsBuildInfoFile`: stable path under `node_modules/.cache/tsbuildinfo` or local `.tsbuildinfo`

### 3.2 Framework App Tsconfigs

- Evaluate per framework before setting `composite`.
- Preserve framework-required `noEmit`, generated references, and `extends`.

---

## 4. Implementation

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
8. Regenerate `packages/template-generator/src/templates.generated.ts`.

---

## 5. Existing Repo Surface

### 5.1 Root tsconfig template

- `packages/template-generator/templates/base/tsconfig.json.hbs`

### 5.2 Workspace tsconfig templates

- Backend server: `packages/template-generator/templates/backend/server/base/tsconfig.json.hbs`
- API (tRPC/oRPC): `packages/template-generator/templates/api/trpc/server/tsconfig.json.hbs`, `packages/template-generator/templates/api/orpc/server/tsconfig.json.hbs`
- DB: `packages/template-generator/templates/db/base/tsconfig.json.hbs`
- Auth: `packages/template-generator/templates/auth/better-auth/server/base/tsconfig.json.hbs`
- Packages: `packages/template-generator/templates/packages/env/tsconfig.json.hbs`, `packages/template-generator/templates/packages/ui/tsconfig.json.hbs`
- Frontends: React, Native, Solid, Svelte, Astro, Nuxt templates

Some generated server/package configs already set `composite: true`, but root references are missing.

---

## 6. Tests

- Root `tsconfig.json` has `files: []`.
- Root `references` includes only generated projects.
- `packages/ui` and `packages/env` get `composite` and `incremental`.
- Existing Nuxt `.nuxt` references are not destroyed.
- Framework app typecheck configs remain syntactically valid JSON.

If feasible, add fixture builds:

- Generate a small Next + API + DB project and run `tsc -b --dry`.
- Generate a Vite React + API project and run `tsc -b --dry`.

---

## 7. References

- Issue #854: https://github.com/AmanVarshney01/create-better-t-stack/issues/854
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html

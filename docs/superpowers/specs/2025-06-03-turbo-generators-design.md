# Turbo Generators Design

## Goal

When Turborepo is selected, generate a root `turbo/generators` folder with a `lib` generator that creates new packages under `packages/`.

---

## Background

Currently, `packages/template-generator/src/processors/turbo-generator.ts` generates `turbo.json`, but there is no generated `turbo/generators` folder. This design adds code-generation scaffolding to Turborepo-enabled projects.

---

## 1. Generated Shape

```
turbo/
  generators/
    config.ts
    templates/
      lib/
        package.json.hbs
        tsconfig.json.hbs
        src/
          index.ts.hbs
```

The root package should add `@turbo/gen` as a dev dependency when Turborepo is selected.

---

## 2. `lib` Generator Behavior

### 2.1 Prompts

1. Package name, for example `analytics`.
2. Regular workspace dependencies. Dynamic choices should be all existing workspace packages except the package being created.
3. Dev workspace dependencies. Same dynamic choice list.

### 2.2 Actions

1. Create `packages/{{kebabCase name}}`.
2. Create `package.json` with:
   - `name`: `@<scope>/{{kebabCase name}}`
   - `exports`: `{ ".": "./src/index.ts" }`
   - `scripts`: `check-types`, optional `build` only if generated stack uses buildable packages
   - `devDependencies`: always `@<scope>/config`
   - Selected regular workspace deps in `dependencies`
   - Selected dev workspace deps in `devDependencies`
3. Create `src/index.ts`.
4. Create `tsconfig.json` extending `@<scope>/config/tsconfig.base.json`.
5. Run install and format after generation.

---

## 3. Dynamic Workspace Discovery

In `turbo/generators/config.ts`:

- Read root `package.json` and workspace globs.
- Find `package.json` files under `apps/*` and `packages/*`.
- Filter out private app packages unless the prompt should allow app dependencies.
- Present package names, not paths.
- Sort by package name.

---

## 4. Package Manager Commands

Use generated package manager:

- Bun: `bun install`, `bun run check`
- pnpm: `pnpm install`, `pnpm check`
- npm: `npm install`, `npm run check`

If the generated stack includes `oxc`, `biome`, or `ultracite`, call the root format/check script rather than hardcoding a formatter.

---

## 5. Implementation

1. Add generator templates under `packages/template-generator/templates/addons/turborepo/generators`.
2. Update the turborepo addon handler to process those templates.
3. Add `@turbo/gen` to the dependency version map.
4. Add root dev dependency on `@turbo/gen` when Turborepo is selected.
5. Ensure `processCatalogs` catalogues `@turbo/gen` if it appears in multiple locations.
6. Add tests that generated projects contain `turbo/generators/config.ts`.

---

## 6. Tests

- Virtual generation test for folder shape.
- Static test that `config.ts` imports `type { PlopTypes } from "@turbo/gen"`.
- Smoke test by generating a fixture and running `turbo gen lib --args test-lib ...` if feasible.

---

## 7. References

- Turborepo generating code: https://turborepo.dev/repo/docs/guides/generating-code
- `@turbo/gen` reference: https://turborepo.dev/docs/reference/turbo-gen

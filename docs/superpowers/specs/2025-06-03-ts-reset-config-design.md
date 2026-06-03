# TS Reset Config Design

## Goal

Expose `@total-typescript/ts-reset` from the generated `packages/config` package so app and package tsconfigs can opt into reset types through their `types` array without adding `@total-typescript/ts-reset` to every generated package.

---

## Background

Currently, `packages/config` is generated with only `package.json` and `tsconfig.base.json`. Most generated packages extend `@<scope>/config/tsconfig.base.json`. Adding `ts-reset` centrally reduces duplication and makes it easy to opt out at the package level.

---

## 1. Risk and Constraints

- TS Reset docs recommend using it in applications, not libraries, because it changes global types.
- This generated monorepo mostly creates private app and internal workspace packages, so a shared reset is acceptable.
- If a generated package is intended for npm publishing, provide an opt-out by allowing package-level tsconfigs to override `types`.

---

## 2. Generated Shape

```
packages/config/
  package.json
  reset.d.ts
  tsconfig.base.json
```

### 2.1 `reset.d.ts`

```ts
import "@total-typescript/ts-reset";
```

### 2.2 `packages/config/package.json`

```json
{
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./reset": "./reset.d.ts"
  },
  "devDependencies": {
    "@total-typescript/ts-reset": "<version>"
  }
}
```

### 2.3 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "types": ["@<scope>/config/reset"]
  }
}
```

Then append runtime-specific entries such as `node`, `bun`, and `@cloudflare/workers-types`.

---

## 3. Implementation

1. Add `@total-typescript/ts-reset` to the template generator dependency version map.
2. Add `packages/template-generator/templates/packages/config/reset.d.ts.hbs`.
3. Update `packages/template-generator/templates/packages/config/package.json.hbs`.
4. Update `packages/template-generator/templates/packages/config/tsconfig.base.json.hbs` to include the config reset type first.
5. Ensure every package that extends the shared config has a dev dependency on `@<scope>/config`; if not, update `workspace-deps`.
6. Add tests that generated package tsconfigs do not each depend directly on `@total-typescript/ts-reset`.

---

## 4. Tests

- Virtual generation test for `packages/config/reset.d.ts`.
- Virtual generation test that `types` includes `@<scope>/config/reset`.
- Type-check one generated stack with `JSON.parse` typed as `unknown`.

---

## 5. References

- TS Reset: https://www.totaltypescript.com/ts-reset

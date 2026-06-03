# Tauri Workspace Design

## Goal

Move the generated Tauri desktop shell out of `apps/web/src-tauri` and into a standalone workspace package at `apps/tauri`, while still wrapping the selected web frontend.

---

## Background

The CLI currently runs the Tauri CLI from `apps/web` in `apps/cli/src/helpers/addons/tauri-setup.ts`. Tauri config paths are relative to `apps/web`, for example `../dist`, `../out`, or `../.output/public`. Moving Tauri into `apps/tauri` improves separation of concerns and aligns with monorepo best practices.

---

## 1. Risk and Constraints

- Keep Tauri compatible only with web frontends listed in `desktopWebFrontends`.
- If a stack has web plus native mobile, Tauri should still target the web frontend.
- Next.js Tauri remains dependent on static export behavior. If the generated Next app is not export-ready, document that in the generated README.

---

## 2. Target Shape

```
apps/
  web/
  tauri/
    package.json
    src-tauri/
      Cargo.toml
      tauri.conf.json
      src/main.rs
      capabilities/default.json
```

### 2.1 `apps/tauri/package.json`

- `name`: `@<scope>/tauri`
- Scripts: `dev`, `build`, `tauri`
- `devDependencies`: `@tauri-apps/cli`

### 2.2 Framework-Aware Config

The Tauri config should point to the sibling web app:

| Framework      | Build Output Path       |
| -------------- | ----------------------- |
| Vite/TanStack  | `../web/dist`           |
| React Router   | `../web/build/client`   |
| TanStack Start | `../web/dist/client`    |
| Next.js        | `../web/out`            |
| Nuxt           | `../web/.output/public` |
| SvelteKit      | `../web/build`          |
| Astro          | `../web/dist`           |

---

## 3. Implementation

1. Replace the external `tauri init` dependency with checked-in Handlebars templates under `packages/template-generator/templates/addons/tauri/apps/tauri`.
2. Move the path helper logic from `apps/cli/src/helpers/addons/tauri-setup.ts` into either template data or a template-generator processor, because the new shell should be generated even when external commands are skipped.
3. Update `setupTauri` to become a lightweight post-generation validator, or delete it if all setup can be represented by templates.
4. Generate `apps/tauri/src-tauri/tauri.conf.json.hbs` with framework-aware:
   - `frontendDist`
   - `devUrl`
   - `beforeDevCommand`
   - `beforeBuildCommand`
5. Update `packages/template-generator/src/processors/turbo-generator.ts` so `dev`, `build`, and `start` handle `apps/tauri` without confusing it for a web build output.
6. Update post-install instructions in `apps/cli/src/helpers/core/post-installation.ts` to run desktop commands from `apps/tauri`.
7. Update tests:
   - `apps/cli/test/tauri-setup.test.ts`
   - Addon generation tests that assert Tauri layout
   - Generated package dependency tests

---

## 4. Verification

- `bun run check`
- `cd apps/cli && bun test test/tauri-setup.test.ts test/addons.test.ts`
- A virtual-create assertion that `apps/tauri/package.json` and `apps/tauri/src-tauri/tauri.conf.json` are generated and that `apps/web/src-tauri` is absent.

---

## 5. References

- Tauri docs: https://tauri.app/

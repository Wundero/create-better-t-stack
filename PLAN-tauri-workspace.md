# Plan: Move Tauri Into `apps/tauri`

## Goal

Move the generated Tauri desktop shell out of `apps/web/src-tauri` and into a standalone workspace package at `apps/tauri`, while still wrapping the selected web frontend.

## Current State

- The CLI currently runs the Tauri CLI from `apps/web` in `apps/cli/src/helpers/addons/tauri-setup.ts`.
- Tauri config paths are currently relative to `apps/web`, for example `../dist`, `../out`, or `../.output/public`.
- `apps/*` is already included in the generated root workspace, so `apps/tauri` will be automatically discovered by Bun, pnpm, npm workspaces, and Turborepo.

## Target Shape

Generate:

```text
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

`apps/tauri/package.json` should contain:

- `name`: `@<scope>/tauri`
- scripts: `dev`, `build`, `tauri`
- `devDependencies`: `@tauri-apps/cli`

The Tauri config should point to the sibling web app:

- Vite/TanStack Router/Solid: `../web/dist`
- React Router: `../web/build/client`
- TanStack Start: `../web/dist/client`
- Next.js: `../web/out`
- Nuxt: `../web/.output/public`
- SvelteKit: `../web/build`
- Astro: `../web/dist`

## Implementation Steps

1. Replace the external `tauri init` dependency with checked-in Handlebars templates under `packages/template-generator/templates/addons/tauri/apps/tauri`.
2. Move the path helper logic from `apps/cli/src/helpers/addons/tauri-setup.ts` into either template data or a template-generator processor, because the new shell should be generated even when external commands are skipped.
3. Update `setupTauri` to become a lightweight post-generation validator, or delete it if all setup can be represented by templates.
4. Generate `apps/tauri/src-tauri/tauri.conf.json.hbs` with framework-aware `frontendDist`, `devUrl`, `beforeDevCommand`, and `beforeBuildCommand`.
5. Update `packages/template-generator/src/processors/turbo-generator.ts` so `dev`, `build`, and `start` handle `apps/tauri` without confusing it for a web build output.
6. Update post-install instructions in `apps/cli/src/helpers/core/post-installation.ts` to run desktop commands from `apps/tauri`.
7. Update tests:
   - `apps/cli/test/tauri-setup.test.ts`
   - addon generation tests that assert Tauri layout
   - generated package dependency tests

## Compatibility Notes

- Keep Tauri compatible only with web frontends listed in `desktopWebFrontends`.
- If a stack has web plus native mobile, Tauri should still target the web frontend.
- Next.js Tauri remains dependent on static export behavior. If the generated Next app is not export-ready, document that in the generated README or adjust the Next template.

## Verification

- `bun run check`
- `cd apps/cli && bun test test/tauri-setup.test.ts test/addons.test.ts`
- A virtual-create assertion that `apps/tauri/package.json` and `apps/tauri/src-tauri/tauri.conf.json` are generated and that `apps/web/src-tauri` is absent.

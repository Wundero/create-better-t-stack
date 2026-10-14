## Context

The generated project can contain many rendering surfaces at once: web frontends, native (Expo), server backends (including Nitro), the React Email package, Tauri (webview plus Rust host), the Electrobun Bun host, OpenTUI and WXT. No single JS i18n library has first-party support for all of them, and they differ on key style:

- **Lingui** — source-text keys, PO catalogs.
- **Paraglide** — compiled message functions with IDs.
- **i18next** — JSON with natural-language keys when separators are disabled.
- **wuchale** — implicit extraction with no `t()`.

Several selected integrations already ship their own translations. Generated projects should use those built-in translations rather than re-translating, but must feed them the same locale.

Repository conventions that this change follows:

- `AGENTS.md`: Bun, strict TS, ESM, kebab-case, `better-result` in CLI flows, `bun:test`, `bun run check`, Handlebars `\{{` escaping, and never hand-editing `templates.generated.ts`.
- `CONTEXT.md` testing tiers: Default Suite, Matrix Smoke, Full Matrix Job, and a **test-owned Compatibility Oracle** that does not reuse production validators.
- Precedents to follow: `payments` and `payment-providers.ts` for typed provider metadata, and `add-nitro-backend` for change structure.

### Phase 0 findings (L0 recon, 2026-10-14)

L0 ran read-only in the `wt/i18n` worktree (base `origin/main` @ `4b3576ba`). Full per-file touchpoint tables are carried in the lane briefs; the decisions and lists they produce are below.

**0.1 Top-level-option touchpoints (traced via `payments`).** A new top-level option touches ~40 hand-written files plus 2 derived-artifact families. By owner:

- _L1 types:_ `packages/types/src/{schemas.ts, types.ts, json-schema.ts, analytics.ts, compatibility.ts}`.
- _L2 cli:_ `apps/cli/src/{index.ts, constants.ts, validation.ts, mcp.ts, virtual.ts}`; `apps/cli/src/prompts/{<x>.ts, config-prompts.ts}`; `apps/cli/src/utils/{config-processing.ts, config-validation.ts, compatibility-rules.ts, display-config.ts, project-history.ts, analytics.ts, templates.ts}`; `apps/cli/src/helpers/core/{command-handlers.ts, detect-project-config.ts, add-handler.ts, post-installation.ts}`; `apps/cli/src/helpers/addons/mcp-setup.ts`.
- _L3 web:_ `apps/web/src/lib/{types.ts, constant.ts, stack-schema.ts, stack-url-keys.ts, stack-url-state.ts, stack-url-state.client.ts, stack-utils.ts, stack-validation.ts, analytics.ts, agent-content.ts}`; `apps/web/src/app/og/stack/route.tsx`; the `(home)/analytics` components; `apps/web/content/docs/*.mdx`.
- _L4 generator:_ `packages/template-generator/src/{processors/<x>-deps.ts + processors/index.ts, template-handlers/<x>.ts + template-handlers/index.ts, generator.ts, processors/env-vars.ts, generators/alchemy/env.ts, bts-config.ts, utils/reproducible-command.ts}` plus new `templates/<x>/**`; derived `templates.generated.ts`.
- _Cross-cut:_ `packages/backend/convex/{schema.ts, analytics.ts, analytics_helpers.ts}`; plugin docs (`plugin/skills/scaffold-project/SKILL.md`, `plugin/commands/new.md`, `plugin/agents/stack-architect.md`, `plugin/.codex-plugin/plugin.json`).

Surprises that must not be missed: CLI flags are auto-derived by trpc-cli from the zod input (`apps/cli/src/index.ts:164`), but three hardcoded allowlists gate them — `SchemaNameSchema` (`index.ts:84`), `coreStackFlags` (`validation.ts:21`), and MCP `requiresExplicitFields` (`mcp.ts:142`). Env vars are emitted twice (`processors/env-vars.ts` and `generators/alchemy/env.ts`). `"none"`-style defaults are duplicated in `constants.ts`, the CLI presets, `command-handlers.ts`, and web `constant.ts` (STACK presets + DEFAULT_STACK). `packages/types/src/compatibility.ts` carries per-option disable rules. `packages/create-bts` is a thin wrapper with no option references.

**0.2 Version picks.** Current template pins: Next `^16.3.4`, Vite `^8.2.2`, Expo `~57.0.20` (React web `^19.2.8` / native `19.2.3`), Nuxt `^4.6.0` (Vue `^3.5.43`), SvelteKit `^3.0.0` (Svelte `^5.57.1`), Astro `^7.3.1`, Solid `2.0.0-rc.13`, Tauri CLI `^2.11.4`, Nitro `3.0.260903-beta`. WXT and OpenTUI are not templated — the CLI shells out to `wxt@latest` / `create-tui@latest` (`apps/cli/src/helpers/addons/{wxt-setup.ts, tui-setup.ts}`), so their versions resolve at generation time. Versions live in `dependencyVersionMap` (`packages/template-generator/src/utils/add-deps.ts:15-193`) or hardcoded in `.hbs` `package.json` files; `post-process/catalogs.ts` only de-dupes/hoists and is not a version source.

Proposed pins (latest stable, 2026-10-14):

- **Lingui v6:** `@lingui/{core, react, solid, vite-plugin, babel-plugin-lingui-macro, metro-transformer, cli}` `6.9.1`; `@lingui/swc-plugin` `6.7.1` (separate version stream, built on `swc_core 77.1.1`). ESM-only, Node ≥ 22.19. SWC plugin must match the Next.js bundled SWC — verify against `plugins.swc.rs`.
- **Paraglide:** `@inlang/paraglide-js` `2.27.0`.
- **i18next:** `i18next` `26.4.4`, `react-i18next` `17.0.16` (peer i18next ≥ 26.2), `i18next-vue` `5.4.0`; extractor **`i18next-cli` `1.75.3`** (maintained, SWC-based, Node ≥ 22) over `i18next-parser` `9.4.0` (dormant since 2026-02).
- **wuchale:** `0.26.7` (0.x, experimental; **no official Vue adapter**; AI disabled by simply omitting the `ai` config).
- **Integrations:** `@better-auth/i18n` `1.7.7` (locks to `better-auth ^1.7.7`), `@clerk/localizations` `4.23.0` (docs still "Experimental"), `@nuxtjs/i18n` `10.6.0` (Nuxt 4, `vue-i18n ^11.4`), `@wxt-dev/i18n` `0.2.8`.

**0.3 Rust ICU crate decision.** Use **`formatjs_icu_messageformat` 0.3.0 + `formatjs_icu_messageformat_parser` 1.1.0** (FormatJS org; ICU4X-backed via `icu ^2.3`) instead of the in-house evaluator. The parser covers the D7 subset — arguments, `plural`, `selectordinal` (`PluralType::Ordinal`), `select`, `#` (`Pound`), and recursive nesting — and the runtime supports parse-once (precompiled AST via `from_ast_with_options`) with per-locale format time. `fluent`/`fluent-bundle` is FTL syntax, not MF1; `intl_pluralrules` is dead (2022); `rust-icu-messageformat` and `icu_messageformat` do not exist. Risks: crate is young (0.3.0, ~2 months), MSRV 1.92 / edition 2024, ICU4X lacks full ECMA-402 currency/unit/timezone parity; `icu_*` are `2.3.x` and `icu_locid` is frozen at 1.5 (use `icu_locale`). Ship the in-house evaluator only if the young-crate/MSRV risk is rejected.

**0.4 AsyncLocalStorage.** Supported on every generated server path: Bun and Node natively; workers via `nodejs_compat`, already emitted for both Hono (`generators/alchemy/server.ts:79`) and Nitro (`generators/alchemy/server.ts:40`; `templates/backend/server/nitro/base/nitro.config.ts.hbs` sets `cloudflare.nodeCompat: true`). Nitro on bun/node uses the native process. **There is no AWS/Lambda surface** — `RuntimeSchema` is `bun|node|workers|none` and `ServerDeploySchema` is `cloudflare|prisma|docker|vercel|none`; task 0.4's "lambda handlers" premise has no generated artifact. Add a guard test asserting `nodejs_compat` stays present.

**0.5 Anchors (D9 `anchored-insert`).** Candidate single-occurrence anchor strings per generated root/provider file (verified unique in template):

- Next `app/layout.tsx`: `import type { Metadata } from "next";`, `import Providers from "@/components/providers";`, `export const metadata: Metadata = {` (its `<html …>` line is duplicated across branches).
- Next `components/providers.tsx`: `"use client";`, `import { ThemeProvider } from "./theme-provider";`, `export default function Providers({`.
- TanStack Start `__root.tsx`: `import Header from "../components/header";`, `export const Route = createRootRouteWithContext<RouterAppContext>()({`, `function RootDocument() {`.
- TanStack Start `router.tsx`: `declare module "@tanstack/react-router" {`.
- React Router `root.tsx`: `export function Layout({ children }: { children: React.ReactNode }) {`, `<html lang="en" suppressHydrationWarning>`.
- TanStack Router `__root.tsx`: `import { ThemeProvider } from "@/components/theme-provider";`, `export const Route = createRootRouteWithContext<RouterAppContext>()({`.
- Nuxt `app.vue`: `<script setup lang="ts">`, `<NuxtPage />`; `app.config.ts`: `export default defineAppConfig({`; `nuxt.config.ts`: `export default defineNuxtConfig({`.
- Svelte `+layout.svelte`: **no anchor common to all variants that is unique** (lines repeat once per mutually-exclusive branch) — needs a branch-aware anchor or template normalization.
- SvelteKit `hooks.server.ts` (better-auth): `import { svelteKitHandler } from "better-auth/svelte-kit";`, `export const handle: Handle = async ({ event, resolve }) => {`.
- Solid `App.tsx`: `export default function App() {`, `<Router>`; `Document.tsx`: `<body>{props.children}</body>`.
- Astro `Layout.astro`: `<html lang="en" class="dark">`, `<slot />`.
- Expo `_layout.tsx` (bare/uniwind/unistyles): `import { Stack } from "expo-router";`, the root component declaration.
- Server entries: Hono `const app = new Hono();`; Express `const app = express();`; Fastify `fastify.get('/', async () => {`; Elysia `.get("/", () => "OK")`.
- better-auth `createAuth`: `return betterAuth({`, `emailAndPassword: { enabled: true },`.

Absent (consistent with D7/D11): Tauri `src-tauri/**`, WXT entrypoints, the OpenTUI entry, and the React Email render entry have **no static templates** — Tauri/WXT/OpenTUI come from external scaffolders and are wired by CLI post-steps; React Email lives on `wt/email-support`. Their anchor coverage belongs to L8/L10 and the stacked branches. A guard test must fail if a template change removes any chosen anchor.

**0.6 Dependency branch heads (2026-10-14).**

| ref                                | head       |
| ---------------------------------- | ---------- |
| `origin/main`                      | `4b3576ba` |
| `origin/next`                      | `265ab7c0` |
| `origin/wt/email-support`          | `d3c9f154` |
| `origin/wt/payment-providers`      | `01516aba` |
| `origin/wt/turnstile-addon`        | `f2adfe43` |
| `origin/wt/shadcn-theme-config`    | `2060a843` |
| `origin/feat/generate-package-app` | `0f325467` |

**Derived artifacts (orchestration ground rule 3).** Only two tracked families: `packages/template-generator/src/templates.generated.ts` (regen `cd packages/template-generator && bun run generate-templates`; also runs via `prebuild`) and `packages/backend/convex/_generated/**` (regen `cd packages/backend && bunx convex codegen`). The JSON schema output is **not** a tracked file — `apps/web/scripts/generate-schema.ts` uploads it to R2 (`bun run generate`). Web builder files (`constant.ts`, `stack-validation.ts`, `tech-categories.tsx`) are hand-written, not generated. `bun run check` does not require generation; the CLI tests require the built generator `dist`.

**Open Questions — resolved (checkpoint 1, 2026-10-14).**

- Default locale list: **`["en","es","fr"]`**.
- i18next extractor: **`i18next-cli`** (maintained, SWC-based, Node ≥ 22).
- Nuxt `vue-i18n`: **no** extra Nuxt-only library.
- Payment checkout locales: **supported "where possible"** — `"api"` for Polar and Stripe, remaining providers upgraded as each is verified on `wt/payment-providers`.
- AWS Lambda: **removed from scope** — no generated surface; would be a node-wrapping deploy target, not an i18n lane.
- Svelte layout: normalize `+layout.svelte` to a single unique anchor.
- Rust crate: default `formatjs_icu_messageformat`; in-house evaluator acceptable fallback; final call at L8 (⛔2).

## Goals / Non-Goals

**Goals**

- One i18n choice that works across every surface the stack can contain, or is blocked with a precise reason.
- One compatibility module consumed by the CLI, the web builder, the generator and the Add Path.
- Built-in localization of integrations is enabled automatically and fed the shared locale.
- Rust (Tauri) reads the **same catalogs** as JS.
- Formatting (date, time, number, currency, relative, list, plural, unit) behaves the same for every library.
- Translation is agent-driven and library-agnostic.
- Existing projects can adopt i18n through the Add Path without losing user edits.

**Non-Goals**

- TMS integrations.
- Changing an existing project's i18n library.
- Localizing docs content.
- Shared sessions across unrelated domains.

## Decisions

### D1. Configuration shape

```ts
i18n: "lingui" | "paraglide" | "i18next" | "wuchale" | "none"; // default "none"
i18nOptions?: {
  sourceLocale: string;                 // canonical BCP-47; default "en"
  locales: string[];                    // includes sourceLocale; default ["en", "es"]
  routing?: {
    strategy: "cookie" | "prefix" | "domain";   // default "cookie"
    prefixDefaultLocale?: boolean;              // prefix only; default false
    domains?: Record<string, string>;           // domain only; locale → host (e.g. "fr": "fr.example.com")
  };
  translateSkill?: boolean;             // default true
};
```

- **Schemas.** Add the field to `CreateInputSchema`, `ProjectConfigSchema`, `BetterTStackConfigSchema`, `AddInputSchema`, the JSON schema, and analytics. Analytics records the library and the locale _count_ only, never locale lists or domains.
- **CLI flags:**
  - `--i18n`
  - `--i18n-locales en,fr,de`. The first entry is the source locale unless `--i18n-source-locale` is given.
  - `--i18n-routing cookie|prefix|domain`
  - `--i18n-domain fr=fr.example.com` (repeatable)
  - `--i18n-skill/--no-i18n-skill`
- **Web URL keys:** `i18n` → `i18n`, `loc`, `src`, `rt`, `dom`.

### D2. One compatibility module: `packages/types/src/i18n.ts`

This module is the only place with i18n rules. It is exported from `packages/types/src/index.ts`.

**Surfaces** are derived from the Project Configuration; users never pick them.

```ts
export type I18nSurface =
  | "next"
  | "tanstack-start"
  | "tanstack-router"
  | "react-router"
  | "nuxt"
  | "svelte"
  | "solid"
  | "astro"
  | "native" // any native-* frontend
  | "server" // hono | express | fastify | elysia | nitro (any runtime incl. workers, lambda)
  | "email" // emailRenderer === "react-email"
  | "tauri-host" // Rust side of the tauri addon
  | "electrobun-host" // Bun main process
  | "opentui-core"
  | "opentui-react"
  | "opentui-solid"
  | "wxt-vanilla"
  | "wxt-react"
  | "wxt-vue"
  | "wxt-solid"
  | "wxt-svelte";
export function getI18nSurfaces(config): I18nSurface[];
```

Derivation rules:

- `backend: "self"` adds no `server` surface; the fullstack frontend surface covers it. `convex` adds none in this change.
- `opentui-*` and `wxt-*` use `addonOptions.<addon>.template`, falling back to the same default the CLI applies.
- `email` exists only when the email fields exist and are set. Until `wt/email-support` merges, the field is simply absent.

**Support matrix.** The type is `Record<I18nLibrary, Record<I18nSurface, { level: "native" | "adapter" | "partial" | "unsupported"; note?: string }>>`, declared with `satisfies`. Adding a surface or library therefore fails typecheck until every cell is filled. Notes are user-facing and appear in CLI hints, web tooltips and the generated README.

| surface                                         | lingui                                                            | paraglide             | i18next                     | wuchale                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------- | --------------------- | --------------------------- | --------------------------------------------------------- |
| next                                            | native (SWC plugin, RSC)                                          | native                | adapter                     | native                                                    |
| tanstack-start / tanstack-router / react-router | adapter (Vite plugin + React)                                     | native                | adapter                     | adapter                                                   |
| nuxt                                            | adapter (`createVueExtractor` + composable)                       | adapter               | adapter (`i18next-vue`)     | unsupported — no Vue adapter                              |
| svelte                                          | unsupported — no Svelte template support                          | native                | adapter (shipped store)     | native                                                    |
| solid                                           | native (`@lingui/solid`)                                          | native                | adapter (shipped primitive) | native                                                    |
| astro                                           | partial — macros only in frontmatter/islands, not `.astro` markup | native                | adapter                     | native                                                    |
| native                                          | native (`@lingui/metro-transformer`)                              | adapter (CLI compile) | native                      | unsupported — no Metro integration                        |
| server                                          | adapter (Bun preload / bundler macro plugin)                      | native                | native                      | adapter                                                   |
| email                                           | native                                                            | native                | native                      | partial — server render path unverified                   |
| tauri-host                                      | adapter (§D7)                                                     | adapter (§D7)         | adapter (§D7)               | unsupported — implicit extraction has no Rust counterpart |
| electrobun-host, opentui-core                   | adapter (Bun preload)                                             | native                | native                      | adapter                                                   |
| opentui-react / opentui-solid                   | adapter (Bun preload)                                             | native                | native / adapter            | partial — unverified with OpenTUI reconciler              |
| wxt-vanilla                                     | adapter                                                           | native                | native                      | adapter                                                   |
| wxt-react / wxt-solid                           | native                                                            | native                | native / adapter            | native                                                    |
| wxt-vue                                         | adapter                                                           | adapter               | adapter                     | unsupported                                               |
| wxt-svelte                                      | unsupported                                                       | native                | adapter                     | native                                                    |

**Library metadata** (`I18N_LIBRARY_META`) records:

- `label`;
- `keyStyle` (`source-text | id | implicit`);
- `experimental` (wuchale);
- `catalogFormat` (`po | inlang-json | i18next-json`);
- `rustMacro` (`source-text | function`).

**API surface:**

- `validateI18nCompatibility(library, config)` returns either `{ isCompatible: true, warnings }` or `{ isCompatible: false, reason, blockingSurfaces }`.
- `getCompatibleI18nLibraries(config)`
- `getDefaultI18nLibrary(config)` picks the first compatible library in the order lingui → paraglide → i18next, and never returns wuchale.
- `validateI18nOptions(options)` checks:
  - each tag is canonical via `Intl.getCanonicalLocales`;
  - `sourceLocale ∈ locales`;
  - there are no duplicates;
  - domain keys ⊆ locales and every host is unique.
- `getI18nRoutingSupport(strategy, config, library)` (D6).
- `getI18nIntegrations(config, library)` (D3).

**The reason string has one format:** `` `${label} doesn't support ${surfaces.join(", ")}: ${note}` ``. The CLI error, CLI prompt hint and web disabled tooltip all use exactly this string.

### D3. Integrations map, including built-in localization

Integrations are declarative entries: `{ id, label, kind: "builtin-localization" | "framework" | "tooling", when(ctx), dependsOnBranch? }`. All of them are enabled automatically when `when()` holds and `i18n !== "none"`. Nothing is added for a surface that isn't present. The web builder and CLI summary list the active ones as "Also sets up: …".

**Built-in localization of selected integrations**, all fed by the shared locale (D5):

| id                         | when                                                                                             | behaviour                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `better-auth-i18n`         | `auth === "better-auth"`                                                                         | Adds `@better-auth/i18n` to the auth server. Details below.                                                                                                                                                                                                                                                                                                                        |
| `clerk-localizations`      | `auth === "clerk"`                                                                               | `@clerk/localizations`, lazy-loading the current locale and passing it to the provider's `localization` prop. Clerk marks this feature experimental and doesn't localize the hosted Account Portal; both go into the README note. Locales without a Clerk translation fall back to English and produce a warning.                                                                  |
| `zod-locales`              | any template that imports `zod` (auth forms, API)                                                | On the client, call `z.config(locales[x]())` on locale change, lazy-loaded. On the server, `z.config` is global, so do **not** call it per request. Instead, translate issues at the API boundary with a per-parse `error` map or render-time translation of `issue.code`. Zod locale export names (`zhCN`, `ptBR`, `frCA`) are mapped from BCP-47 by a table in the i18n package. |
| `nuxt-ui-locale`           | `nuxt`                                                                                           | `<UApp :locale>` bound to the current locale, using Nuxt UI's built-in locale objects.                                                                                                                                                                                                                                                                                             |
| `turnstile-language`       | `addons.includes("turnstile")` (stacked on `wt/turnstile-addon`, see D11)                        | The widget's `language` option is bound to the current locale, falling back to `"auto"` when Turnstile doesn't support it.                                                                                                                                                                                                                                                         |
| `payments-checkout-locale` | a payment provider with `checkoutLocale !== "none"` (stacked on `wt/payment-providers`, see D11) | A new `PaymentProviderMeta.checkoutLocale: "api" \| "query" \| "none"` field. Polar is `"api"` (create-checkout `locale`; beta behind a Polar org flag, documented). Stripe is `"api"` (Checkout Session `locale`). All other providers default to `"none"` until verified individually.                                                                                           |
| `starlight-i18n`           | `addons.includes("starlight")`                                                                   | Sets Starlight `locales` and `defaultLocale` from config; built-in UI strings are used.                                                                                                                                                                                                                                                                                            |
| `fumadocs-i18n`            | `addons.includes("fumadocs")`                                                                    | Fumadocs i18n config and middleware from the same locales; built-in UI strings are used.                                                                                                                                                                                                                                                                                           |
| `shadcn-direction`         | shadcn UI present (stacked on `wt/shadcn-theme-config`, see D11)                                 | Replaces static `dir="rtl"` / `DirectionProvider direction="rtl"` with a direction **derived from the current locale** (`getTextDirection(locale)` via `Intl.Locale#getTextInfo` with a fallback table). If any configured locale is RTL, RTL support is auto-enabled; the user's explicit `shadcn.rtl` still wins for the source locale.                                          |
| `react-email-locale`       | `email` surface (stacked on `wt/email-support`, see D11)                                         | Templates take `locale` and use the selected library. `verify-email` and `reset-password` receive the recipient's locale from Better Auth callbacks (user `locale` field → request locale → source).                                                                                                                                                                               |
| `pwa-manifest-lang`        | `addons.includes("pwa")`                                                                         | Sets the manifest `lang` and `dir` to the source locale.                                                                                                                                                                                                                                                                                                                           |

**`better-auth-i18n` in detail:**

- Translations: the built-in `locales`, filtered to the configured locales.
- Detection: `["callback", "session", "cookie", "header"]`.
  - `callback` reads the `x-app-locale` header (D5).
  - `cookie` uses the shared cookie name.
  - `session` reads `user.additionalFields.locale`.
- The schema change follows the same "needs `auth:generate` + migrate" flow the payment providers use (`requiresMigration`).
- Any configured locale without a built-in Better Auth translation falls back to English and produces a generator warning.
- Override entries live in `packages/i18n/src/integrations/better-auth.ts` so they can be edited.

**Framework and tooling integrations:**

| id                                            | when                                   | behaviour                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nuxt-i18n-module`                            | `nuxt`                                 | `@nuxtjs/i18n` for detection, the cookie, `<html lang/dir>`, hreflang and routing (`prefix_except_default` / `prefix` / `domains`). Messages come from the chosen library.                                                                                                                       |
| `astro-i18n-routing`                          | `astro`                                | Astro `i18n` config, with `domains` only when D6 allows it.                                                                                                                                                                                                                                      |
| `wxt-i18n`                                    | any `wxt-*`                            | `@wxt-dev/i18n` for the manifest `name`/`description`/`default_locale`. `i18n:sync-wxt` generates `locales/<l>.yml` from a reserved `extension.*` section of the normalized catalog. It is also the runtime for `wxt-vanilla` UI strings when no other library code is used there.               |
| `expo-localization` + `hermes-intl-polyfills` | `native`                               | Device locale, plus `@formatjs/intl-*` polyfills for each configured locale. Hermes `Intl` is incomplete.                                                                                                                                                                                        |
| `lingui-bun-preload`                          | lingui and any Bun-run host            | A `bunfig.toml` preload `Bun.plugin` that runs `@lingui/babel-plugin-lingui-macro`. Hosts: `server` on Bun, `electrobun-host`, `opentui-*`. Node, workers and lambda builds use the bundler plugin path instead.                                                                                 |
| `server-locale-middleware`                    | `server`                               | Middleware in each backend's native idiom (hono, express, fastify, elysia, and **nitro `server/middleware/locale.ts`**). It negotiates per D5, then calls `runWithLocale`. Requires `AsyncLocalStorage`: workers templates must have `nodejs_compat`; lambda and Node runtimes have it natively. |
| `tauri-rust-i18n`                             | `tauri-host`                           | D7.                                                                                                                                                                                                                                                                                              |
| `lingui-skills`                               | lingui and `addons.includes("skills")` | Adds `lingui/skills` to the skills addon sources.                                                                                                                                                                                                                                                |

### D4. Generated shared package `@<project>/i18n`

```
packages/i18n/
  src/config.ts      locales, sourceLocale, isLocale, getTextDirection, negotiateLocale (D5), LOCALE_COOKIE/HEADER
  src/format.ts      createFormatters(locale): date/time/dateTime/dateRange/relative/relativeFrom/number/currency/percent/unit/compact/list/plural/displayName — native Intl, memoized
  src/server.ts      AsyncLocalStorage runWithLocale/getRequestLocale
  src/runtime.ts     library-specific instance/helpers
  src/integrations/  better-auth.ts, zod.ts (BCP-47→zod locale map), clerk.ts …
  scripts/           extract | compile | pending | apply | check | export (uniform contract, library-specific impl)
  rust/              (tauri only, D7)
  GLOSSARY.md
  <catalogs>         lingui: locales/{l}/messages.po · paraglide: messages/{l}.json + project.inlang · i18next: locales/{l}/{ns}.json · wuchale: per adapter .po
```

**Formatting rules:**

- Templates never use library formatting.
- Lingui v6 deprecated its `Intl` wrappers.
- i18next interpolation formatting is not used.
- Paraglide's declaration formatters are allowed only inside messages.

**Per-surface `useFormat()` glue:**

- React: a hook.
- Vue: a composable.
- Svelte: `$derived`.
- Solid: `createMemo`.
- Server: `createFormatters(getRequestLocale())`.

Each surface ships a **demo** in its existing home screen or landing page: a translated heading, an interpolation, a plural, a currency value, a date, and a locale switcher. Tests assert on the demo.

### D5. One negotiation contract

`negotiateLocale({ pathname?, host?, header?, cookie?, acceptLanguage?, stored?, system? })` is a pure function with no dependencies. Sources are checked in this order:

1. The routing strategy source (prefix segment / host).
2. `x-app-locale`.
3. Cookie `locale`.
4. `Accept-Language`.
5. Stored or system value.
6. `sourceLocale`.

Matching uses BCP-47 lookup with truncation (`fr-CA` → `fr`).

**Clients:**

- Every generated API client sends `x-app-locale`. This covers tRPC/oRPC links, the Better Auth client `fetchOptions`, and `fetch` helpers. Cross-origin servers (`apps/server`) therefore get the app's chosen locale, not just the browser preference.
- SPAs and webviews (Tauri, Electrobun) persist the locale in `localStorage`.
- Native persists it with the template's storage.
- WXT uses `storage.local`.
- CLI and TUI hosts read `LANG`/`LC_ALL`.

### D6. Routing strategies

| strategy           | supported where                                                                                                                                                                                                                             | mechanism                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookie` (default) | all surfaces                                                                                                                                                                                                                                | D5 sources 2–6                                                                                                                                                                                                                                                      |
| `prefix`           | nuxt (module), astro (built-in), svelte + paraglide (`reroute`/`handle`), any Vite fullstack + paraglide (URL strategy), next / tanstack-start / react-router via generated middleware + route rewrite (`/fr/...` → internal path + locale) | localized links via one `localizeHref(path, locale)` helper exported from the i18n package and used by every template link                                                                                                                                          |
| `domain`           | every surface that supports `prefix`, server-rendered only                                                                                                                                                                                  | locale ← host map. Astro: requires `output: "server"`, no prerendered pages, Node or Vercel adapter, and `site` set; otherwise blocked with that reason. Nuxt: `domains`. Paraglide: URL patterns with hosts. Others: the same middleware as prefix, keyed on host. |

**Domain-specific generated wiring:**

- **Better Auth:** `trustedOrigins` includes every domain.
  - When all domains share a registrable parent, enable `advanced.crossSubDomainCookies` with that parent, so one session spans subdomains.
  - Otherwise each domain keeps its own session, and a README warning says so.
  - OAuth callback URLs are listed per domain in the README.
- **CORS** allowlists include all domains.
- **Local dev:** with the fork's `portless` mode, generate `<locale>.<app>.localhost` hosts; otherwise use a `?locale=` dev override.
- **SEO:** `hreflang` uses absolute URLs from the domain map.

Static and SPA builds can't do domain routing, so it is blocked for them with a reason. The rule lives in `getI18nRoutingSupport`.

### D7. Rust (Tauri) translations from the same catalogs

**Normalized export.** `i18n:export` writes `packages/i18n/dist/catalog.json`:

```json
{
  "sourceLocale": "en",
  "locales": ["en", "fr"],
  "messages": {
    "<id>": { "source": "…", "context": null, "translations": { "en": "<ICU>", "fr": "<ICU>" } }
  }
}
```

- Message IDs are the library's own IDs:
  - Lingui: generated ID from message + context.
  - i18next: key = source text.
  - Paraglide: message ID.
- Each library's exporter converts to an ICU subset: arguments, `plural`/`selectordinal` with `#`, `select`, and nesting.
  - Paraglide variants/matchers map to `select`/`plural`.
  - i18next `{{x}}` and `_one/_other` suffixes map to ICU.
  - Anything outside the subset makes `i18n:export` fail with the message ID.
- `i18n:export` runs in `i18n:compile` and in Tauri's `beforeDevCommand`/`beforeBuildCommand`.

**Crate** `packages/i18n/rust` (package `<project>-i18n`):

- `build.rs` reads `catalog.json` (`cargo:rerun-if-changed`) and generates:
  - a static table of pre-parsed message ASTs per locale;
  - for `keyStyle: id`, a module of typed functions (`m::welcome_back_user(name)`).
- Runtime API:
  - `set_locale` / `locale()`, held in an `RwLock`;
  - `t!("Source sentence", name = value)` for source-text libraries;
  - the `m::*` functions for Paraglide.
- `t!` is a proc-macro in a sibling `macros` crate. It:
  - computes the **same ID the JS library computes** (Lingui's hash of message + context; i18next uses the literal);
  - emits a **compile error** when the ID is missing from the source catalog, which catches un-extracted strings in CI.
- **Plurals and formatting** use ICU4X: `icu_plurals` for plural categories, `icu_decimal`/`icu_datetime` for numbers and dates, with compiled data for the configured locales only.
- **Phase 0 gate:** evaluate any maintained Rust ICU MessageFormat crate. If one fits, the generated code uses it instead of the in-house subset evaluator; otherwise ship the evaluator (~300 lines, fully unit-tested).

**Extraction from Rust:**

- The `i18n:extract` step scans `apps/*/src-tauri/src/**/*.rs` for `t!(…)` with a small `syn`-based binary in the crate (`cargo run -p <project>-i18n --bin extract`). The binary emits `{ source, context?, references[] }` items.
- The items are merged into the source catalog through the library-specific `extract` implementation:
  - Lingui: a custom extractor registered in `lingui.config.ts` that delegates to the binary.
  - i18next: a merge step after `i18next-cli extract`, marking Rust references so they are never pruned.
  - Paraglide: no extraction, since IDs are authored.

**Wiring into the app:**

- Tauri's `src-tauri` is created by `tauri init` at setup time, so the wiring runs as a **post-step in `tauri-setup.ts`**. It:
  - adds the path dependency to `src-tauri/Cargo.toml` (TOML edit);
  - adds a `set_locale` command;
  - initializes from `sys-locale`;
  - rebuilds native menus on locale change.
- The webview calls `set_locale` when the user switches language.
- The README documents the Rust API.

### D8. Translation tooling contract and skills

**Uniform scripts** (root `package.json` plus task-runner wiring):

- `i18n:extract`, `i18n:compile` and `i18n:export`.
- `i18n:pending --locale <l> | --all [--limit N]` emits `{ library, sourceLocale, items: [{ id, locale, source, context, comments, references, placeholders, status }] }`.
- `i18n:apply <file>`:
  - validates that the placeholder and ICU argument sets match the source;
  - rejects mismatches per item;
  - writes catalogs.
- `i18n:check` fails on missing or invalid entries; `I18N_CHECK_ALLOW_MISSING=1` relaxes it for development.

**Skills:**

- **`i18n-translate`** is emitted to `.agents/skills/` and mirrored to the skills-addon agent folders when that addon is selected. Its loop is: extract → pending → translate in batches ≤50 (preserving ICU and markup, using context, references and `GLOSSARY.md`) → apply → compile/check → report.
- **`i18n-adopt`** is a library-aware guide for wrapping existing hard-coded strings incrementally. It is used after Add Path retrofitting. For wuchale it covers scoping the include globs instead.
- wuchale's built-in AI translation is disabled, so translation behaves the same across libraries.

### D9. Add Path retrofitting

**Inputs:**

- `bts add --i18n <library> [--i18n-locales …] [--i18n-routing …]`, plus an interactive prompt.
- `bts add --i18n-locales fr,de` on a project that already has i18n adds locales only:
  - creates empty catalogs;
  - updates the locale lists in configs and integrations.

**Rules:**

- **Compatibility.** The detected config plus the requested i18n go through `validateI18nCompatibility`. Requesting a different library than the one in `bts.jsonc` is an error with guidance. Removing locales isn't supported through `add`.
- **Planning.** Edits are planned in the existing VFS flow (`writePlannedTree` with snapshot and restore). Every edit is one of:
  1. `create` — a new file. Skipped if the path exists, and reported.
  2. `config-edit` — an AST edit of config files (`vite.config.*`, `nuxt.config.ts`, `astro.config.*`, `next.config.*`, `metro.config.js`, `svelte.config.js`, `wxt.config.ts`, `app.config.ts`) via `magicast`, plus `package.json`/`bunfig.toml`/`Cargo.toml` structured edits.
  3. `anchored-insert` — for app root and provider files (layouts, `__root.tsx`, `root.tsx`, `app.vue`, `+layout.svelte`, `_layout.tsx`, auth server `index.ts`, email `render.ts`, Tauri `lib.rs`). Applied only when a known anchor from the generated template is found **exactly once**.
  4. `manual` — anything else. It is reported in the outro and written to `I18N_SETUP.md` with the exact snippet.
- **Safety.** No existing file is overwritten or deleted. `--dry-run` prints the full plan, including manual steps. Re-running is idempotent.
- **Retrofit coverage.** Retrofitting uses the same integrations map. Built-in localization (Better Auth, Clerk, Zod …) is retrofitted with the same edit kinds. The Better Auth `locale` field prints the migrate command.
- **After a successful add:** `bts.jsonc` gains `i18n` and `i18nOptions`, and the outro points at the `i18n-adopt` skill.
- **Generate-app path** (stacked on `feat/generate-package-app`, see D11). When the project has i18n, new apps receive their surface glue from the create-path templates. `getI18nSurfaces` is re-evaluated, and the new app is rejected if its surface is unsupported by the project's library.

### D10. Testing (following CONTEXT.md tiers)

- **Compatibility Oracle (test-owned).** `apps/cli/test/oracles/i18n.ts` independently encodes expected accept/reject for library × surface × routing. It must not import `I18N_SUPPORT`. Tests compare production validation (CLI and web) against the oracle.
- **i18n Compatibility Coverage.** i18n is not crossed through the Exhaustive Matrix. Like Addon Compatibility Coverage, focused tests prove:
  - surface derivation;
  - the matrix cells;
  - routing gates;
  - that each integration's `when()` adds files and deps only when expected.
- **Web parity.** The stack-builder invariant tests assert that the web disabled set equals the oracle's rejected set.
- **Curated Build Set additions.** Each case installs, typechecks, builds, runs `i18n:extract && i18n:compile && i18n:check` (allowing missing translations), applies a fixture translation, and asserts the demo renders in `fr`:
  - next + hono/bun + lingui + better-auth
  - tanstack-start (self) + paraglide + prefix
  - nuxt + i18next + domain
  - svelte + paraglide
  - solid + wuchale
  - astro + paraglide
  - native-uniwind + lingui
  - tanstack-router + tauri + lingui — includes `cargo build`, plus a Rust test asserting `t!` output in `fr`
  - nitro + i18next
  - opentui(react) + lingui
  - react-router + wxt(vanilla) + paraglide
  - react-email + lingui (on `wt/i18n-email`, see D11)
- **Matrix Smoke** gains two i18n-enabled rows.
- **Add Path suite.** Retrofit for each library on representative fixtures:
  - pristine generated projects, where all edits apply;
  - user-modified roots, which must produce manual steps without overwriting anything;
  - an idempotent re-run;
  - add-locales;
  - library-switch rejection.
- **MCP Surface contract.** The schema exposes `i18n`/`i18nOptions`; invalid combinations return the shared reason.
- **Rust.** Unit tests cover the ICU subset evaluator and ID parity: the Lingui IDs computed in Rust must equal the JS IDs for a fixture set.

### D11. Branch plan for unmerged dependencies

The core work happens on **`wt/i18n`**, branched from `main`. It contains everything that doesn't need an unmerged branch, and its PR targets `main`.

Each integration that needs an unmerged feature gets its own **stacked branch**:

| stacked branch         | created as                                    | owns                                                                                                          |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `wt/i18n-email`        | `wt/i18n` + merge `wt/email-support`          | `email` surface derivation, `react-email-locale`, Better Auth email-callback locale, email curated build case |
| `wt/i18n-payments`     | `wt/i18n` + merge `wt/payment-providers`      | `PaymentProviderMeta.checkoutLocale`, `payments-checkout-locale`                                              |
| `wt/i18n-turnstile`    | `wt/i18n` + merge `wt/turnstile-addon`        | `turnstile-language`                                                                                          |
| `wt/i18n-shadcn`       | `wt/i18n` + merge `wt/shadcn-theme-config`    | `shadcn-direction`                                                                                            |
| `wt/i18n-generate-app` | `wt/i18n` + merge `feat/generate-package-app` | generate-app i18n inheritance (D9)                                                                            |

**How the stacked branches are built and kept current:**

- **Hooks in core.** The core branch defines the extension points: the integration id union, the `I18nSurface` union including `"email"`, and the support-matrix rows. A stacked branch only adds its `when()` body, templates, handler code and tests. Types that exist only on the dependency (`emailRenderer`, `PaymentProviderMeta`, `shadcn`, `ScaffoldAppInput`) are referenced only on that stacked branch.
- **Inert core entries.** In core, a hook whose dependency is missing is a no-op: `when()` returns `false` because the config field doesn't exist. Core therefore builds and tests green on its own.
- **Opening PRs.** Each stacked branch opens a PR targeting `main`. The existing `aggregate-next` workflow merges every open PR into `next`, so `next` gets core plus all integrations, with dependency-vs-dependency conflicts resolved where they already are.
  - The PR diff shows the dependency's commits until that dependency merges to `main`.
  - Mark the PR body `Depends on #<dependency PR>` and keep it draft-free so aggregation includes it.
- **Keeping current.** When `wt/i18n` advances, update each stacked branch with `git merge wt/i18n`. When a dependency advances, use `git merge <dependency>`. Never rebase, because the aggregator and existing PR heads expect merge history.
- **When a dependency lands.** Once it merges to `main`, merge `main` into the stacked branch. The PR then shrinks to the i18n-only diff and can merge normally.
- **Verifying on `next`.** Test the combined result of all stacked branches on a throwaway local branch made from `origin/next` + `wt/i18n` + all `wt/i18n-*`. Run the Curated Build Set there before relying on the aggregate.

## Risks / Trade-offs

- **Library churn.** Lingui v6 needs Node ≥ 22.19 and is ESM-only, and the SWC plugin is coupled to Next/SWC versions. Pin versions through the existing catalog mechanism and add a Phase 0 compatibility check.
- **wuchale is young.** Keep it experimental, with conservative matrix cells.
- **ICU normalization** across three catalog formats can drift. `i18n:export` is strict and fails loudly, and a round-trip test covers every library.
- **Global Zod config.** Server-side Zod translation is done at the boundary, never with `z.config`, to avoid cross-request leakage.
- **Anchor-based retrofitting** will hit manual steps on customized projects. That is the intended outcome; silent rewrites are not.
- **Domain routing** brings session, OAuth and SEO complexity. It is limited to server-rendered surfaces, and its consequences are documented in generated READMEs.
- **Dependency branches conflict with each other.** A trial merge on 2026-10-14 merged all five onto `main` in sequence:
  - `wt/email-support` merged cleanly.
  - `wt/payment-providers`, `wt/turnstile-addon`, `wt/shadcn-theme-config` and `feat/generate-package-app` each conflicted with what was already merged: `templates.generated.ts`, `display-config.ts`, web `constant.ts`/`stack-validation.ts`, alchemy plan/render, `config-prompts.ts`, `generator.ts`, `catalogs.ts`.

  `next` already holds resolutions for those. D11 keeps every i18n branch pairwise (core + one dependency), so i18n work never re-resolves dependency-vs-dependency conflicts; the aggregator keeps doing that.

## Migration Plan

- `i18n` defaults to `"none"`, so existing CLI invocations, saved configs and builder URLs are unchanged.
- `bts.jsonc` without `i18n` is read as `"none"`.
- Older CLIs reading a `bts.jsonc` that contains `i18n` hit the schema's strictness. Bump the schema version and note it in the changelog.

## Open Questions

Resolved at checkpoint 1 (2026-10-14):

- **Default locale list:** `["en","es","fr"]`. No `["en"]` option.
- **i18next extractor:** `i18next-cli` (maintained, SWC-based, Node ≥ 22). `i18next-parser` is not used.
- **Nuxt `vue-i18n`:** no extra Nuxt-only library. `@nuxtjs/i18n` handles routing/detection; the chosen library provides messages.
- **Payment checkout locales:** the `payments-checkout-locale` integration supports `checkoutLocale` for every provider where one is verified, i.e. Polar and Stripe are `"api"` and the rest (autumn, dodo, creem, chargebee, commet) are upgraded to `"api"`/`"query"` as each is verified on `wt/payment-providers`. Unverified providers stay `"none"`.

Additional resolutions from checkpoint 1:

- **AWS Lambda:** not a generated surface (`RuntimeSchema = bun|node|workers|none`); AWS Lambda supports the Node.js runtime only for this purpose, so it would be a node-wrapping deploy target, not an i18n lane. Removed from the i18n PR scope (task 0.4).
- **Svelte layout:** the `+layout.svelte` template is normalized so every generated variant carries a single unique locale-provider anchor (see 0.5), instead of a branch-aware anchor.
- **Rust crate:** default is the maintained `formatjs_icu_messageformat` crate (0.3). The in-house evaluator remains an acceptable fallback. Final decision is revisited at L8's crate-design checkpoint (⛔2).

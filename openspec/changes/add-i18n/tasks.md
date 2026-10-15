> Delegated execution: the orchestrator follows `orchestration.md` (lanes, ownership, merge gates, checkpoints). Only the orchestrator ticks boxes in this file.

## 0. Recon (read-only; append findings to design.md "Context")

- [x] 0.1 Confirm the touchpoints for a top-level option by tracing `payments` end-to-end on `main` and on `next`:
  - `packages/types`;
  - CLI: `index.ts`, `constants.ts`, prompts, validation, display, reproducible command, history, analytics, MCP, `virtual.ts`, `detect-project-config.ts`, post-install;
  - web: `constant.ts`, `stack-validation.ts`, `stack-utils.ts`, URL state, OG, agent content, docs;
  - generator: processors, handlers, post-process, README, task runners.
- [x] 0.2 Record the current template versions of Next, Vite, Expo, Nuxt, SvelteKit, Astro, Tauri, WXT and OpenTUI. Pick compatible versions of Lingui (including the SWC plugin), Paraglide, i18next (and its extractor), wuchale, `@better-auth/i18n`, `@clerk/localizations`, `@nuxtjs/i18n` and `@wxt-dev/i18n`.
- [x] 0.3 Evaluate maintained Rust ICU MessageFormat crates against the D7 subset. Decide whether to use a crate or ship the in-house evaluator. — removed: Rust dropped at ⛔2
- [x] 0.4 Confirm that Nitro's middleware, workers `nodejs_compat`, and lambda handlers support `AsyncLocalStorage` in the current templates. _(Resolved at ⛔1: AsyncLocalStorage is supported on Bun/Node natively and workers via `nodejs_compat`; there is no generated Lambda surface, so Lambda is out of scope for this change and would be a node-wrapping deploy target.)_
- [x] 0.5 List the anchors in each generated root/provider file that D9 `anchored-insert` will use. Add a test that fails if a template change removes an anchor.
- [x] 0.6 Record each dependency branch's head SHA in design.md "Context". The `wt/i18n` and stacked branches are created via the worktree skill, per `orchestration.md`.

## 1. Shared Configuration and Compatibility

- [x] 1.1 Add `I18nSchema` and `I18nOptionsSchema` to all configuration schemas, `AddInputSchema`, the JSON schema, analytics-safe values and display names.
- [x] 1.2 Create `packages/types/src/i18n.ts`, containing:
  - surfaces and `getI18nSurfaces`;
  - the `I18N_SUPPORT` matrix (using `satisfies`);
  - `I18N_LIBRARY_META`;
  - the validators;
  - routing support;
  - the integrations map.
- [ ] 1.3 Add `checkoutLocale` to `PaymentProviderMeta`, with Polar and Stripe set to `"api"` and the rest `"none"` (on the stacked branch for `wt/payment-providers`, see Section 12).
- [x] 1.4 Write the test-owned i18n Compatibility Oracle, plus unit tests for surfaces, matrix completeness, reason strings, default-library order, option validation and routing gates.

## 2. CLI

- [x] 2.1 Add the flags (D1), defaults and the reproducible-command round-trip.
- [x] 2.2 Add the interactive prompt after addons:
  - incompatible libraries shown disabled with the shared reason;
  - an experimental label on wuchale;
  - locale input validation;
  - routing and domain prompts shown only when supported.
- [x] 2.3 Wire `validateI18nCompatibility` and `validateI18nOptions` into programmatic validation as `Result.err(CLIError)`.
- [x] 2.4 Update the summary to show the library, locales, routing and "Also sets up" integrations. Update post-install next steps.
- [x] 2.5 Update MCP: schema, plan, and create contract.

## 3. Web Stack Builder

- [x] 3.1 Add the `i18n` category in `TECH_OPTIONS` with badges, defaults, presets, and `CATEGORY_ORDER` after addons.
- [x] 3.2 Build a locale editor (tags, source radio), a routing selector and a domain map editor, each shown only when supported.
- [x] 3.3 Implement disabled reasons and auto-fix in `stack-validation.ts` via the shared module. Show partial-support notes as hints.
- [x] 3.4 Add URL keys, OG image, agent content and analytics.
- [x] 3.5 Write parity tests against the oracle and a URL round-trip test.

## 4. Generator Core

- [x] 4.1 Add `template-handlers/i18n.ts` and `processors/i18n-deps.ts`, and register both.
- [x] 4.2 Add the shared `packages/i18n` templates: `config.ts`, `format.ts`, `server.ts`, `integrations/*`, `GLOSSARY.md`, and a `format.test.ts` inside the generated project.
- [x] 4.3 Add the root `i18n:*` scripts and task-runner wiring (turbo, nx, vite-plus), so `i18n:compile` runs before `dev`/`build` where needed.
- [x] 4.4 Add the README section: library, locales, routing, scripts, partial notes and integration notes.
- [x] 4.5 Regenerate `templates.generated.ts` with the script.

## 5. Libraries (parallelizable once Sections 1–4 have landed)

Surface order for each library: next → tanstack-start → server (incl. nitro) → native → solid → nuxt → svelte → astro → tanstack-router → react-router → wxt-* → opentui-* → electrobun-host.

For each library, the subtasks are: runtime, catalogs, the extract/compile/pending/apply/check/export scripts, surface glue for every non-unsupported surface, and the demo.

- [x] 5.1 Lingui, including the Bun preload macro plugin for Bun hosts.
- [x] 5.2 Paraglide, including `outdir` and ignore patterns per app, and CLI compile for non-Vite surfaces.
- [x] 5.3 i18next, with natural-language keys, the extractor, and the Svelte/Solid glue we ship.
- [x] 5.4 wuchale (experimental), with its AI translation disabled.

## 6. Locale Negotiation and Routing

- [x] 6.1 Add `negotiateLocale` and the `x-app-locale` header in every generated API client: tRPC/oRPC links, the Better Auth client and fetch helpers.
- [x] 6.2 Add the server locale middleware for hono, express, fastify, elysia and nitro across bun, node, workers and lambda.
- [x] 6.3 Implement `prefix` routing on each supported surface, plus the shared `localizeHref` used by every template link.
- [x] 6.4 Implement `domain` routing, including:
  - Better Auth `trustedOrigins` and cross-subdomain cookies;
  - CORS;
  - portless dev hosts;
  - hreflang;
  - the README warnings.

## 7. Built-in Localization Integrations

- [x] 7.1 Add `@better-auth/i18n`: the detection chain, the user `locale` field with the migration flow, and an editable overrides file.
- [x] 7.2 Add `@clerk/localizations` with lazy per-locale loading and the experimental note.
- [x] 7.3 Add Zod locales: client `z.config` on locale change, server boundary translation, and the BCP-47→Zod map.
- [x] 7.4 Add Nuxt UI `locale`, `@nuxtjs/i18n`, Astro `i18n`, Starlight and Fumadocs i18n, and the PWA manifest `lang`.
- [x] 7.5 Add `@wxt-dev/i18n` and `i18n:sync-wxt`.
- [x] 7.6 Add `expo-localization` and the Hermes `Intl` polyfills.
- [ ] 7.7 Bind Turnstile `language` (on the stacked branch for `wt/turnstile-addon`, see Section 12).
- [ ] 7.8 Add payment checkout `locale` for `checkoutLocale !== "none"` providers (on the stacked branch for `wt/payment-providers`, see Section 12).
- [ ] 7.9 Replace static RTL with locale-derived direction in shadcn (on the stacked branch for `wt/shadcn-theme-config`, see Section 12).
- [ ] 7.10 Localize React Email templates and pass the Better Auth recipient's locale (on the stacked branch for `wt/email-support`, see Section 12).
- [x] 7.11 Add the `lingui/skills` source to the skills addon.
- [x] 7.12 Write one focused test per integration proving it is added only when its `when()` holds.

## 8. Rust / Tauri — removed: Rust dropped at ⛔2

- [x] 8.1 Implement `i18n:export` normalized catalog generation for every library, with strict ICU-subset validation. — reinstated as JS-first tooling (no Rust) after the drop at ⛔2; the Rust crate/macro/extractor half stays removed
- [ ] 8.2 Generate the `packages/i18n/rust` crate: `build.rs` codegen, the runtime, the `t!` proc-macro with ID parity and missing-ID compile errors, Paraglide `m::*` functions, and ICU4X plurals and formatting. — removed: Rust dropped at ⛔2
- [ ] 8.3 Build the `syn`-based Rust extractor and merge it into each library's `i18n:extract`. — removed: Rust dropped at ⛔2
- [ ] 8.4 Add the `tauri-setup.ts` post-step: Cargo dependency, `set_locale` command, `sys-locale` init, menu rebuild, and `beforeDev/BuildCommand` export. — removed: Rust dropped at ⛔2
- [ ] 8.5 Write tests for the Rust unit evaluator and Lingui ID parity, and add the Tauri curated build case. — removed: Rust dropped at ⛔2

## 9. Translation Tooling and Skills

- [x] 9.1 Implement the `pending`/`apply`/`check` contract per library, with placeholder/ICU validation in `apply`.
- [x] 9.2 Write the `i18n-translate` skill template and mirror it to the skills-addon agent folders.
- [x] 9.3 Write the `i18n-adopt` skill template, with library-specific guidance.

## 10. Add Path Retrofitting

- [x] 10.1 Wire `--i18n`, `--i18n-locales` and the interactive add prompt into `add-handler.ts` and `AddInputSchema`. Add library-switch rejection.
- [x] 10.2 Implement the edit kinds: `create`, `config-edit` (magicast and structured edits), `anchored-insert` (single-match anchors) and `manual` (outro plus `I18N_SETUP.md`).
- [x] 10.3 Retrofit surfaces, integrations, scripts and skills. Add-locales mode.
- [ ] 10.4 Make generated apps inherit the project's i18n (on the stacked branch for `feat/generate-package-app`, see Section 12).
- [x] 10.5 Write the Add Path suite: pristine, user-modified, idempotent, add-locales, library-switch rejection and dry-run plan output.

## 11. Verification and Delivery

- [x] 11.1 Add the Curated Build Set cases (design D10) and the two Matrix Smoke rows.
- [x] 11.2 Add the MCP contract tests for the i18n fields and reasons.
- [x] 11.3 Write the docs: `cli/options.mdx`, `compatibility.mdx` (the table generated from `I18N_SUPPORT` or guarded by a test) and `bts-config.mdx`.
- [x] 11.4 Run `bun run check`, CLI tests, web tests, template regeneration and the full curated build. Review the diff for duplicated compatibility logic outside `i18n.ts`.

## 12. Stacked Dependency Branches (design D11)

Each branch is `wt/i18n` merged with one dependency branch, has its PR target `main`, and is aggregated into `next`. Keep it current by merging, never rebasing.

- [ ] 12.1 `wt/i18n-email`: tasks 7.10 and the email curated build case.
- [ ] 12.2 `wt/i18n-payments`: tasks 1.3 and 7.8.
- [ ] 12.3 `wt/i18n-turnstile`: task 7.7.
- [ ] 12.4 `wt/i18n-shadcn`: task 7.9.
- [ ] 12.5 `wt/i18n-generate-app`: task 10.4.
- [ ] 12.6 Integration check on a local throwaway branch (`origin/next` + `wt/i18n` + all `wt/i18n-*`): run `bun run check`, CLI and web tests, and the full Curated Build Set.

## Why

Generated Better T Stack projects ship English-only. Adding i18n by hand means wiring a library into every surface the stack produces:

- web frontends, native, server backends, email,
- Tauri,
- Electrobun, OpenTUI and WXT.

Each surface is wired differently. Several integrations already in the stack have their own built-in localization, and they all have to agree on a locale:

- Better Auth, Clerk, Zod, Nuxt UI, Turnstile,
- payment checkouts,
- Starlight and Fumadocs,
- shadcn RTL.

Doing this once in the generator, from one compatibility map, removes a large and error-prone setup task. The Add Path can also retrofit it into existing projects.

## What Changes

- Add an `i18n` choice (`lingui | paraglide | i18next | wuchale | none`) with `i18nOptions`:
  - `sourceLocale` and `locales`;
  - a routing strategy (`cookie | prefix | domain`);
  - a translate-skill toggle.
- The choice is available through the CLI, programmatic and MCP input, `bts.jsonc`, the JSON schema, and the web stack builder. `wuchale` is marked experimental.
- Add one shared compatibility module, `packages/types/src/i18n.ts`, with four parts:
  - **surfaces** derived from the Project Configuration;
  - a **library × surface support matrix** (native / adapter / partial / unsupported);
  - **routing support**;
  - a declarative **integrations map**.
- The CLI, web builder, generator and Add Path only consume this module.
- Automatically enable the **built-in localization** of selected integrations whenever i18n is not `none`. All of them read the same negotiated locale:
  - `@better-auth/i18n`, Clerk `@clerk/localizations`, Zod locales, Nuxt UI `locale`;
  - Turnstile `language`, payment checkout `locale`;
  - Starlight and Fumadocs i18n, shadcn direction;
  - `@nuxtjs/i18n`, `@wxt-dev/i18n`, Astro `i18n` routing, `expo-localization`.
- Generate a shared `@<project>/i18n` workspace package containing:
  - locale config and negotiation;
  - library-agnostic `Intl` formatters;
  - request-scoped locale;
  - library runtime;
  - a uniform script contract (`i18n:extract | compile | pending | apply | check | export`).
- Generate an agent skill (`i18n-translate`) that translates pending messages only through the script contract, so it works the same for every library and catalog format. Also generate an optional `i18n-adopt` skill for wrapping existing hard-coded strings.
- Support **Add Path retrofitting**:
  - `bts add --i18n <library>` adds i18n to an existing project.
  - `bts add --i18n-locales …` adds locales.
  - Configuration files are edited through AST and config edits. App root files are edited only at recognized anchors; otherwise the change is reported as an explicit manual step.
  - Apps created later by the generate-app path inherit i18n.

Non-goals:

- Hosted translation-management (TMS) integrations.
- Switching an existing project from one i18n library to another through the Add Path. That is rejected with guidance.
- Translating documentation content for Starlight or Fumadocs. Only their UI chrome is localized.
- ccTLD domain routing with shared sessions across unrelated domains. Subdomain routing is supported; separate-TLD routing is generated with per-domain sessions and documented.

## Capabilities

### New Capabilities

- `i18n`: library selection, compatibility, shared i18n package, per-surface wiring, built-in integration localization, routing strategies, translation tooling, and Add Path retrofitting.

### Modified Capabilities

None. Existing outputs change only when `i18n !== "none"`.

## Impact

- **`packages/types`:** schemas, the new `i18n.ts` module, the JSON schema, analytics-safe values, and a `checkoutLocale` field on `PaymentProviderMeta`.
- **`apps/cli`:** flags, prompts, validation, summaries, the reproducible command, MCP, post-install steps, Add Path retrofitting, and the skills addon source.
- **`apps/web`:** stack-builder category, validation, URL state, and docs.
- **`packages/template-generator`:** the i18n handler and deps processor, templates, task-runner wiring, and README.
- **Tests:**
  - an i18n compatibility oracle;
  - focused i18n compatibility coverage, outside the Exhaustive Matrix;
  - Curated Build Set additions;
  - an Add Path suite;
  - MCP contract coverage.

**Cross-branch dependencies.** Some integrations depend on features that live on open fork branches: `wt/email-support`, `wt/payment-providers`, `wt/turnstile-addon`, `wt/shadcn-theme-config` and `feat/generate-package-app`. Those integrations are built now, as **stacked branches**. Each one merges the core `wt/i18n` branch with exactly one dependency branch (design D11), so `next` aggregation picks them up without waiting for anything to reach `main`. The core `wt/i18n` branch depends only on `main`.

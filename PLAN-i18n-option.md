# Plan: Add An `i18n` Option

## Goal

Add an `i18n` option that scaffolds a shared package for messages and typed translation helpers, translates generated app strings into English message keys, and integrates Better Auth i18n configuration.

## Recommendation: Support Lingui and Paraglide JS

Offer two implementation choices when i18n is enabled:

- `lingui` using `@lingui/*`
- `paraglidejs` using `@inlang/paraglide-js`

Rationale:

- Lingui has mature extraction/compile workflows and broad ecosystem usage.
- Paraglide is compiler-based, emits typed message functions, and is framework agnostic.
- Both are good fits for this CLI's multi-framework frontend matrix.
- Keeping `off` as the default avoids extra complexity in generated stacks unless requested.

## Proposed Options

```ts
i18n: "off" | "lingui" | "paraglidejs";

i18nOptions?: {
  locales?: string[];
  defaultLocale?: string;
  strategy?: "cookie" | "path" | "header";
}
```

Defaults:

- `i18n`: `"off"`
- `locales`: `["en"]`
- `defaultLocale`: `"en"`
- `strategy`: `"cookie"` for app UI, with headers used on server requests where available

## Generated Package

When `i18n` is not `off`, scaffold a shared package:

```text
packages/i18n/
  package.json
  tsconfig.json
  project.inlang/
    settings.json
  messages/
    en.json
  src/
    index.ts
    server.ts
```

Generated output can either be:

- committed under a framework-specific generated folder (for example `packages/i18n/src/paraglide` or `packages/i18n/src/lingui-gen`), or
- generated during `postinstall`, `dev`, and `build`.

Prefer committing generated output for simpler TypeScript imports in scaffolded projects, then add a script to regenerate.

## String Migration Plan

Create translation keys for current generated strings, grouped by domain:

- `common.appName`
- `common.loading`
- `nav.home`
- `nav.dashboard`
- `auth.signIn.title`
- `auth.signIn.emailLabel`
- `auth.signIn.passwordLabel`
- `auth.signUp.title`
- `auth.signOut`
- `dashboard.title`
- `todo.title`
- `todo.empty`
- `ai.prompt.placeholder`

Implementation:

1. Add i18n variants of common frontend templates.
2. Replace hardcoded output strings using provider-specific conventions:

- `lingui`: use macro components/functions such as `<Trans>` (and related Lingui macros where appropriate).
- `paraglidejs`: use generated message functions such as `m.<key>()`.

3. Keep generated English values identical or slightly improved.
4. For native frontends, generate wrappers that can be used in React Native.
5. For server packages, expose a small `getLocaleFromRequest` helper.

## Better Auth i18n

When `auth` is `better-auth` and `i18n` is not `off`:

- Add `@better-auth/i18n`.
- Add the Better Auth `i18n` plugin.
- Use English translations initially, even though Better Auth already has English defaults, so the package demonstrates where app-owned keys belong.
- Configure detection through cookie and header.

## Framework Integration

Lingui:

- Use extraction/compile scripts in the i18n package and framework-level runtime providers where needed.
- For frameworks without first-class bindings, consume compiled messages through package exports.

Paraglide:

- Vite/TanStack Router/Solid/React Router: use Paraglide Vite plugin.
- TanStack Start/Vinext/Next/Nuxt/Svelte/Astro: add the relevant bundler or framework integration where stable; otherwise import generated runtime directly.
- API/server packages: use generated message functions and locale detection helpers without routing changes.

## Tests

- Schema and compatibility tests.
- Virtual generation tests for `packages/i18n`.
- Template tests that no selected frontend still contains key hardcoded user-facing strings when `i18n` is enabled.
- Better Auth template test for `@better-auth/i18n` plugin wiring.
- Type check a generated stack with `m.auth_signIn_title()` or equivalent.

## References

- Lingui intro: https://lingui.dev/introduction
- Paraglide JS docs: https://paraglidejs.com/
- Better Auth i18n plugin: https://better-auth.com/docs/plugins/i18n

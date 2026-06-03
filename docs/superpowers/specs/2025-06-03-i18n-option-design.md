# i18n Option Design

## Goal

Add an `i18n` option that scaffolds a shared package for messages and typed translation helpers, translates generated app strings into English message keys, and integrates Better Auth i18n configuration.

---

## 1. Supported Libraries

Offer two implementation choices when `i18n` is enabled:

- `lingui` using `@lingui/*`
- `paraglidejs` using `@inlang/paraglide-js`

**Rationale:**

- Lingui has mature extraction/compile workflows and broad ecosystem usage.
- Paraglide is compiler-based, emits typed message functions, and is framework agnostic.
- Both are good fits for this CLI's multi-framework frontend matrix.
- Keeping `"off"` as the default avoids extra complexity in generated stacks unless requested.

---

## 2. Data Model

```ts
type I18nOption = "off" | "lingui" | "paraglidejs";

type I18nConfig = {
  i18n: I18nOption;
  i18nOptions?: {
    locales?: string[];
    defaultLocale?: string;
    strategy?: "cookie" | "path" | "header";
  };
};
```

### 2.1 Defaults

- `i18n`: `"off"`
- `locales`: `["en"]`
- `defaultLocale`: `"en"`
- `strategy`: `"cookie"` for app UI, with headers used on server requests where available

---

## 3. Generated Package

When `i18n !== "off"`, scaffold:

```
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

- Committed under a framework-specific generated folder (e.g., `packages/i18n/src/paraglide` or `packages/i18n/src/lingui-gen`), or
- Generated during `postinstall`, `dev`, and `build`.

Prefer committing generated output for simpler TypeScript imports in scaffolded projects, then add a script to regenerate.

---

## 4. String Migration

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

### 4.1 Implementation

1. Add i18n variants of common frontend templates.
2. Replace hardcoded output strings using provider-specific conventions:
   - `lingui`: macro components/functions such as `<Trans>`
   - `paraglidejs`: generated message functions such as `m.<key>()`
3. Keep generated English values identical or slightly improved.
4. For native frontends, generate wrappers that can be used in React Native.
5. For server packages, expose a small `getLocaleFromRequest` helper.

---

## 5. Better Auth i18n

When `auth === "better-auth"` and `i18n !== "off"`:

- Add `@better-auth/i18n`.
- Add the Better Auth `i18n` plugin.
- Use English translations initially, so the package demonstrates where app-owned keys belong.
- Configure detection through cookie and header.

---

## 6. Framework Integration

### 6.1 Lingui

- Use extraction/compile scripts in the i18n package and framework-level runtime providers where needed.
- For frameworks without first-class bindings, consume compiled messages through package exports.

### 6.2 Paraglide

- Vite/TanStack Router/Solid/React Router: use Paraglide Vite plugin.
- TanStack Start/Vinext/Next/Nuxt/Svelte/Astro: add the relevant bundler or framework integration where stable; otherwise import generated runtime directly.
- API/server packages: use generated message functions and locale detection helpers without routing changes.

---

## 7. Tests

- Schema and compatibility tests.
- Virtual generation tests for `packages/i18n`.
- Template tests that no selected frontend still contains hardcoded user-facing strings when `i18n` is enabled.
- Better Auth template test for `@better-auth/i18n` plugin wiring.
- Type check a generated stack with `m.auth_signIn_title()` or equivalent.

---

## 8. References

- Lingui: https://lingui.dev/introduction
- Paraglide JS: https://paraglidejs.com/
- Better Auth i18n plugin: https://better-auth.com/docs/plugins/i18n

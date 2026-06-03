# Shadcn Theme Integration Design

## Goal

Enable users to customize their ShadCN/ui theme via a visual picker on the website (`/new` stack builder) and apply those themes during project scaffolding through the CLI. Also add a `ui` helper script to generated projects for adding shadcn components.

## Background

Shadcn/ui provides a `/create` page (https://ui.shadcn.com/create) that lets users visually pick colors, radius, and fonts to customize their shadcn theme. This generates a sharable preset. We want to integrate a similar experience into the `create-better-t-stack` website and CLI.

**References:**

- Shadcn `/create` implementation: https://github.com/shadcn-ui/ui/tree/main/apps/v4/app/(app)/create
- Shadcn `/create` site: https://ui.shadcn.com/create

## Sections

### 1. Data Model — ShadCN Theme Preset Schema

A theme preset is a JSON object encoded as a base64 string.

```ts
type ThemeToken =
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "border"
  | "input"
  | "ring"
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "sidebar"
  | "sidebar-foreground"
  | "sidebar-primary"
  | "sidebar-primary-foreground"
  | "sidebar-accent"
  | "sidebar-accent-foreground"
  | "sidebar-border"
  | "sidebar-ring";

type ShadcnThemePreset = {
  v: 1; // version
  name?: string; // e.g. "Crimson Pine"
  light: Partial<Record<ThemeToken, string>>; // CSS variable → oklch() or hex value
  dark: Partial<Record<ThemeToken, string>>;
  radius: number; // 0 – 1, maps to rem
  fontSans?: string; // e.g. "Inter Variable"
  fontMono?: string; // e.g. "Geist Mono"
};
```

**Serialization:** `btoa(JSON.stringify(preset))` (web), `Buffer.from(JSON.stringify(preset)).toString('base64')` (node).

**Defaults:** If no preset is provided (`theme === "default"`), the CLI generates the existing hard-coded theme values. A preset only overrides the tokens it explicitly contains; the template fills missing ones from current defaults.

**Validation:**

- Decode base64, parse JSON
- Check `v === 1`
- Validate `radius` is a number between 0 and 2
- Validate all color values are non-empty strings
- If validation fails, fall back to default theme and warn the user

---

### 2. CLI Changes

#### 2.1 Schema & Types (`packages/types/src/schemas.ts`)

Add `shadcnTheme` to `ProjectConfigSchema`:

```ts
shadcnTheme: z.string().optional().describe("Base64-encoded ShadCN theme preset"),
```

#### 2.2 Flag Support (`apps/cli/src/validation.ts`, `apps/cli/src/constants.ts`)

- Add `--shadcn-theme <base64>` CLI flag
- Add to `ProjectConfig` type
- Validate: if provided, attempt decode. If decode fails, throw validation error

#### 2.3 Interactive Prompt (`apps/cli/src/prompts/config-prompts.ts`)

After frontend/framework selection but before dependency installation, add a `shadcnTheme` prompt step:

```
? Pick a shadcn/ui theme:
  > Use default theme
    Paste a theme preset
    Skip (no shadcn/ui theming)
```

If "Paste a theme preset" is selected:

- Show text input: "Paste your theme preset (base64 string from better-t-stack.dev):"
- Attempt decode and validate
- If invalid, show error and return to the select prompt

If "Skip" is selected (only applicable for non-React frontends):

- Set `shadcnTheme` to undefined

#### 2.4 JSON/API Path

`createJson` and programmatic `create()` accept the same `shadcnTheme` field directly in the payload.

#### 2.5 Preset Application in Scaffolding

The decoded `ShadcnThemePreset` object is passed through `ProjectConfig` into `createProject()`, where it becomes available to Handlebars templates via the template context as `shadcnTheme`.

---

### 3. Web Builder Integration (`/new`)

#### 3.1 New "Theme" Category

Add `theme` to `StackState` in `apps/web/src/lib/constant.ts`:

```ts
theme: "default" | string; // "default" or base64 preset
```

Default: `"default"`.

Add to `TECH_OPTIONS` as a special category with a single "custom" option that opens the picker.

#### 3.2 Theme Picker Modal (`apps/web/src/app/(home)/new/_components/theme-picker/`)

A full-screen dialog/modal triggered from the Theme category.

**Layout:**

- Header: "Customize your shadcn/ui theme" + "Apply" button
- Left panel: Editor
- Right panel: Live preview

**Editor Tabs:**

1. **Colors**
   - Light/Dark toggle
   - Grid of color inputs for each `ThemeToken`
   - Each input: `<input type="color">` + text field for manual entry (hex/oklch)
   - Group tokens semantically: Surfaces, Text, Accents, Status, Charts

2. **Radius**
   - Slider: 0 to 1, step 0.0625
   - Live preview of border radius on sample components

3. **Typography**
   - Font Sans: select from common fonts (Inter, Geist, System UI, etc.)
   - Font Mono: select from common mono fonts
   - Preview text showing the selected fonts

**Live Preview Panel:**
Render a set of representative shadcn components (Button, Card, Badge, Input, Alert) using the current colors via inline CSS variables on a container element.

#### 3.3 Preset Serialization

When user clicks "Apply theme":

1. Gather current editor state into `ShadcnThemePreset` object
2. Set `name` to auto-generated or user-provided name (e.g. "Custom Theme")
3. Base64-encode: `btoa(JSON.stringify(preset))`
4. Store in `StackState.theme`
5. Close modal

When user clicks "Reset to default":

- Set `StackState.theme` to `"default"`

#### 3.4 CLI Command Integration

In `apps/web/src/lib/stack-utils.ts`, update `generateStackCommand()`:

```ts
if (stack.theme && stack.theme !== "default") {
  flags.push(`--shadcn-theme ${stack.theme}`);
}
```

#### 3.5 URL State

Add to `apps/web/src/lib/stack-url-keys.ts`:

```ts
theme: "t",
```

The base64 string is URL-safe (uses base64url alphabet), so the stack can be shared with the theme embedded.

#### 3.6 Preset Dropdown Integration

Store theme presets in local storage or as part of `PRESET_TEMPLATES`. When a preset is applied, the theme is also applied.

---

### 4. Template Changes

#### 4.1 Handlebars Helper (`packages/template-generator/src/core/template-processor.ts`)

Add a `themeVar` helper:

```ts
Handlebars.registerHelper("themeVar", function (mode, token, defaultValue) {
  const theme = this.shadcnTheme;
  if (theme && theme[mode] && theme[mode][token]) {
    return theme[mode][token];
  }
  return defaultValue;
});
```

#### 4.2 `globals.css.hbs` Template

Update to use the helper:

```hbs
:root { --background:
{{themeVar "light" "background" "oklch(1 0 0)"}}; --foreground:
{{themeVar "light" "foreground" "oklch(0.145 0 0)"}}; --card:
{{themeVar "light" "card" "oklch(1 0 0)"}}; --card-foreground:
{{themeVar "light" "card-foreground" "oklch(0.145 0 0)"}}; --popover:
{{themeVar "light" "popover" "oklch(1 0 0)"}}; --popover-foreground:
{{themeVar "light" "popover-foreground" "oklch(0.145 0 0)"}}; --primary:
{{themeVar "light" "primary" "oklch(0.205 0 0)"}}; --primary-foreground:
{{themeVar "light" "primary-foreground" "oklch(0.985 0 0)"}}; --secondary:
{{themeVar "light" "secondary" "oklch(0.97 0 0)"}}; --secondary-foreground:
{{themeVar "light" "secondary-foreground" "oklch(0.205 0 0)"}}; --muted:
{{themeVar "light" "muted" "oklch(0.97 0 0)"}}; --muted-foreground:
{{themeVar "light" "muted-foreground" "oklch(0.556 0 0)"}}; --accent:
{{themeVar "light" "accent" "oklch(0.97 0 0)"}}; --accent-foreground:
{{themeVar "light" "accent-foreground" "oklch(0.205 0 0)"}}; --destructive:
{{themeVar "light" "destructive" "oklch(0.58 0.22 27)"}}; --border:
{{themeVar "light" "border" "oklch(0.922 0 0)"}}; --input:
{{themeVar "light" "input" "oklch(0.922 0 0)"}}; --ring:
{{themeVar "light" "ring" "oklch(0.708 0 0)"}}; --chart-1:
{{themeVar "light" "chart-1" "oklch(0.809 0.105 251.813)"}}; --chart-2:
{{themeVar "light" "chart-2" "oklch(0.623 0.214 259.815)"}}; --chart-3:
{{themeVar "light" "chart-3" "oklch(0.546 0.245 262.881)"}}; --chart-4:
{{themeVar "light" "chart-4" "oklch(0.488 0.243 264.376)"}}; --chart-5:
{{themeVar "light" "chart-5" "oklch(0.424 0.199 265.638)"}}; --radius:
{{#if shadcnTheme.radius}}{{shadcnTheme.radius}}rem{{else}}0.625rem{{/if}}; --sidebar:
{{themeVar "light" "sidebar" "oklch(0.985 0 0)"}}; --sidebar-foreground:
{{themeVar "light" "sidebar-foreground" "oklch(0.145 0 0)"}}; --sidebar-primary:
{{themeVar "light" "sidebar-primary" "oklch(0.205 0 0)"}}; --sidebar-primary-foreground:
{{themeVar "light" "sidebar-primary-foreground" "oklch(0.985 0 0)"}}; --sidebar-accent:
{{themeVar "light" "sidebar-accent" "oklch(0.97 0 0)"}}; --sidebar-accent-foreground:
{{themeVar "light" "sidebar-accent-foreground" "oklch(0.205 0 0)"}}; --sidebar-border:
{{themeVar "light" "sidebar-border" "oklch(0.922 0 0)"}}; --sidebar-ring:
{{themeVar "light" "sidebar-ring" "oklch(0.708 0 0)"}}; } .dark { --background:
{{themeVar "dark" "background" "oklch(0.145 0 0)"}}; --foreground:
{{themeVar "dark" "foreground" "oklch(0.985 0 0)"}}; /* ... repeat for all dark tokens ... */ }
@theme inline { --font-sans:
{{#if shadcnTheme.fontSans}}'{{shadcnTheme.fontSans}}', {{/if}}sans-serif; --font-mono:
{{#if shadcnTheme.fontMono}}'{{shadcnTheme.fontMono}}', {{/if}}monospace; /* ... rest of theme
mappings ... */ }
```

---

### 5. Root `package.json` Helper Script

Add to the generated project's root `package.json` template (`packages/template-generator/templates/monorepo-root/package.json.hbs`):

```json
{
  "scripts": {
    "ui": "cd packages/ui && bun shadcn add"
  }
}
```

**Usage:**

- `bun ui button` → adds `button` to `packages/ui`
- `bun ui` → opens the shadcn interactive component picker scoped to `packages/ui`
- `bun ui --all` → adds all available components

This script only appears when the project includes a React web frontend (which triggers the `packages/ui` generation). For non-shadcn projects, the script is omitted.

---

### 6. Testing Strategy

#### 6.1 Unit Tests

- `packages/template-generator/test`: Test `themeVar` helper with various preset combinations
- `apps/cli/test`: Test preset validation (valid base64, invalid base64, malformed JSON, wrong version)
- `apps/cli/test`: Test CLI flag parsing for `--shadcn-theme`

#### 6.2 Integration Tests

- Generate a project with a custom theme preset and verify `globals.css` contains the custom values
- Generate a project without a preset and verify `globals.css` contains defaults
- Test the web builder's `generateStackCommand` includes `--shadcn-theme` when theme is set

---

### 7. Documentation Updates

- Update `apps/web/content/docs/cli/options.mdx` to document `--shadcn-theme`
- Update `apps/web/content/docs/cli/prompts.mdx` to describe the theme selection prompt
- Update `apps/web/content/docs/project-structure.mdx` to mention `bun ui` command
- Add a new section to the stack builder docs about the theme picker

---

### 8. Rollback / Error Handling

- If theme preset decode fails in CLI: silently fall back to default theme, log a warning
- If theme preset is invalid in web builder: show validation error in modal, disable "Apply"
- If `packages/ui` doesn't exist (non-React project): `bun ui` script is omitted from `package.json`

---

### 9. Security Considerations

- Base64 strings in URLs are safe (no XSS risk as they're data, not executable)
- Color values are output directly into CSS — sanitize to ensure only valid CSS color values are accepted (regex check for hex, oklch, hsl, rgb)
- No user-provided strings are executed as code

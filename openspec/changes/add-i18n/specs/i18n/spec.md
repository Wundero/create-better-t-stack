## ADDED Requirements

### Requirement: i18n library selection

The system SHALL let users choose an i18n library (`lingui`, `paraglide`, `i18next`, `wuchale`, or `none`) and i18n options. The choice SHALL be available through the interactive CLI, programmatic and MCP input, `bts.jsonc`, the JSON schema, and the web stack builder. `wuchale` SHALL be labelled experimental.

#### Scenario: Interactive selection

- **WHEN** a user reaches the i18n prompt
- **THEN** each compatible library is selectable, each incompatible library is shown disabled with the shared reason string, and the default is the first compatible of lingui, paraglide, i18next

#### Scenario: Programmatic rejection

- **WHEN** a user supplies an i18n library that does not support a surface in the configuration (for example `frontend: ["svelte"]` with `i18n: "lingui"`)
- **THEN** validation fails with the reason string produced by the shared compatibility module

#### Scenario: Default unchanged

- **WHEN** no i18n value is supplied
- **THEN** `i18n` is `"none"` and generated output is identical to the output before this change

### Requirement: Single compatibility source

All i18n compatibility, routing, and integration rules SHALL be defined in `packages/types/src/i18n.ts`. The CLI, web builder, generator, and Add Path SHALL consume that module and SHALL NOT define i18n rules of their own.

#### Scenario: Matrix completeness

- **WHEN** a library or surface is added to the module
- **THEN** typechecking fails until every library × surface support cell is defined

#### Scenario: CLI and web parity

- **WHEN** any configuration is evaluated by the CLI validator and the web stack builder
- **THEN** both reject exactly the configurations the test-owned i18n compatibility oracle rejects, with the same reason string

### Requirement: Shared i18n package and formatting

When i18n is enabled, the generator SHALL create a `@<project>/i18n` workspace package. The package SHALL contain locale configuration, negotiation, request-scoped locale storage, library runtime, uniform `i18n:*` scripts, and native-`Intl` formatters for date, time, number, currency, percent, unit, relative time, list, and plural category. These formatters SHALL be shared by all libraries.

#### Scenario: Library-agnostic formatting

- **WHEN** a project is generated with any i18n library
- **THEN** generated templates format dates and numbers only through the shared formatters, and the formatters produce identical output for identical locales across libraries

#### Scenario: Demo rendering

- **WHEN** a fixture translation for `fr` is applied and the locale is set to `fr`
- **THEN** each surface's demo renders the translated heading, interpolation, plural, currency, and date in French

### Requirement: Built-in integration localization

When i18n is enabled, the generator SHALL automatically enable the built-in localization of selected integrations and feed it the shared negotiated locale. This covers:

- Better Auth, Clerk, and Zod;
- Nuxt UI, `@nuxtjs/i18n`, and Astro `i18n`;
- Starlight and Fumadocs;
- WXT manifest localization, Expo localization, and PWA manifest language;
- Turnstile, payment checkout locale, shadcn direction, and React Email, when those features exist in the configuration.

#### Scenario: Better Auth error messages

- **WHEN** Better Auth and any i18n library are selected and a client with locale `fr` triggers an auth error
- **THEN** the server returns the error message in French using `@better-auth/i18n` built-in translations

#### Scenario: Integration absent

- **WHEN** an integration's feature is not part of the configuration
- **THEN** none of its dependencies, configuration, or files are generated

#### Scenario: Unsupported built-in locale

- **WHEN** a configured locale has no built-in translation in an integration
- **THEN** that integration falls back to its default language and the generator reports a warning naming the integration and locale

### Requirement: Locale negotiation and routing

The generated project SHALL negotiate the locale with one shared function. The order SHALL be:

1. the routing source;
2. the `x-app-locale` header;
3. the locale cookie;
4. `Accept-Language`;
5. stored or system value;
6. the source locale.

The generated project SHALL support the `cookie`, `prefix`, and `domain` routing strategies where the compatibility module allows them.

#### Scenario: Cross-origin API calls

- **WHEN** a web or native client calls a separate server backend
- **THEN** the request carries `x-app-locale` and server-side translations use that locale

#### Scenario: Unsupported routing strategy

- **WHEN** `domain` routing is requested for a configuration containing a statically built or SPA-only web surface
- **THEN** validation fails with the shared reason

#### Scenario: Domain sessions

- **WHEN** `domain` routing is generated with Better Auth and all domains share a registrable parent domain
- **THEN** trusted origins include every domain and the session cookie is shared across those subdomains

### Requirement: Rust translations from shared catalogs

When the Tauri addon and i18n are both selected, the generator SHALL produce a Rust i18n crate. The crate SHALL compile translations from the same catalogs used by JavaScript, through a normalized export. It SHALL provide a `t!` macro whose message IDs match the JavaScript library's IDs, or typed message functions for ID-keyed libraries.

#### Scenario: Shared message

- **WHEN** a source sentence is used both in a web component and in `t!` in `src-tauri`, and a French translation is applied once
- **THEN** both the webview and the Rust host render the same French translation

#### Scenario: Missing message

- **WHEN** Rust code uses `t!` with a message that is not in the source catalog
- **THEN** `cargo build` fails with a compile error naming the message

### Requirement: Agent translation workflow

The generated project SHALL expose the `i18n:pending`, `i18n:apply`, and `i18n:check` scripts with a library-independent JSON contract. When the translate-skill option is enabled, it SHALL include an `i18n-translate` agent skill that translates only through those scripts.

#### Scenario: Placeholder protection

- **WHEN** `i18n:apply` receives a translation whose placeholders or ICU arguments differ from the source
- **THEN** that item is rejected with an error and its catalog entry stays pending

### Requirement: Add Path retrofitting

The Add Path SHALL add i18n to an existing Better T Stack project, add locales to a project that already has i18n, and reject switching libraries. Existing user edits SHALL be preserved.

#### Scenario: Pristine project

- **WHEN** `bts add --i18n paraglide` runs on an unmodified generated project
- **THEN** all surfaces and integrations are wired, `bts.jsonc` records the i18n configuration, and the project builds

#### Scenario: Customized root file

- **WHEN** a required anchor is missing or appears more than once in a user-modified file
- **THEN** that file is not modified, and the exact required change is reported in the outro and in `I18N_SETUP.md`

#### Scenario: Idempotent re-run

- **WHEN** the same add command runs twice
- **THEN** the second run plans no changes

#### Scenario: Library switch

- **WHEN** a project with `i18n: "lingui"` runs `bts add --i18n i18next`
- **THEN** the command fails with guidance and plans no changes

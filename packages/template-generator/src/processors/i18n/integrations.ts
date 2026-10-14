import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import type { TemplateData } from "../../template-handlers/utils";

/**
 * Built-in localization integration templates (lane L7).
 *
 * TODO(L7): emit `templates/i18n/integrations/<integration-id>/**` for each
 * active entry of `getI18nIntegrations(config, library)`. Integration-specific
 * destinations are L7's choice; the stub exists so L7 owns one file.
 */
export function processI18nIntegrationTemplates(
  _vfs: VirtualFileSystem,
  _templates: TemplateData,
  _config: ProjectConfig,
): void {}

/**
 * Built-in localization processing (lane L7).
 *
 * TODO(L7): wire `@better-auth/i18n`, `@clerk/localizations`, Zod locales,
 * Nuxt UI, `@nuxtjs/i18n`, Astro `i18n`, Starlight, Fumadocs, the PWA manifest
 * language, `@wxt-dev/i18n`, Expo localization, and the `lingui/skills`
 * source. Always consumes `getI18nIntegrations` so the `when()` rules stay in
 * `packages/types/src/i18n.ts`. Called by `processors/i18n-deps.ts`.
 */
export function processI18nIntegrations(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}

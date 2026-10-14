import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import type { TemplateData } from "../../template-handlers/utils";

/**
 * Routing templates (lane L6).
 *
 * TODO(L6): emit `templates/i18n/routing/<surface>/**` for each routed surface
 * (prefix/domain middleware, `localizeHref`, hreflang) through
 * `processTemplatesFromPrefix`. Called by `template-handlers/i18n.ts`; this is
 * an empty stub so L6 owns the whole file.
 */
export function processI18nRoutingTemplates(
  _vfs: VirtualFileSystem,
  _templates: TemplateData,
  _config: ProjectConfig,
): void {}

/**
 * Routing processing (lane L6).
 *
 * TODO(L6): programmatic edits for the routing strategies — server locale
 * middleware, the `x-app-locale` header in generated API clients,
 * `trustedOrigins`/CORS for domain routing, and portless dev hosts. Called by
 * `processors/i18n-deps.ts`.
 */
export function processI18nRouting(_vfs: VirtualFileSystem, _config: ProjectConfig): void {}

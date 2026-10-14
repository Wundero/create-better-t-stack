import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import type { TemplateData } from "../../template-handlers/utils";
import { processSingleTemplate, processTemplatesFromPrefix } from "../../template-handlers/utils";
import { addPackageDependency } from "../../utils/add-deps";

/**
 * Locale negotiation and routing (lane L6).
 *
 * `processI18nRoutingTemplates` emits the files: the shared URL helpers
 * (`localizeHref`, `negotiateRequestLocale`, `hreflangLinks`), the server
 * locale middleware for the selected backend, and the `prefix`/`domain`
 * surface glue. `processI18nRouting` wires them into existing generated files
 * with single-match anchors: server entries, Better Auth `trustedOrigins` /
 * cross-subdomain cookies and the CORS allowlists.
 */

const SERVER_BACKENDS = ["hono", "express", "fastify", "elysia", "nitro"] as const;
type ServerBackend = (typeof SERVER_BACKENDS)[number];

const SERVER_ENTRY_PATH = "apps/server/src/index.ts";
const AUTH_PACKAGE_PATH = "packages/auth/package.json";
const AUTH_ENTRY_PATH = "packages/auth/src/index.ts";

function isServerBackend(value: string | undefined): value is ServerBackend {
  return value !== undefined && (SERVER_BACKENDS as readonly string[]).includes(value);
}

function routingStrategy(config: ProjectConfig): "cookie" | "prefix" | "domain" {
  return config.i18nOptions?.routing?.strategy ?? "cookie";
}

/** Inserts after `anchor` when it appears exactly once, `undefined` otherwise. */
function insertAfterOnce(content: string, anchor: string, insertion: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  const end = index + anchor.length;
  return `${content.slice(0, end)}${insertion}${content.slice(end)}`;
}

/** Inserts before `anchor` when it appears exactly once, `undefined` otherwise. */
function insertBeforeOnce(content: string, anchor: string, insertion: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return `${content.slice(0, index)}${insertion}${content.slice(index)}`;
}

/** Replaces `anchor` when it appears exactly once, `undefined` otherwise. */
function replaceOnce(content: string, anchor: string, replacement: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return `${content.slice(0, index)}${replacement}${content.slice(index + anchor.length)}`;
}

/** Applies anchor insertions to a generated file, leaving it untouched on drift. */
function applyInsertions(
  vfs: VirtualFileSystem,
  path: string,
  insertions: readonly (readonly [string, string])[],
): string | undefined {
  const content = vfs.readFile(path);
  if (content === undefined) return undefined;

  let updated = content;
  for (const [anchor, insertion] of insertions) {
    const next = insertAfterOnce(updated, anchor, insertion);
    if (next === undefined) return content;
    updated = next;
  }

  vfs.writeFile(path, updated);
  return updated;
}

export function processI18nRoutingTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): void {
  const library = config.i18n;
  if (!library || library === "none") return;

  processTemplatesFromPrefix(vfs, templates, "i18n/routing/shared", "packages/i18n", config);

  if (isServerBackend(config.backend)) {
    const destination =
      config.backend === "nitro" ? "apps/server/server/middleware" : "apps/server/src/middleware";
    processTemplatesFromPrefix(
      vfs,
      templates,
      `i18n/routing/server/${config.backend}`,
      destination,
      config,
    );
  }

  if (routingStrategy(config) === "cookie") return;

  if (config.frontend.includes("next")) {
    processSingleTemplate(
      vfs,
      templates,
      "i18n/routing/surface/next/middleware.ts",
      "apps/web/src/middleware.ts",
      config,
    );
  }

  if (config.frontend.includes("svelte") && library === "paraglide") {
    processSingleTemplate(
      vfs,
      templates,
      "i18n/routing/surface/svelte/hooks.client.ts",
      "apps/web/src/hooks.client.ts",
      config,
    );
    // A project-owned `hooks.server.ts` (better-auth fullstack) already owns
    // the request pipeline; only add the SSR reroute when it is absent.
    if (!vfs.exists("apps/web/src/hooks.server.ts")) {
      processSingleTemplate(
        vfs,
        templates,
        "i18n/routing/surface/svelte/hooks.server.ts",
        "apps/web/src/hooks.server.ts",
        config,
      );
    }
  }
}

export function processI18nRouting(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const library = config.i18n;
  if (!library || library === "none") return;

  registerServerLocaleMiddleware(vfs, config);

  if (routingStrategy(config) !== "domain") return;

  wireBetterAuthDomains(vfs, config);
  addLocaleCorsOrigins(vfs, config);
}

/** Registers the middleware file in each backend entry (nitro auto-loads its
 * `server/middleware/` directory, so it needs no edit). */
function registerServerLocaleMiddleware(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.backend === "hono") {
    applyInsertions(vfs, SERVER_ENTRY_PATH, [
      [
        'import { logger } from "hono/logger";',
        '\nimport { localeMiddleware } from "./middleware/locale";',
      ],
      ["app.use(logger());", "\n\napp.use(localeMiddleware);"],
    ]);
    return;
  }

  if (config.backend === "express") {
    applyInsertions(vfs, SERVER_ENTRY_PATH, [
      ['import cors from "cors";', '\nimport { localeMiddleware } from "./middleware/locale";'],
      ["const app = express();", "\n\napp.use(localeMiddleware);"],
    ]);
    return;
  }

  if (config.backend === "fastify") {
    applyInsertions(vfs, SERVER_ENTRY_PATH, [
      [
        'import fastifyCors from "@fastify/cors";',
        '\nimport { registerLocale } from "./middleware/locale";',
      ],
      ["fastify.register(fastifyCors, baseCorsConfig);", "\n\nregisterLocale(fastify);"],
    ]);
    return;
  }

  if (config.backend === "elysia") {
    registerElysiaLocale(vfs, config);
  }
}

/**
 * Elysia lifecycle hooks have no `next()` to wrap, so `withLocale(app)` must
 * run before `.listen()`. The non-Vercel entry is one chained expression, so
 * it is bound to `app` first.
 */
function registerElysiaLocale(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const content = vfs.readFile(SERVER_ENTRY_PATH);
  if (content === undefined) return;

  const withImport = insertAfterOnce(
    content,
    'import { cors } from "@elysiajs/cors";',
    '\nimport { withLocale } from "./middleware/locale";',
  );
  if (withImport === undefined) return;

  if (config.serverDeploy === "vercel") {
    const updated = insertAfterOnce(withImport, "export default app;", "\n\nwithLocale(app);");
    if (updated !== undefined) vfs.writeFile(SERVER_ENTRY_PATH, updated);
    return;
  }

  const bound = insertBeforeOnce(withImport, "new Elysia(", "const app = ");
  if (bound === undefined) return;

  const updated = replaceOnce(
    bound,
    "\n\t.listen(3000, () => {",
    ";\n\nwithLocale(app);\n\napp.listen(3000, () => {",
  );
  if (updated !== undefined) vfs.writeFile(SERVER_ENTRY_PATH, updated);
}

/** The registrable parent shared by every host, when one exists. */
function sharedRegistrableParent(hosts: readonly string[]): string | undefined {
  if (hosts.length < 2) return undefined;
  if (hosts.some((host) => !host.includes("."))) return undefined;

  const parents = hosts.map((host) => host.split(".").slice(-2).join("."));
  const [first] = parents;
  return first !== undefined && parents.every((parent) => parent === first) ? first : undefined;
}

function workspaceVersion(config: ProjectConfig): string {
  return config.packageManager === "npm" ? "*" : "workspace:*";
}

/** D6: Better Auth trusts every locale domain and shares the session across
 * subdomains when they share a registrable parent. */
function wireBetterAuthDomains(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.auth !== "better-auth") return;

  const content = vfs.readFile(AUTH_ENTRY_PATH);
  if (content === undefined) return;

  const withImport = insertAfterOnce(
    content,
    'import { betterAuth } from "better-auth";',
    `\nimport { localeDomains } from "@${config.projectName}/i18n/config";`,
  );
  if (withImport === undefined) return;

  let updated = replaceOnce(
    withImport,
    "    trustedOrigins: [",
    "    trustedOrigins: [\n      ...Object.values(localeDomains),",
  );
  if (updated === undefined) return;

  const parent = sharedRegistrableParent(Object.values(config.i18nOptions?.routing?.domains ?? {}));
  if (parent) {
    const crossSubDomain = `      crossSubDomainCookies: {\n        enabled: true,\n        domain: ".${parent}",\n      },`;
    updated = updated.includes("    advanced: {")
      ? insertAfterOnce(updated, "    advanced: {", `\n${crossSubDomain}`)
      : insertAfterOnce(
          updated,
          "    baseURL: env.BETTER_AUTH_URL,",
          `\n    advanced: {\n${crossSubDomain}\n    },`,
        );
    if (updated === undefined) return;
  }

  vfs.writeFile(AUTH_ENTRY_PATH, updated);

  addPackageDependency({
    vfs,
    packagePath: AUTH_PACKAGE_PATH,
    customDependencies: { [`@${config.projectName}/i18n`]: workspaceVersion(config) },
  });
}

interface CorsEdit {
  readonly path: string;
  readonly importAnchor: string;
  readonly replacements: readonly (readonly [string, string])[];
}

const CORS_EDITS = {
  hono: {
    path: SERVER_ENTRY_PATH,
    importAnchor: 'import { Hono } from "hono";',
    replacements: [
      [
        "origin: [ENV.CORS_ORIGIN, ...desktopOrigins],",
        "origin: [ENV.CORS_ORIGIN, ...desktopOrigins, ...Object.values(localeDomains)],",
      ],
      ["origin: ENV.CORS_ORIGIN,", "origin: [ENV.CORS_ORIGIN, ...Object.values(localeDomains)],"],
    ],
  },
  express: {
    path: SERVER_ENTRY_PATH,
    importAnchor: 'import express from "express";',
    replacements: [
      [
        "origin: [ENV.CORS_ORIGIN, ...desktopOrigins],",
        "origin: [ENV.CORS_ORIGIN, ...desktopOrigins, ...Object.values(localeDomains)],",
      ],
      ["origin: ENV.CORS_ORIGIN,", "origin: [ENV.CORS_ORIGIN, ...Object.values(localeDomains)],"],
    ],
  },
  fastify: {
    path: SERVER_ENTRY_PATH,
    importAnchor: 'import Fastify from "fastify";',
    replacements: [
      ["origin: ENV.CORS_ORIGIN,", "origin: [ENV.CORS_ORIGIN, ...Object.values(localeDomains)],"],
    ],
  },
  elysia: {
    path: SERVER_ENTRY_PATH,
    importAnchor: 'import { Elysia } from "elysia";',
    replacements: [
      [
        "origin: [ENV.CORS_ORIGIN, ...desktopOrigins],",
        "origin: [ENV.CORS_ORIGIN, ...desktopOrigins, ...Object.values(localeDomains)],",
      ],
      ["origin: ENV.CORS_ORIGIN,", "origin: [ENV.CORS_ORIGIN, ...Object.values(localeDomains)],"],
    ],
  },
  nitro: {
    path: "apps/server/server/middleware/cors.ts",
    importAnchor: 'import { handleCors } from "nitro/h3";',
    replacements: [
      ["origin: [ENV.CORS_ORIGIN],", "origin: [ENV.CORS_ORIGIN, ...Object.values(localeDomains)],"],
    ],
  },
} satisfies Record<ServerBackend, CorsEdit>;

/** D6: every CORS allowlist includes the locale domains. */
function addLocaleCorsOrigins(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const backend = config.backend;
  if (!isServerBackend(backend)) return;

  const edit = CORS_EDITS[backend];
  const content = vfs.readFile(edit.path);
  if (content === undefined) return;

  let updated: string | undefined;
  for (const [anchor, replacement] of edit.replacements) {
    const next = replaceOnce(content, anchor, replacement);
    if (next !== undefined) {
      updated = next;
      break;
    }
  }
  if (updated === undefined) return;

  const withImport = insertAfterOnce(
    updated,
    edit.importAnchor,
    `\nimport { localeDomains } from "@${config.projectName}/i18n/config";`,
  );
  if (withImport === undefined) return;

  vfs.writeFile(edit.path, withImport);
}

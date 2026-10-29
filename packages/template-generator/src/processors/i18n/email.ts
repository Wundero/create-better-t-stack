import type { I18nLibrary, ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../../core/virtual-fs";
import { processSingleTemplate, type TemplateData } from "../../template-handlers/utils";
import { addPackageDependency, type AvailableDependencies } from "../../utils/add-deps";

/**
 * `react-email-locale` integration (stacked branch `wt/i18n-email`).
 *
 * React Email templates take a `locale` prop and translate through the
 * selected library (`templates/i18n/surface/<library>/email/**`). This handler
 * adds the email and auth workspace dependencies and patches the Better Auth
 * server with `sendResetPassword` / `sendVerificationEmail` callbacks that
 * resolve the recipient's locale as `user.locale` → request locale → source.
 *
 * The convex auth variant is skipped: Better Auth on Convex has no request
 * object for the callbacks to negotiate against.
 */

const EMAIL_PACKAGE = "packages/email/package.json";
const AUTH_PACKAGE = "packages/auth/package.json";
const AUTH_SERVER = "packages/auth/src/index.ts";
const AUTH_TSCONFIG = "packages/auth/tsconfig.json";

const AUTH_IMPORT_ANCHOR = 'import { betterAuth } from "better-auth";';
const AUTH_CREDENTIALS_ANCHOR = "    emailAndPassword: { enabled: true },";
const AUTH_COMPILER_OPTIONS_ANCHOR = '"compilerOptions": {';
const AUTH_INCLUDE_ANCHOR = '"include": ["src/**/*.ts"],';

/** Matches the `packages/email` pins; both packages render React email components. */
const AUTH_REACT_VERSIONS = {
  react: "^19.2.8",
  "@types/react": "^19.2.18",
} as const;

/** Library packages the email templates import directly (paraglide and wuchale re-export). */
const EMAIL_LIBRARY_DEPENDENCIES = {
  lingui: ["@lingui/core"],
  paraglide: [],
  i18next: ["i18next"],
  wuchale: [],
} as const satisfies Record<I18nLibrary, readonly AvailableDependencies[]>;

function workspaceVersion(config: ProjectConfig): string {
  return config.packageManager === "npm" ? "*" : "workspace:*";
}

function patch(
  vfs: VirtualFileSystem,
  filePath: string,
  transform: (content: string) => string | undefined,
): void {
  const content = vfs.readFile(filePath);
  if (content === undefined) return;
  const next = transform(content);
  if (next !== undefined && next !== content) vfs.writeFile(filePath, next);
}

function insertAfterOnce(content: string, anchor: string, addition: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index + anchor.length) + addition + content.slice(index + anchor.length);
}

function replaceOnce(content: string, anchor: string, replacement: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;
  return content.slice(0, index) + replacement + content.slice(index + anchor.length);
}

function patchAuthServer(vfs: VirtualFileSystem): void {
  patch(vfs, AUTH_SERVER, (content) => {
    const withImport = insertAfterOnce(
      content,
      AUTH_IMPORT_ANCHOR,
      '\nimport { sendResetPassword, sendVerificationEmail } from "./email";',
    );
    if (!withImport) return undefined;
    return replaceOnce(
      withImport,
      AUTH_CREDENTIALS_ANCHOR,
      [
        "    emailAndPassword: {",
        "      enabled: true,",
        "      sendResetPassword,",
        "    },",
        "    emailVerification: {",
        "      sendVerificationEmail,",
        "    },",
      ].join("\n"),
    );
  });
}

/**
 * `packages/auth` compiles `src/email.tsx` (JSX) with `noUnusedLocals` and a
 * composite build: the tsconfig needs the automatic JSX runtime, and the
 * `orpc` variant also needs `.tsx` in its explicit `include` list.
 */
function patchAuthTsconfig(vfs: VirtualFileSystem): void {
  patch(vfs, AUTH_TSCONFIG, (content) => {
    const withJsx = insertAfterOnce(
      content,
      AUTH_COMPILER_OPTIONS_ANCHOR,
      '\n    "jsx": "react-jsx",',
    );
    if (!withJsx) return undefined;
    return (
      replaceOnce(withJsx, AUTH_INCLUDE_ANCHOR, '"include": ["src/**/*.ts", "src/**/*.tsx"],') ??
      withJsx
    );
  });
}

function addEmailWorkspaceDependencies(vfs: VirtualFileSystem, config: ProjectConfig): void {
  const library = config.i18n;
  if (library === "none") return;
  const i18nWorkspace = { [`@${config.projectName}/i18n`]: workspaceVersion(config) };

  if (vfs.exists(EMAIL_PACKAGE)) {
    addPackageDependency({
      vfs,
      packagePath: EMAIL_PACKAGE,
      dependencies: [...EMAIL_LIBRARY_DEPENDENCIES[library]],
      customDependencies: i18nWorkspace,
    });
  }

  if (!vfs.exists(AUTH_PACKAGE)) return;
  addPackageDependency({
    vfs,
    packagePath: AUTH_PACKAGE,
    customDependencies: {
      ...i18nWorkspace,
      [`@${config.projectName}/email`]: workspaceVersion(config),
      react: AUTH_REACT_VERSIONS.react,
    },
    customDevDependencies: { "@types/react": AUTH_REACT_VERSIONS["@types/react"] },
  });
}

/** Template phase: emits the locale-aware Better Auth callbacks. */
export function processEmailLocaleTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): void {
  if (!vfs.exists(AUTH_PACKAGE)) return;
  processSingleTemplate(
    vfs,
    templates,
    "i18n/integrations/email/auth-email.tsx",
    "packages/auth/src/email.tsx",
    config,
  );
}

/** Dependency phase: workspace dependencies and the auth server patch. */
export function processEmailLocale(vfs: VirtualFileSystem, config: ProjectConfig): void {
  addEmailWorkspaceDependencies(vfs, config);
  patchAuthServer(vfs);
  patchAuthTsconfig(vfs);
}

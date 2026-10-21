export const WORKSPACE_APP_DIRS = [
  "apps/server",
  "apps/web",
  "apps/native",
  "apps/desktop",
  "apps/fumadocs",
  "apps/docs",
] as const;

export const WORKSPACE_PACKAGE_DIRS = [
  "packages/api",
  "packages/db",
  "packages/auth",
  "packages/backend",
  "packages/config",
  "packages/email",
  "packages/env",
  "packages/infra",
  "packages/ui",
] as const;

export const CATALOG_PACKAGE_PATHS = [
  ".",
  ...WORKSPACE_APP_DIRS,
  ...WORKSPACE_PACKAGE_DIRS,
  // The generated i18n package participates in dependency catalogs whenever it
  // exists; projects without i18n simply skip the missing package.json.
  "packages/i18n",
] as const;

export const ALL_WORKSPACE_PACKAGE_JSON_PATHS = [
  "package.json",
  ...[...WORKSPACE_APP_DIRS, ...WORKSPACE_PACKAGE_DIRS].map((dir) => `${dir}/package.json`),
] as const;

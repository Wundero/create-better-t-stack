// Single source of truth for the CLI package rendered by the website.
//
// The site ships previews as a scoped package (`@wundero/bts`), so `npm create`
// cannot be used: scoped `create` resolves to `@scope/create-name`. Every
// package-manager variant runs the published bin directly via npx/bunx/dlx.

export const CLI_PACKAGE_NAME = "@wundero/bts";

export const CLI_PACKAGE_SPEC = `${CLI_PACKAGE_NAME}@latest`;

export type PackageManager = "npm" | "pnpm" | "bun";

export function getInstallCommand(packageManager: PackageManager): string {
  switch (packageManager) {
    case "npm":
      return `npx ${CLI_PACKAGE_SPEC}`;
    case "pnpm":
      return `pnpm dlx ${CLI_PACKAGE_SPEC}`;
    case "bun":
      return `bunx ${CLI_PACKAGE_SPEC}`;
  }
}

/** Coerce an arbitrary stack value to a supported package manager (bun default). */
export function resolvePackageManager(value: string): PackageManager {
  return value === "npm" || value === "pnpm" ? value : "bun";
}

export function getStackCommandBase(packageManager: string): string {
  return getInstallCommand(resolvePackageManager(packageManager));
}

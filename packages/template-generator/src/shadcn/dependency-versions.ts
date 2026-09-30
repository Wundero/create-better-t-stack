import type { ShadcnBase } from "./types";

/** The registry CLI package is invoked by the generator, never pinned as a dependency. */
const REGISTRY_CLI_PACKAGE = "shadcn@latest";

/** Pinned versions keyed by dependency name; consumers look up arbitrary names. */
export interface ShadcnDependencyVersionMap {
  readonly [packageName: string]: string;
}

/**
 * Pinned dependency versions for packages the shadcn registry introduces. The
 * registry emits bare package names; the generator resolves them here so
 * generated projects stay reproducible.
 */
export const SHADCN_DEPENDENCY_VERSIONS: ShadcnDependencyVersionMap = {
  "@base-ui/react": "^1.8.0",
  "radix-ui": "^1.6.7",
  "react-aria-components": "^1.21.1",
  "@hugeicons/react": "^1.1.10",
  "@hugeicons/core-free-icons": "^4.3.5",
  "@tabler/icons-react": "^3.48.0",
  "@phosphor-icons/react": "^2.1.10",
  "@remixicon/react": "^4.9.0",
  "@fontsource-variable/outfit": "^5.3.0",
  "@fontsource-variable/raleway": "^5.3.0",
};

/** Maps a shadcn base to the primitive package its components import from. */
export const SHADCN_BASE_PACKAGE = {
  base: "@base-ui/react",
  radix: "radix-ui",
  aria: "react-aria-components",
} satisfies Record<ShadcnBase, string>;

/**
 * Resolves a pinned version for a registry dependency. Returns `undefined` for
 * the registry CLI package (which must never be pinned) and for any package the
 * generator does not manage.
 */
export function resolveShadcnDependencyVersion(packageName: string): string | undefined {
  if (packageName === REGISTRY_CLI_PACKAGE) return undefined;
  return SHADCN_DEPENDENCY_VERSIONS[packageName];
}

import { parsePresetStyle } from "@better-t-stack/types";

import { GeneratorError } from "../types";
import { SHADCN_BASE_PACKAGE, resolveShadcnDependencyVersion } from "./dependency-versions";
import { iconLibraryPackages } from "./icons";
import type { ResolvedShadcnTheme } from "./resolve";
import type { ShadcnBase } from "./types";

const FONTSOURCE_VARIABLE_PREFIX = "@fontsource-variable/";
const FONTSOURCE_FALLBACK_VERSION = "^5.3.0";
const REGISTRY_CLI_KEY = "shadcn@latest";
const BASEUI_PACKAGE = "@base-ui/react";

export interface UiPackageDependencies {
  readonly deps: Record<string, string>;
  readonly changed: boolean;
}

function registryBaseFromStyle(style: string): ShadcnBase | undefined {
  return parsePresetStyle(style).base;
}

function putPinned(deps: Record<string, string>, packageName: string): void {
  const version = resolveShadcnDependencyVersion(packageName);
  if (version !== undefined) deps[packageName] = version;
}

/**
 * Merges the registry-introduced npm dependencies into the existing map.
 * Existing pins win (the static template already pins `cn`,
 * `class-variance-authority`, `tw-animate-css`, ...), the registry CLI dist-tag
 * is never pinned, and names without a pinned version are returned so the
 * caller can fail loudly instead of emitting an unpinned dependency.
 */
function mergeRegistryDependencies(
  deps: Record<string, string>,
  names: readonly string[],
): string[] {
  const unresolved: string[] = [];
  for (const name of names) {
    if (name === REGISTRY_CLI_KEY) continue;
    if (Object.hasOwn(deps, name)) continue;
    const version = resolveShadcnDependencyVersion(name);
    if (version !== undefined) {
      deps[name] = version;
      continue;
    }
    if (!unresolved.includes(name)) unresolved.push(name);
  }
  return unresolved;
}

function sameDependencies(
  next: Record<string, string>,
  current: Readonly<Record<string, string>>,
): boolean {
  const nextKeys = Object.keys(next);
  const currentKeys = Object.keys(current);
  if (nextKeys.length !== currentKeys.length) return false;
  return nextKeys.every((key) => next[key] === current[key]);
}

/**
 * Composes the `packages/ui/package.json` dependency map for a resolved theme:
 * swaps the primitive package to match the registry base, adds the icon
 * library packages, pins every font dependency, and merges the registry base +
 * component npm dependencies. Existing pins survive verbatim; an unpinned
 * registry dependency fails loudly.
 */
export function composeUiPackageJsonDependencies(
  existingDependencies: Readonly<Record<string, string>>,
  resolved: ResolvedShadcnTheme,
): UiPackageDependencies {
  const deps = { ...existingDependencies } satisfies Record<string, string>;
  const registryBase = registryBaseFromStyle(resolved.base.config.style);

  if (registryBase === undefined) {
    putPinned(deps, BASEUI_PACKAGE);
  } else if (registryBase === "base") {
    putPinned(deps, SHADCN_BASE_PACKAGE.base);
  } else {
    delete deps[BASEUI_PACKAGE];
    putPinned(deps, SHADCN_BASE_PACKAGE[registryBase]);
  }

  for (const packageName of iconLibraryPackages(resolved.iconLibrary)) {
    putPinned(deps, packageName);
  }

  for (const font of resolved.fonts) {
    const packageName = font.dependency;
    if (packageName.length === 0) continue;
    if (resolveShadcnDependencyVersion(packageName) !== undefined) {
      putPinned(deps, packageName);
    } else if (packageName.startsWith(FONTSOURCE_VARIABLE_PREFIX)) {
      deps[packageName] = FONTSOURCE_FALLBACK_VERSION;
    }
  }

  const unresolved = mergeRegistryDependencies(deps, resolved.dependencies);
  if (unresolved.length > 0) {
    throw new GeneratorError({
      message: `shadcn registry requires dependencies without a pinned version: ${unresolved.join(
        ", ",
      )}. Add them to SHADCN_DEPENDENCY_VERSIONS or the ui package template.`,
      phase: "shadcn-dependencies",
    });
  }

  return { deps, changed: !sameDependencies(deps, existingDependencies) };
}

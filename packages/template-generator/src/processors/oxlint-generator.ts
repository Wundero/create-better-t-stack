/**
 * Oxlint config generator.
 *
 * Replaces the `oxlint --init` external command, which would clobber the
 * generated file. The baseline mirrors `oxlint --init` exactly; shadcn plugin
 * wiring is layered on top only for supported React-web frontends.
 */

import type { ProjectConfig } from "@better-t-stack/types";

import type { JsonObject } from "../core/json-types";
import type { VirtualFileSystem } from "../core/virtual-fs";
import {
  getShadcnLintOverrides,
  getShadcnLintRules,
  getShadcnLintSettings,
  SHADCN_LINT_JS_PLUGINS,
  supportsShadcnLint,
} from "./shadcn-lint-config";

/**
 * Exact output of `oxlint --init` (verified).
 */
export const OXLINT_INIT_BASELINE = {
  $schema: "./node_modules/oxlint/configuration_schema.json",
  plugins: ["typescript", "unicorn", "oxc"],
  categories: { correctness: "error" },
  env: { builtin: true },
  rules: {},
};

export function buildOxlintConfig(config: ProjectConfig): JsonObject {
  if (!supportsShadcnLint(config)) {
    return structuredClone(OXLINT_INIT_BASELINE);
  }

  return {
    $schema: OXLINT_INIT_BASELINE["$schema"],
    plugins: [...OXLINT_INIT_BASELINE.plugins],
    categories: { ...OXLINT_INIT_BASELINE.categories },
    env: { ...OXLINT_INIT_BASELINE.env },
    jsPlugins: [...SHADCN_LINT_JS_PLUGINS],
    settings: getShadcnLintSettings(config),
    rules: getShadcnLintRules(),
    overrides: getShadcnLintOverrides(),
  };
}

export function processOxlintConfig(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (!config.addons.includes("oxlint")) return;

  vfs.writeJson(".oxlintrc.json", buildOxlintConfig(config));
}

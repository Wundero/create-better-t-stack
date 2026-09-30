/**
 * @shadcn/lint configuration shared by the Oxlint and Vite+ generators.
 *
 * The plugin only makes sense for React-web frontends that ship the shared
 * `packages/ui` shadcn primitives, so every helper is gated by
 * {@link supportsShadcnLint}.
 */

import type { Frontend, ProjectConfig } from "@better-t-stack/types";

import type { JsonObject, JsonValue } from "../core/json-types";

export const SHADCN_LINT_SUPPORTED_FRONTENDS = [
  "tanstack-router",
  "react-router",
  "tanstack-start",
  "next",
] as const satisfies readonly Frontend[];

/**
 * Glob for the shared shadcn primitives package. Verified against oxlint
 * overrides in this monorepo layout; `**\/components/ui/**` does not match.
 */
export const SHADCN_LINT_COMPONENTS_GLOB = "packages/ui/**";

export const SHADCN_LINT_JS_PLUGINS = ["@shadcn/lint"];

export function supportsShadcnLint(config: ProjectConfig): boolean {
  return config.frontend.some((frontend) =>
    (SHADCN_LINT_SUPPORTED_FRONTENDS as readonly Frontend[]).includes(frontend),
  );
}

export function getShadcnLintSettings(config: ProjectConfig) {
  return {
    shadcn: {
      ui: `@${config.projectName}/ui/components`,
    },
  };
}

export function getShadcnLintRules(): JsonObject {
  return {
    "shadcn/no-arbitrary-values": ["error", { allow: ["layout"] }] satisfies JsonValue,
    "shadcn/no-inline-styles": "error",
    "shadcn/no-raw-colors": "error",
    "shadcn/no-restyle": ["error", { allow: ["layout"] }] satisfies JsonValue,
    "shadcn/no-unknown-classes": "error",
    "shadcn/require-static-classes": "error",
  };
}

export function getShadcnLintOverrides(): JsonValue[] {
  return [
    {
      files: [SHADCN_LINT_COMPONENTS_GLOB],
      rules: {
        "shadcn/no-arbitrary-values": "off",
        "shadcn/no-restyle": "off",
        "shadcn/no-unknown-classes": "off",
        "shadcn/require-static-classes": "off",
      },
    },
  ];
}

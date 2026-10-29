import type { ProjectConfig } from "@better-t-stack/types";

import type { JsonObject } from "../core/json-types";
import type { ComponentAliases } from "./apply";
import type { RegistryBase } from "./types";

/**
 * The workspace-local import aliases registry sources are rewritten onto. Every
 * generated project consumes the shared `packages/ui` workspace, so all aliases
 * point at `@<project>/ui`.
 */
export function shadcnAliases(projectName: string): ComponentAliases {
  const packageRoot = `@${projectName}/ui`;
  return {
    components: `${packageRoot}/components`,
    ui: `${packageRoot}/components`,
    utils: `${packageRoot}/lib/utils`,
    hooks: `${packageRoot}/hooks`,
    lib: `${packageRoot}/lib`,
  };
}

/**
 * Builds the `packages/ui/components.json` contents for a resolved registry
 * base. Key order is fixed so the same inputs always serialize identically.
 */
export function composeComponentsJson(
  base: RegistryBase,
  config: ProjectConfig,
  rsc: boolean,
): JsonObject {
  const aliases = shadcnAliases(config.projectName);
  const componentsJson: JsonObject = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: base.config.style,
    rsc,
    tsx: true,
    tailwind: {
      config: "",
      css: "src/styles/globals.css",
      baseColor: base.config.tailwind.baseColor,
      cssVariables: true,
      prefix: "",
    },
    iconLibrary: base.config.iconLibrary,
    aliases: {
      components: aliases.components,
      utils: aliases.utils,
      hooks: aliases.hooks,
      lib: aliases.lib,
      ui: aliases.ui,
    },
    menuColor: base.config.menuColor,
    menuAccent: base.config.menuAccent,
  };
  if (base.config.rtl) {
    componentsJson.rtl = true;
  }
  return componentsJson;
}

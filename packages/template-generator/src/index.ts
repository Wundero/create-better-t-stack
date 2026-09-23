export * from "./types";
export * from "./core/virtual-fs";
export * from "./core/template-processor";
export * from "./generator";
export { processPnpmWorkspaceConfig } from "./template-handlers/extras";
export { processAddonTemplates } from "./template-handlers/addons";
export {
  ALL_WORKSPACE_PACKAGE_JSON_PATHS,
  CATALOG_PACKAGE_PATHS,
  WORKSPACE_APP_DIRS,
  WORKSPACE_PACKAGE_DIRS,
} from "./generators/workspace-paths";
export { planWorkspacePackage } from "./generators/workspace-package";
export type {
  PlanWorkspacePackageInput,
  PlanWorkspacePackageResult,
} from "./generators/workspace-package";
export { planWorkspaceApp } from "./generators/workspace-app";
export type {
  PlanWorkspaceAppInput,
  PlanWorkspaceAppResult,
  WorkspaceAppKind,
} from "./generators/workspace-app";
export { processAddonsDeps } from "./processors/addons-deps";
export { processPwaPlugins } from "./processors/pwa-plugins";
export { processNxConfig } from "./processors/nx-generator";
export { processTurboConfig } from "./processors/turbo-generator";
export { processVitePlusConfig } from "./processors/vite-plus-generator";
export { processPackageConfigs, processVercelConfig } from "./post-process";
export { writeBtsConfigToVfs } from "./bts-config";

export { EMBEDDED_TEMPLATES, TEMPLATE_COUNT } from "./templates.generated";
export { dependencyVersionMap, type AvailableDependencies } from "./utils/add-deps";
export { generateReproducibleCommand } from "./utils/reproducible-command";

export { processNpmScriptApprovals } from "./post-process/package-configs";

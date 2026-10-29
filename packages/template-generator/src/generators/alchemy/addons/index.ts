export type { AddonRenderContext, AddonRenderer } from "./types";
export {
  ADDON_RENDERERS,
  activeAddons,
  addonAppDeps,
  addonBindings,
  addonEnv,
  addonInfraDeps,
  hasAddonRenderers,
  writeAddonImports,
  writeAddonResources,
  writeAddonStackResources,
} from "./registry";

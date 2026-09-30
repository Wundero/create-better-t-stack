import {
  isProviderAddon,
  PROVIDER_ADDONS,
  type Addons,
  type ProviderAddon,
} from "@better-t-stack/types";

import type { AlchemyDeploymentPlan } from "../plan";
import type { AlchemyWriter } from "../writer";
import type { AddonRenderer } from "./types";

export const ADDON_RENDERERS: Partial<Record<Addons, AddonRenderer>> = {};

export function activeAddons(plan: AlchemyDeploymentPlan): ProviderAddon[] {
  const selected = plan.config.addons.filter(isProviderAddon);
  return PROVIDER_ADDONS.filter((addon) => selected.includes(addon));
}

function registeredRenderers(plan: AlchemyDeploymentPlan): AddonRenderer[] {
  return activeAddons(plan).flatMap((addon) => {
    const renderer = ADDON_RENDERERS[addon];
    return renderer ? [renderer] : [];
  });
}

export function hasAddonRenderers(plan: AlchemyDeploymentPlan): boolean {
  return registeredRenderers(plan).length > 0;
}

export function writeAddonImports(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  for (const renderer of registeredRenderers(plan)) {
    for (const line of renderer.imports?.(plan) ?? []) writer.writeLine(line);
  }
}

export function writeAddonResources(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  for (const renderer of registeredRenderers(plan)) {
    renderer.resources?.(writer, plan);
  }
}

export function addonBindings(plan: AlchemyDeploymentPlan): string[] {
  return registeredRenderers(plan).flatMap((renderer) => renderer.bindings?.(plan) ?? []);
}

export function addonEnv(plan: AlchemyDeploymentPlan): string[] {
  return registeredRenderers(plan).flatMap((renderer) => renderer.env?.(plan) ?? []);
}

export function addonInfraDeps(plan: AlchemyDeploymentPlan): string[] {
  return registeredRenderers(plan).flatMap((renderer) => renderer.infraDeps?.(plan) ?? []);
}

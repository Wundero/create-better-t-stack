import type { AlchemyDeploymentPlan } from "../plan";
import type { AlchemyWriter } from "../writer";

export type AddonRenderContext = {
  plan: AlchemyDeploymentPlan;
  writer: AlchemyWriter;
};

export interface AddonRenderer {
  imports?: (plan: AlchemyDeploymentPlan) => string[];
  resources?: (writer: AlchemyWriter, plan: AlchemyDeploymentPlan) => void;
  bindings?: (plan: AlchemyDeploymentPlan) => string[];
  env?: (plan: AlchemyDeploymentPlan) => string[];
  infraDeps?: (plan: AlchemyDeploymentPlan) => string[];
  appDeps?: (plan: AlchemyDeploymentPlan) => string[];
  exampleTemplatePrefix?: string;
}

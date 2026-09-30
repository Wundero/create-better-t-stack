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
  /** Runs inside the server host Effect.gen before the host exists (AWS and Neon resources resolve via `yield*`). */
  serverPrelude?: (writer: AlchemyWriter, plan: AlchemyDeploymentPlan) => void;
  /** Runs after the AWS host exists and may call `serverHost.bind(...)` for env/IAM (Lambda + ECS share this contract). */
  hostBindings?: (writer: AlchemyWriter, plan: AlchemyDeploymentPlan) => void;
  exampleTemplatePrefix?: string;
}

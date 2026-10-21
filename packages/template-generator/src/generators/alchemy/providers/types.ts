import type { AlchemyDeploymentPlan } from "../plan";
import type { AlchemyWriter } from "../writer";

export type AlchemyProviderName = "hetzner" | "fly" | "railway" | "neon";

export interface ProviderEmitter {
  web?: (writer: AlchemyWriter, plan: AlchemyDeploymentPlan) => void;
  server?: (writer: AlchemyWriter, plan: AlchemyDeploymentPlan) => void;
  database?: (writer: AlchemyWriter, plan: AlchemyDeploymentPlan) => void;
}

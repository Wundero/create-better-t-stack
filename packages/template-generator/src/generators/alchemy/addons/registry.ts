import {
  isProviderAddon,
  isProviderAddonAvailable,
  PROVIDER_ADDONS,
  type Addons,
  type ProviderAddon,
} from "@better-t-stack/types";

import type { AlchemyDeploymentPlan } from "../plan";
import type { AlchemyWriter } from "../writer";
import { awsBedrockRenderer } from "./aws/bedrock";
import { awsCloudfrontRenderer } from "./aws/cloudfront";
import { awsElastiCacheRenderer } from "./aws/elasticache";
import { awsEventBridgeRenderer } from "./aws/eventbridge";
import { awsKinesisRenderer } from "./aws/kinesis";
import { awsLambdaMicrovmRenderer } from "./aws/lambda-microvm";
import { awsS3Renderer } from "./aws/s3";
import { awsSchedulerRenderer } from "./aws/scheduler";
import { awsSnsRenderer } from "./aws/sns";
import { awsSqsRenderer } from "./aws/sqs";
import { cloudflareAiSearchRenderer } from "./cloudflare/ai-search";
import { cloudflareContainersRenderer } from "./cloudflare/containers";
import { cloudflareDurableObjectsRenderer } from "./cloudflare/durable-objects";
import { cloudflareFlagshipRenderer } from "./cloudflare/flagship";
import { cloudflareKvRenderer } from "./cloudflare/kv";
import { cloudflarePipelinesRenderer } from "./cloudflare/pipelines";
import { cloudflareQueuesRenderer } from "./cloudflare/queues";
import { cloudflareR2Renderer } from "./cloudflare/r2";
import { cloudflareRealtimeKitRenderer } from "./cloudflare/realtime-kit";
import { cloudflareSandboxesRenderer } from "./cloudflare/sandboxes";
import { cloudflareStreamRenderer } from "./cloudflare/stream";
import { cloudflareWorkersAiRenderer } from "./cloudflare/workers-ai";
import { neonAiGatewayRenderer } from "./neon/ai-gateway";
import { neonBucketsRenderer } from "./neon/buckets";
import type { AddonRenderer } from "./types";

export const ADDON_RENDERERS = {
  "aws-s3": awsS3Renderer,
  "aws-sqs": awsSqsRenderer,
  "aws-sns": awsSnsRenderer,
  "aws-kinesis": awsKinesisRenderer,
  "aws-eventbridge": awsEventBridgeRenderer,
  "aws-scheduler": awsSchedulerRenderer,
  "aws-cloudfront": awsCloudfrontRenderer,
  "aws-elasticache": awsElastiCacheRenderer,
  "aws-bedrock": awsBedrockRenderer,
  "aws-lambda-microvm": awsLambdaMicrovmRenderer,
  "cloudflare-durable-objects": cloudflareDurableObjectsRenderer,
  "cloudflare-containers": cloudflareContainersRenderer,
  "cloudflare-sandboxes": cloudflareSandboxesRenderer,
  "cloudflare-r2": cloudflareR2Renderer,
  "cloudflare-kv": cloudflareKvRenderer,
  "cloudflare-queues": cloudflareQueuesRenderer,
  "cloudflare-workers-ai": cloudflareWorkersAiRenderer,
  "cloudflare-ai-search": cloudflareAiSearchRenderer,
  "cloudflare-flagship": cloudflareFlagshipRenderer,
  "cloudflare-pipelines": cloudflarePipelinesRenderer,
  "cloudflare-stream": cloudflareStreamRenderer,
  "cloudflare-realtime-kit": cloudflareRealtimeKitRenderer,
  "neon-ai-gateway": neonAiGatewayRenderer,
  "neon-buckets": neonBucketsRenderer,
} satisfies Partial<Record<Addons, AddonRenderer>>;

type RegisteredAddon = keyof typeof ADDON_RENDERERS;

function isRegisteredAddon(addon: Addons): addon is RegisteredAddon {
  return Object.hasOwn(ADDON_RENDERERS, addon);
}

export function activeAddons(plan: AlchemyDeploymentPlan): ProviderAddon[] {
  const selected = plan.config.addons.filter(isProviderAddon);
  return PROVIDER_ADDONS.filter((addon) => selected.includes(addon));
}

function registeredRenderers(plan: AlchemyDeploymentPlan): AddonRenderer[] {
  return activeAddons(plan).flatMap((addon) => {
    if (!isProviderAddonAvailable(addon, plan.config) || !isRegisteredAddon(addon)) return [];
    return [ADDON_RENDERERS[addon]];
  });
}

export function hasAddonRenderers(plan: AlchemyDeploymentPlan): boolean {
  return registeredRenderers(plan).length > 0;
}

export function writeAddonImports(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  const written = new Set(writer.toString().split("\n"));
  for (const renderer of registeredRenderers(plan)) {
    for (const line of renderer.imports?.(plan) ?? []) {
      if (written.has(line)) continue;
      written.add(line);
      writer.writeLine(line);
    }
  }
}

export function writeAddonResources(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): boolean {
  let wroteResources = false;
  for (const renderer of registeredRenderers(plan)) {
    if (!renderer.resources) continue;
    if (wroteResources) writer.blankLine();
    renderer.resources(writer, plan);
    wroteResources = true;
  }
  return wroteResources;
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

export function addonAppDeps(plan: AlchemyDeploymentPlan): string[] {
  return registeredRenderers(plan).flatMap((renderer) => renderer.appDeps?.(plan) ?? []);
}

export function addonUsesServerHost(plan: AlchemyDeploymentPlan): boolean {
  return registeredRenderers(plan).some(
    (renderer) => renderer.serverPrelude !== undefined || renderer.hostBindings !== undefined,
  );
}

export function writeAddonServerPrelude(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  for (const renderer of registeredRenderers(plan)) renderer.serverPrelude?.(writer, plan);
}

export function writeAddonHostBindings(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  for (const renderer of registeredRenderers(plan)) renderer.hostBindings?.(writer, plan);
}

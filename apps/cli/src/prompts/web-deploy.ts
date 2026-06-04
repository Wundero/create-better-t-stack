import { DEFAULT_CONFIG } from "../constants";
import type { Backend, DatabaseSetup, Frontend, Runtime, WebDeploy } from "../types";
import { WEB_FRAMEWORKS } from "../utils/compatibility";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect, navigableText } from "./navigable";

function hasWebFrontend(frontends: Frontend[]) {
  return frontends.some((f) => WEB_FRAMEWORKS.includes(f));
}

type DeploymentOption = {
  value: WebDeploy;
  label: string;
  hint: string;
};

function getDeploymentDisplay(deployment: WebDeploy): {
  label: string;
  hint: string;
} {
  if (deployment === "cloudflare") {
    return {
      label: "Cloudflare",
      hint: "Deploy to Cloudflare Workers using Alchemy",
    };
  }
  return {
    label: deployment,
    hint: `Add ${deployment} deployment`,
  };
}

export async function getDeploymentChoice(
  deployment?: WebDeploy,
  _runtime?: Runtime,
  backend?: Backend,
  frontend: Frontend[] = [],
  dbSetup?: DatabaseSetup,
) {
  if (deployment !== undefined) return deployment;
  if (!hasWebFrontend(frontend)) {
    return "none";
  }

  if (backend === "self" && dbSetup === "d1") {
    return "cloudflare";
  }

  const availableDeployments = ["cloudflare", "none"];

  const options: DeploymentOption[] = availableDeployments.map((deploy) => {
    const { label, hint } = getDeploymentDisplay(deploy as WebDeploy);
    return {
      value: deploy as WebDeploy,
      label,
      hint,
    };
  });

  const response = await navigableSelect<WebDeploy>({
    message: "Select web deployment",
    options,
    initialValue: DEFAULT_CONFIG.webDeploy,
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

export async function getWebDomainChoice(
  webDeploy: WebDeploy,
  webDomain?: string,
): Promise<string | undefined> {
  if (webDomain !== undefined) return webDomain || undefined;
  if (webDeploy !== "cloudflare") return undefined;

  const response = await navigableText({
    message: "Web domain (optional)",
    placeholder: "app.example.com",
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response.trim() || undefined;
}

export async function getDeploymentToAdd(frontend: Frontend[], existingDeployment?: WebDeploy) {
  if (!hasWebFrontend(frontend)) {
    return "none";
  }

  const options: DeploymentOption[] = [];

  if (existingDeployment !== "cloudflare") {
    const { label, hint } = getDeploymentDisplay("cloudflare");
    options.push({
      value: "cloudflare",
      label,
      hint,
    });
  }

  if (existingDeployment && existingDeployment !== "none") {
    return "none";
  }

  if (options.length > 0) {
    options.push({
      value: "none",
      label: "None",
      hint: "Skip deployment setup",
    });
  }

  if (options.length === 0) {
    return "none";
  }

  const response = await navigableSelect<WebDeploy>({
    message: "Select web deployment",
    options,
    initialValue: DEFAULT_CONFIG.webDeploy,
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

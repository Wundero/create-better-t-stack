import type { ProjectConfig } from "@better-t-stack/types";
import { isPaymentProvider } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { type TemplateData, processTemplatesFromPrefix } from "./utils";

const REACT_WEB_FRONTENDS = ["tanstack-router", "react-router", "tanstack-start", "next"] as const;
const COMMET_FULLSTACK_FRAMEWORKS = [
  "next",
  "tanstack-start",
  "nuxt",
  "svelte",
  "solid",
  "astro",
] as const;

type WebLanguage = "react" | "nuxt" | "svelte" | "solid" | "astro";

function resolveWebLanguage(config: ProjectConfig): {
  language: WebLanguage;
  framework: string;
} | null {
  const reactFramework = config.frontend.find((frontend) =>
    (REACT_WEB_FRONTENDS as readonly string[]).includes(frontend),
  );
  if (reactFramework) return { language: "react", framework: reactFramework };
  if (config.frontend.includes("nuxt")) return { language: "nuxt", framework: "nuxt" };
  if (config.frontend.includes("svelte")) return { language: "svelte", framework: "svelte" };
  if (config.frontend.includes("solid")) return { language: "solid", framework: "solid" };
  if (config.frontend.includes("astro")) return { language: "astro", framework: "astro" };
  return null;
}

function processWebTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
  basePrefix: string,
): void {
  const web = resolveWebLanguage(config);
  if (!web) return;
  const segments =
    web.language === "react"
      ? ["web/react/base", `web/react/${web.framework}`]
      : [`web/${web.language}`];
  for (const segment of segments) {
    processTemplatesFromPrefix(vfs, templates, `${basePrefix}/${segment}`, "apps/web", config);
  }
}

function processCommetFullstackRoutes(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): void {
  const web = resolveWebLanguage(config);
  if (!web) return;
  if (!(COMMET_FULLSTACK_FRAMEWORKS as readonly string[]).includes(web.framework)) return;
  processTemplatesFromPrefix(
    vfs,
    templates,
    `payments/commet/fullstack/${web.framework}`,
    "apps/web",
    config,
  );
}

export async function processPaymentsTemplates(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): Promise<void> {
  if (!config.payments || config.payments === "none") return;

  const provider = isPaymentProvider(config.payments) ? config.payments : undefined;

  if (config.backend === "convex") {
    processTemplatesFromPrefix(
      vfs,
      templates,
      `payments/${config.payments}/convex/backend`,
      "packages/backend",
      config,
    );
    return;
  }

  processWebTemplates(vfs, templates, config, "payments/common");

  if (provider && provider !== "polar") {
    processWebTemplates(vfs, templates, config, "payments/generic");
  }

  if (config.backend !== "none") {
    processTemplatesFromPrefix(
      vfs,
      templates,
      `payments/${config.payments}/server/base`,
      "packages/auth",
      config,
    );
  }

  if (config.backend === "self" && provider === "commet") {
    processCommetFullstackRoutes(vfs, templates, config);
  }

  processWebTemplates(vfs, templates, config, `payments/${config.payments}`);
}

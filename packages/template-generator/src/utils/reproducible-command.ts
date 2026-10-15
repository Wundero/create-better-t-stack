import type { ProjectConfig } from "@better-t-stack/types";

import { hasI18n } from "./i18n";

function normalizeMultiValues(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const filtered = values.filter((value) => value !== "none");
  return Array.from(new Set(filtered));
}

function formatMultiFlag(flag: string, values: string[]): string {
  if (values.length === 0) {
    return `${flag} none`;
  }
  return `${flag} ${values.join(" ")}`;
}

function getBaseCommand(packageManager: ProjectConfig["packageManager"]): string {
  if (packageManager === "bun") {
    return "bun create better-t-stack@latest";
  }

  if (packageManager === "pnpm") {
    return "pnpm create better-t-stack@latest";
  }

  return "npx create-better-t-stack@latest";
}

export function generateReproducibleCommand(config: ProjectConfig): string {
  const baseCommand = getBaseCommand(config.packageManager);

  const flags: string[] = [];
  const frontend = normalizeMultiValues(config.frontend);
  const addons = normalizeMultiValues(config.addons);
  const examples = normalizeMultiValues(config.examples);

  flags.push(formatMultiFlag("--frontend", frontend));

  flags.push(`--backend ${config.backend}`);
  flags.push(`--runtime ${config.runtime}`);
  flags.push(`--database ${config.database}`);
  flags.push(`--orm ${config.orm}`);
  flags.push(`--api ${config.api}`);
  flags.push(`--auth ${config.auth}`);
  flags.push(`--payments ${config.payments}`);

  if (hasI18n(config)) {
    flags.push(`--i18n ${config.i18n}`);
    const i18nOptions = config.i18nOptions;
    if (i18nOptions) {
      flags.push(`--i18n-locales ${i18nOptions.locales.join(",")}`);
      if (i18nOptions.sourceLocale !== i18nOptions.locales[0]) {
        flags.push(`--i18n-source-locale ${i18nOptions.sourceLocale}`);
      }
      const routing = i18nOptions.routing;
      if (routing && routing.strategy !== "cookie") {
        flags.push(`--i18n-routing ${routing.strategy}`);
      }
      for (const [locale, host] of Object.entries(routing?.domains ?? {})) {
        flags.push(`--i18n-domain ${locale}=${host}`);
      }
      if (!i18nOptions.translateSkill) {
        flags.push("--no-i18n-skill");
      }
    }
  }

  flags.push(formatMultiFlag("--addons", addons));
  flags.push(formatMultiFlag("--examples", examples));

  const shadcn = config.shadcn;
  if (shadcn) {
    const base = shadcn.base ?? "baseui";
    if (shadcn.preset) {
      flags.push(`--shadcn-preset ${shadcn.preset}`);
    }
    if (base !== "baseui") {
      flags.push(`--shadcn-base ${base}`);
    }
    if (shadcn.rtl === true) {
      flags.push("--shadcn-rtl");
    }
    if (shadcn.pointer === true) {
      flags.push("--shadcn-pointer");
    }
  }

  flags.push(`--db-setup ${config.dbSetup}`);
  if (config.dbSetupOptions?.mode === "manual") {
    flags.push("--manual-db");
  } else if (config.dbSetupOptions?.mode === "auto") {
    flags.push(`--db-setup-options '${JSON.stringify({ mode: "auto" })}'`);
  }
  flags.push(`--web-deploy ${config.webDeploy}`);
  flags.push(`--server-deploy ${config.serverDeploy}`);
  flags.push(config.git ? "--git" : "--no-git");
  flags.push(`--package-manager ${config.packageManager}`);
  flags.push(config.install ? "--install" : "--no-install");

  const projectPathArg = config.relativePath ? ` ${config.relativePath}` : "";

  return `${baseCommand}${projectPathArg} ${flags.join(" ")}`;
}

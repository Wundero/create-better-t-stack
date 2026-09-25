import type { ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { addPackageDependency } from "../utils/add-deps";

const WEB_APP_DIR = "apps/web";
const SERVER_APP_DIR = "apps/server";
const DEV_ENV_FILE = ".env.development";

const WEB_FRONTENDS = [
  "tanstack-router",
  "react-router",
  "tanstack-start",
  "next",
  "nuxt",
  "solid",
  "svelte",
  "astro",
];

type PortlessContext = {
  webName: string;
  serverName: string;
  hasWebApp: boolean;
  hasServerApp: boolean;
};

type PortlessNames = {
  web: string;
  server: string;
};

function sanitizeProjectName(projectName: string): string {
  const sanitized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "app";
}

export function getPortlessNames(projectName: string): PortlessNames {
  const slug = sanitizeProjectName(projectName);
  return { web: slug, server: `api.${slug}` };
}

function hasWebFrontend(frontend: ProjectConfig["frontend"]): boolean {
  return frontend.some((value) => WEB_FRONTENDS.some((candidate) => candidate === value));
}

function getClientServerEnvVar(frontend: ProjectConfig["frontend"]): string {
  if (frontend.includes("next")) return "NEXT_PUBLIC_SERVER_URL";
  if (frontend.includes("nuxt")) return "NUXT_PUBLIC_SERVER_URL";
  if (frontend.includes("svelte") || frontend.includes("astro")) return "PUBLIC_SERVER_URL";
  return "VITE_SERVER_URL";
}

function writeEnvFile(
  vfs: VirtualFileSystem,
  envPath: string,
  entries: readonly [string, string][],
): void {
  const content = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  vfs.writeFile(envPath, `${content}\n`);
}

function wrapDevScript(vfs: VirtualFileSystem, packagePath: string, name: string): void {
  const pkgJson = vfs.readJson<{ scripts?: Record<string, string> }>(packagePath);
  const devScript = pkgJson?.scripts?.dev;
  if (!pkgJson?.scripts || !devScript || devScript.startsWith("portless ")) return;

  pkgJson.scripts.dev = `portless ${name} ${devScript}`;
  vfs.writeJson(packagePath, pkgJson);
}

function writeWebDevEnv(
  vfs: VirtualFileSystem,
  config: ProjectConfig,
  context: PortlessContext,
): void {
  if (!context.hasWebApp || !hasWebFrontend(config.frontend)) return;

  const webOrigin = `https://${context.webName}.localhost`;
  const entries: [string, string][] = [];

  if (config.backend === "self") {
    // Mirror the base .env declarations (env-vars.ts): CORS_ORIGIN only exists
    // for self+clerk, BETTER_AUTH_URL only for better-auth. Writing an override
    // for an undeclared var would trip the generated varlock schema.
    if (config.auth === "clerk") entries.push(["CORS_ORIGIN", webOrigin]);
    if (config.auth === "better-auth") entries.push(["BETTER_AUTH_URL", webOrigin]);
  } else if (config.backend !== "none") {
    entries.push([
      getClientServerEnvVar(config.frontend),
      `https://api.${context.webName}.localhost`,
    ]);
  }

  if (entries.length > 0) {
    writeEnvFile(vfs, `${WEB_APP_DIR}/${DEV_ENV_FILE}`, entries);
  }
}

function writeServerDevEnv(
  vfs: VirtualFileSystem,
  config: ProjectConfig,
  context: PortlessContext,
): void {
  if (!context.hasServerApp) return;

  const entries: [string, string][] = [["CORS_ORIGIN", `https://${context.webName}.localhost`]];

  if (config.auth === "better-auth") {
    entries.push(["BETTER_AUTH_URL", `https://api.${context.webName}.localhost`]);
  }

  if (config.payments === "polar") {
    entries.push([
      "POLAR_SUCCESS_URL",
      `https://${context.webName}.localhost/success?checkout_id={CHECKOUT_ID}`,
    ]);
  }

  writeEnvFile(vfs, `${SERVER_APP_DIR}/${DEV_ENV_FILE}`, entries);
}

function appendGitignoreEntry(vfs: VirtualFileSystem, entry: string): void {
  const content = vfs.readFile(".gitignore");
  if (content === undefined) return;
  if (content.split("\n").some((line) => line.trim() === entry)) return;

  const base = content.endsWith("\n") ? content : `${content}\n`;
  vfs.writeFile(".gitignore", `${base}${entry}\n`);
}

export function processPortlessMode(vfs: VirtualFileSystem, config: ProjectConfig): void {
  if (config.portless !== true) return;

  const { web: webName, server: serverName } = getPortlessNames(config.projectName);
  const context: PortlessContext = {
    webName,
    serverName,
    hasWebApp: vfs.directoryExists(WEB_APP_DIR),
    hasServerApp: config.backend !== "self" && vfs.directoryExists(SERVER_APP_DIR),
  };

  const apps: Record<string, { name: string }> = {};
  if (context.hasWebApp) apps[WEB_APP_DIR] = { name: webName };
  if (context.hasServerApp) apps[SERVER_APP_DIR] = { name: serverName };

  if (Object.keys(apps).length === 0) return;

  vfs.writeJson("portless.json", { apps });

  if (context.hasWebApp) wrapDevScript(vfs, `${WEB_APP_DIR}/package.json`, webName);
  if (context.hasServerApp) wrapDevScript(vfs, `${SERVER_APP_DIR}/package.json`, serverName);

  addPackageDependency({
    vfs,
    packagePath: "package.json",
    devDependencies: ["portless"],
  });

  writeWebDevEnv(vfs, config, context);
  writeServerDevEnv(vfs, config, context);

  appendGitignoreEntry(vfs, DEV_ENV_FILE);
}

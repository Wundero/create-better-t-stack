import path from "node:path";

import { Result } from "better-result";

import type {
  API,
  Auth,
  AuthFeature,
  Backend,
  CLIInput,
  Database,
  DatabaseSetup,
  Email,
  EmailProvider,
  I18n,
  Runtime,
  ServerDeploy,
  WebDeploy,
} from "../types";
import { ValidationError } from "./errors";

export function processArrayOption<T>(options: (T | "none")[] | undefined) {
  if (!options || options.length === 0) return [];
  if (options.includes("none" as T | "none")) return [];
  return options.filter((item): item is T => item !== "none");
}

export function deriveProjectName(projectName?: string, projectDirectory?: string) {
  if (projectName) {
    return projectName;
  }
  if (projectDirectory) {
    return path.basename(path.resolve(process.cwd(), projectDirectory));
  }
  return "";
}

export function derivePackageScope(projectName: string) {
  return `@${projectName}`;
}

export function processFlags(options: CLIInput, projectName?: string) {
  const config: Partial<ProjectConfig> = {};

  if (options.api) {
    config.api = options.api as API;
  }

  if (options.addonOptions) {
    config.addonOptions = options.addonOptions;
  }

  if (options.dbSetupOptions) {
    config.dbSetupOptions = options.dbSetupOptions;
  }

  if (options.backend) {
    config.backend = options.backend as Backend;
  }

  if (options.database) {
    config.database = options.database as Database;
  }

  if (options.orm) {
    config.orm = options.orm as ORM;
  }

  if (options.auth !== undefined) {
    config.auth = options.auth as Auth;
  }

  if (options.authFeatures !== undefined) {
    config.authFeatures = options.authFeatures as AuthFeature[];
  }

  if (options.payments !== undefined) {
    config.payments = options.payments as Payments;
  }

  if (options.email) {
    config.email = options.email as Email;
  }

  if (options.emailProvider) {
    config.emailProvider = options.emailProvider as EmailProvider;
  }

  if (options.i18n) {
    config.i18n = options.i18n as I18n;
  }

  if (options.shadcnTheme) {
    config.shadcnTheme = options.shadcnTheme;
  }

  if (options.git !== undefined) {
    config.git = options.git;
  }

  if (options.install !== undefined) {
    config.install = options.install;
  }

  if (options.runtime) {
    config.runtime = options.runtime as Runtime;
  }

  if (options.dbSetup) {
    config.dbSetup = options.dbSetup as DatabaseSetup;
  }

  if (options.packageManager) {
    config.packageManager = options.packageManager as PackageManager;
  }

  if (options.packageScope) {
    config.packageScope = options.packageScope as PackageScope;
  }

  if (options.webDeploy) {
    config.webDeploy = options.webDeploy as WebDeploy;
  }

  if (options.serverDeploy) {
    config.serverDeploy = options.serverDeploy as ServerDeploy;
  }

  if (options.webDomain) {
    config.webDomain = options.webDomain;
  }

  if (options.serverDomain) {
    config.serverDomain = options.serverDomain;
  }

  if (options.emailDomain) {
    config.emailDomain = options.emailDomain;
  }

  if (options.cloudflare) {
    config.cloudflare = options.cloudflare;
  }

  const derivedName = deriveProjectName(projectName, options.projectDirectory);
  if (derivedName) {
    config.projectName = projectName || derivedName;
  }

  if (options.frontend && options.frontend.length > 0) {
    config.frontend = processArrayOption(options.frontend);
  }

  if (options.addons && options.addons.length > 0) {
    config.addons = processArrayOption(options.addons);
  }

  if (options.examples && options.examples.length > 0) {
    config.examples = processArrayOption(options.examples);
  }

  return config;
}

export function getProvidedFlags(options: CLIInput) {
  return new Set(
    Object.keys(options).filter((key) => options[key as keyof CLIInput] !== undefined),
  );
}

function validateNoneExclusivity<T>(
  options: (T | "none")[] | undefined,
  optionName: string,
): Result<void, ValidationError> {
  if (!options || options.length === 0) return Result.ok(undefined);

  if (options.includes("none" as T | "none") && options.length > 1) {
    return Result.err(
      new ValidationError({
        message: `Cannot combine 'none' with other ${optionName}.`,
      }),
    );
  }
  return Result.ok(undefined);
}

export function validateArrayOptions(options: CLIInput): Result<void, ValidationError> {
  const frontendResult = validateNoneExclusivity(options.frontend, "frontend options");
  if (frontendResult.isErr()) return frontendResult;

  const addonsResult = validateNoneExclusivity(options.addons, "addons");
  if (addonsResult.isErr()) return addonsResult;

  const examplesResult = validateNoneExclusivity(options.examples, "examples");
  if (examplesResult.isErr()) return examplesResult;

  return Result.ok(undefined);
}

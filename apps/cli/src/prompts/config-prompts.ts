import { DEFAULT_CONFIG } from "../constants";
import type {
  Addons,
  API,
  Auth,
  AuthFeature,
  Backend,
  CloudflareConfig,
  Database,
  DatabaseSetup,
  Email,
  EmailProvider,
  I18n,
  Examples,
  Frontend,
  ORM,
  PackageManager,
  Payments,
  ProjectConfig,
  Runtime,
  ServerDeploy,
  WebDeploy,
} from "../types";
import { isSilent } from "../utils/context";
import { UserCancelledError } from "../utils/errors";
import { getAddonsChoice } from "./addons";
import { getApiChoice } from "./api";
import { getAuthChoice, getAuthFeaturesChoice } from "./auth";
import { getBackendFrameworkChoice } from "./backend";
import { getCloudflareConfigChoice } from "./cloudflare";
import { getDatabaseChoice } from "./database";
import { getDBSetupChoice } from "./database-setup";
import { getEmailChoice, getEmailDomainChoice, getEmailProviderChoice } from "./email";
import { getExamplesChoice } from "./examples";
import { getFrontendChoice } from "./frontend";
import { getGitChoice } from "./git";
import { getI18nChoice } from "./i18n";
import { getinstallChoice } from "./install";
import { navigableGroup } from "./navigable-group";
import { getORMChoice } from "./orm";
import { getPackageManagerChoice } from "./package-manager";
import { getPaymentsChoice } from "./payments";
import { getRuntimeChoice } from "./runtime";
import { getServerDeploymentChoice, getServerDomainChoice } from "./server-deploy";
import { getDeploymentChoice, getWebDomainChoice } from "./web-deploy";

type PromptGroupResults = {
  frontend: Frontend[];
  backend: Backend;
  runtime: Runtime;
  database: Database;
  orm: ORM;
  api: API;
  auth: Auth;
  authFeatures: AuthFeature[];
  payments: Payments;
  email: Email;
  emailProvider: EmailProvider;
  i18n: I18n;
  addons: Addons[];
  examples: Examples[];
  dbSetup: DatabaseSetup;
  git: boolean;
  packageManager: PackageManager;
  install: boolean;
  webDeploy: WebDeploy;
  serverDeploy: ServerDeploy;
  webDomain?: string;
  serverDomain?: string;
  emailDomain?: string;
  cloudflare?: CloudflareConfig;
};

export async function gatherConfig(
  flags: Partial<ProjectConfig>,
  projectName: string,
  projectDir: string,
  relativePath: string,
) {
  if (isSilent()) {
    return {
      projectName,
      projectDir,
      relativePath,
      packageScope: flags.packageScope ?? `@${projectName}`,
      addonOptions: flags.addonOptions,
      dbSetupOptions: flags.dbSetupOptions,
      frontend: flags.frontend ?? [...DEFAULT_CONFIG.frontend],
      backend: flags.backend ?? DEFAULT_CONFIG.backend,
      runtime: flags.runtime ?? DEFAULT_CONFIG.runtime,
      database: flags.database ?? DEFAULT_CONFIG.database,
      orm: flags.orm ?? DEFAULT_CONFIG.orm,
      auth: flags.auth ?? DEFAULT_CONFIG.auth,
      authFeatures: flags.authFeatures ?? DEFAULT_CONFIG.authFeatures,
      payments: flags.payments ?? DEFAULT_CONFIG.payments,
      email: flags.email ?? DEFAULT_CONFIG.email,
      emailProvider: flags.emailProvider ?? DEFAULT_CONFIG.emailProvider,
      i18n: flags.i18n ?? DEFAULT_CONFIG.i18n,
      addons: flags.addons ?? [...DEFAULT_CONFIG.addons],
      examples: flags.examples ?? [...DEFAULT_CONFIG.examples],
      git: flags.git ?? DEFAULT_CONFIG.git,
      packageManager: flags.packageManager ?? DEFAULT_CONFIG.packageManager,
      install: flags.install ?? DEFAULT_CONFIG.install,
      dbSetup: flags.dbSetup ?? DEFAULT_CONFIG.dbSetup,
      api: flags.api ?? DEFAULT_CONFIG.api,
      webDeploy: flags.webDeploy ?? DEFAULT_CONFIG.webDeploy,
      serverDeploy: flags.serverDeploy ?? DEFAULT_CONFIG.serverDeploy,
      webDomain: flags.webDomain ?? DEFAULT_CONFIG.webDomain,
      serverDomain: flags.serverDomain ?? DEFAULT_CONFIG.serverDomain,
      emailDomain: flags.emailDomain ?? DEFAULT_CONFIG.emailDomain,
      cloudflare: flags.cloudflare,
      shadcnTheme: flags.shadcnTheme,
    };
  }

  const result = await navigableGroup<PromptGroupResults>(
    {
      frontend: () => getFrontendChoice(flags.frontend, flags.backend, flags.auth),
      backend: ({ results }) => getBackendFrameworkChoice(flags.backend, results.frontend),
      runtime: ({ results }) => getRuntimeChoice(flags.runtime, results.backend),
      database: ({ results }) =>
        getDatabaseChoice(flags.database, results.backend, results.runtime),
      orm: ({ results }) =>
        getORMChoice(
          flags.orm,
          results.database !== "none",
          results.database,
          results.backend,
          results.runtime,
        ),
      api: ({ results }) =>
        getApiChoice(flags.api, results.frontend, results.backend) as Promise<API>,
      auth: ({ results }) => getAuthChoice(flags.auth, results.backend, results.frontend),
      authFeatures: ({ results }) => getAuthFeaturesChoice(flags.authFeatures, results.auth),
      payments: ({ results }) =>
        getPaymentsChoice(flags.payments, results.auth, results.backend, results.frontend),
      email: ({ results }) => getEmailChoice(flags.email, results.auth),
      emailProvider: ({ results }) =>
        getEmailProviderChoice(results.email, flags.emailProvider, results.serverDeploy),
      emailDomain: ({ results }) =>
        getEmailDomainChoice(results.email ?? DEFAULT_CONFIG.email, flags.emailDomain),
      i18n: ({ results }) => getI18nChoice(flags.i18n, results.frontend),
      addons: ({ results }) =>
        getAddonsChoice(
          flags.addons,
          results.frontend,
          results.auth,
          results.backend,
          results.runtime,
        ),
      examples: ({ results }) =>
        getExamplesChoice(
          flags.examples,
          results.database,
          results.frontend,
          results.backend,
          results.api,
        ) as Promise<Examples[]>,
      dbSetup: ({ results }) =>
        getDBSetupChoice(
          results.database ?? "none",
          flags.dbSetup,
          results.orm,
          results.backend,
          results.runtime,
        ),
      webDeploy: ({ results }) =>
        getDeploymentChoice(
          flags.webDeploy,
          results.runtime,
          results.backend,
          results.frontend,
          results.dbSetup,
        ),
      webDomain: ({ results }) =>
        getWebDomainChoice(results.webDeploy ?? DEFAULT_CONFIG.webDeploy, flags.webDomain),
      serverDeploy: ({ results }) =>
        getServerDeploymentChoice(
          flags.serverDeploy,
          results.runtime,
          results.backend,
          results.webDeploy,
        ),
      serverDomain: ({ results }) =>
        getServerDomainChoice(
          results.serverDeploy ?? DEFAULT_CONFIG.serverDeploy,
          flags.serverDomain,
        ),
      cloudflare: ({ results }) =>
        getCloudflareConfigChoice(flags.cloudflare, {
          webDeploy: results.webDeploy ?? DEFAULT_CONFIG.webDeploy,
          serverDeploy: results.serverDeploy ?? DEFAULT_CONFIG.serverDeploy,
          runtime: results.runtime ?? DEFAULT_CONFIG.runtime,
          database: results.database ?? DEFAULT_CONFIG.database,
          dbSetup: results.dbSetup ?? DEFAULT_CONFIG.dbSetup,
        }),
      git: () => getGitChoice(flags.git),
      packageManager: () => getPackageManagerChoice(flags.packageManager),
      install: () => getinstallChoice(flags.install),
    },
    {
      onCancel: () => {
        throw new UserCancelledError({ message: "Operation cancelled" });
      },
    },
  );

  return {
    projectName: projectName,
    projectDir: projectDir,
    relativePath: relativePath,
    packageScope: flags.packageScope ?? `@${projectName}`,
    addonOptions: flags.addonOptions,
    dbSetupOptions: flags.dbSetupOptions,
    frontend: result.frontend,
    backend: result.backend,
    runtime: result.runtime,
    database: result.database,
    orm: result.orm,
    auth: result.auth,
    authFeatures: result.authFeatures,
    payments: result.payments,
    email: result.email,
    emailProvider: result.emailProvider,
    i18n: result.i18n,
    addons: result.addons,
    examples: result.examples,
    git: result.git,
    packageManager: result.packageManager,
    install: result.install,
    dbSetup: result.dbSetup,
    api: result.api,
    webDeploy: result.webDeploy,
    serverDeploy: result.serverDeploy,
    webDomain: result.webDomain,
    serverDomain: result.serverDomain,
    emailDomain: result.emailDomain,
    cloudflare: result.cloudflare,
    shadcnTheme: flags.shadcnTheme,
  };
}

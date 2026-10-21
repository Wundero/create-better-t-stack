import { Result } from "better-result";

import {
  ANALYTICS_I18N_MAX_LOCALES,
  AnalyticsEventSchema,
  type AnalyticsEvent,
  type AnalyticsMode,
  type ProjectConfig,
} from "../types";
import { getLatestCLIVersion } from "./get-latest-cli-version";
import { isTelemetryEnabled } from "./telemetry";

const CONVEX_INGEST_URL = process.env.CONVEX_INGEST_URL;
const SEND_TIMEOUT_MS = 3000;

async function sendConvexEvent(payload: AnalyticsEvent): Promise<void> {
  if (!CONVEX_INGEST_URL) return;

  await Result.tryPromise({
    try: () =>
      fetch(CONVEX_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        keepalive: true,
      }),
    catch: () => undefined, // Silent failure
  });
}

export function buildAnalyticsEvent(config: ProjectConfig, mode?: AnalyticsMode): AnalyticsEvent {
  return AnalyticsEventSchema.parse({
    mode,
    database: config.database,
    orm: config.orm,
    backend: config.backend,
    runtime: config.runtime,
    frontend: config.frontend,
    addons: config.addons,
    examples: config.examples,
    auth: config.auth,
    payments: config.payments,
    i18n: config.i18n,
    i18nLocaleCount:
      config.i18n !== undefined && config.i18n !== "none"
        ? Math.min(config.i18nOptions?.locales.length ?? 0, ANALYTICS_I18N_MAX_LOCALES)
        : undefined,
    git: config.git,
    packageManager: config.packageManager,
    install: config.install,
    dbSetup: config.dbSetup,
    api: config.api,
    webDeploy: config.webDeploy,
    serverDeploy: config.serverDeploy,
    cli_version: getLatestCLIVersion(),
    node_version: process.version,
    platform: process.platform,
  });
}

export async function trackProjectCreation(
  config: ProjectConfig,
  disableAnalytics = false,
  mode?: AnalyticsMode,
): Promise<void> {
  if (!isTelemetryEnabled() || disableAnalytics) return;

  await Result.tryPromise({
    try: () => sendConvexEvent(buildAnalyticsEvent(config, mode)),
    catch: () => undefined, // Silent failure
  });
}

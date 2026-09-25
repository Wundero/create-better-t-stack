import type { AnalyticsEventFields } from "../analytics/helpers";
import type { AnalyticsEventRow } from "../types";

const ARRAY_FIELDS = ["frontend", "addons", "examples"] as const;

function encodeArray(value: string[] | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function decodeArray(value: string | null): string[] | undefined {
  if (value === null) return undefined;
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.map(String) : undefined;
}

/** Column order for `INSERT INTO analytics_events`. */
export const EVENT_INSERT_COLUMNS = [
  "created_at",
  "database",
  "orm",
  "backend",
  "runtime",
  "frontend",
  "addons",
  "examples",
  "auth",
  "payments",
  "git",
  "package_manager",
  "install",
  "db_setup",
  "api",
  "web_deploy",
  "server_deploy",
  "cli_version",
  "node_version",
  "platform",
  "mode",
] as const;

export function eventInsertValues(
  event: AnalyticsEventFields,
  createdAt: number,
): (string | number | null)[] {
  return [
    createdAt,
    event.database ?? null,
    event.orm ?? null,
    event.backend ?? null,
    event.runtime ?? null,
    encodeArray(event.frontend),
    encodeArray(event.addons),
    encodeArray(event.examples),
    event.auth ?? null,
    event.payments ?? null,
    event.git === undefined ? null : event.git ? 1 : 0,
    event.packageManager ?? null,
    event.install === undefined ? null : event.install ? 1 : 0,
    event.dbSetup ?? null,
    event.api ?? null,
    event.webDeploy ?? null,
    event.serverDeploy ?? null,
    event.cli_version ?? null,
    event.node_version ?? null,
    event.platform ?? null,
    event.mode ?? null,
  ];
}

export function rowToEvent(row: AnalyticsEventRow): AnalyticsEventFields {
  const event: AnalyticsEventFields = {};
  if (row.database !== null) event.database = row.database;
  if (row.orm !== null) event.orm = row.orm;
  if (row.backend !== null) event.backend = row.backend;
  if (row.runtime !== null) event.runtime = row.runtime;
  const frontend = decodeArray(row.frontend);
  if (frontend !== undefined) event.frontend = frontend;
  const addons = decodeArray(row.addons);
  if (addons !== undefined) event.addons = addons;
  const examples = decodeArray(row.examples);
  if (examples !== undefined) event.examples = examples;
  if (row.auth !== null) event.auth = row.auth;
  if (row.payments !== null) event.payments = row.payments;
  if (row.git !== null) event.git = row.git === 1;
  if (row.package_manager !== null) event.packageManager = row.package_manager;
  if (row.install !== null) event.install = row.install === 1;
  if (row.db_setup !== null) event.dbSetup = row.db_setup;
  if (row.api !== null) event.api = row.api;
  if (row.web_deploy !== null) event.webDeploy = row.web_deploy;
  if (row.server_deploy !== null) event.serverDeploy = row.server_deploy;
  if (row.cli_version !== null) event.cli_version = row.cli_version;
  if (row.node_version !== null) event.node_version = row.node_version;
  if (row.platform !== null) event.platform = row.platform;
  if (row.mode !== null) event.mode = row.mode;
  return event;
}

export { ARRAY_FIELDS };

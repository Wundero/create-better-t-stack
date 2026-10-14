import type { I18n, I18nConfigInput, I18nOptions } from "@better-t-stack/types";
import type { I18nRoutingStrategy } from "@better-t-stack/types";
import { I18N_ROUTING_STRATEGY_VALUES } from "@better-t-stack/types";

import { DEFAULT_I18N_OPTIONS, type StackState } from "./constant";
import { getStackBackend, getStackFrontends } from "./stack-model";

export const I18N_ROUTING_STRATEGIES = I18N_ROUTING_STRATEGY_VALUES;
export type I18nRoutingStrategyValue = (typeof I18N_ROUTING_STRATEGIES)[number];

const I18N_ROUTING_SET = new Set<string>(I18N_ROUTING_STRATEGIES);

export function isI18nRoutingStrategy(value: string): value is I18nRoutingStrategyValue {
  return I18N_ROUTING_SET.has(value);
}

export function getI18nConfigFromStack(stack: StackState): I18nConfigInput {
  return {
    frontend: getStackFrontends(stack),
    backend: getStackBackend(stack.backend),
    runtime: stack.runtime,
    auth: stack.auth,
    api: stack.api,
    payments: stack.payments,
    addons: stack.addons,
  };
}

type I18nUrlFields = {
  i18n: I18n;
  locales: readonly string[];
  sourceLocale: string;
  routing: string;
  domains: string;
};

export function encodeI18nDomains(domains: Record<string, string> | undefined): string | undefined {
  if (!domains) return undefined;
  const encoded = Object.entries(domains)
    .map(([locale, host]) => `${locale}=${host}`)
    .join(",");
  return encoded.length > 0 ? encoded : undefined;
}

export function decodeI18nDomains(value: string): Record<string, string> | undefined {
  const entries = value
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf("=");
      if (separator <= 0) return null;
      return [pair.slice(0, separator), pair.slice(separator + 1)] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null && entry[1] !== "");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function composeI18nOptions(fields: I18nUrlFields): I18nOptions | undefined {
  if (fields.i18n === "none") return undefined;
  const domains = fields.routing === "domain" ? decodeI18nDomains(fields.domains) : undefined;
  const routing: NonNullable<I18nOptions["routing"]> = {
    strategy: isI18nRoutingStrategy(fields.routing)
      ? fields.routing
      : DEFAULT_I18N_OPTIONS.routing.strategy,
    prefixDefaultLocale: DEFAULT_I18N_OPTIONS.routing.prefixDefaultLocale,
  };
  if (domains) routing.domains = domains;
  return {
    sourceLocale: fields.sourceLocale || DEFAULT_I18N_OPTIONS.sourceLocale,
    locales: fields.locales.length > 0 ? [...fields.locales] : [...DEFAULT_I18N_OPTIONS.locales],
    routing,
    translateSkill: DEFAULT_I18N_OPTIONS.translateSkill,
  };
}

export interface FlattenedI18nOptions {
  locales: string[];
  sourceLocale: string;
  routing: I18nRoutingStrategy;
  domains: string | undefined;
}

export function flattenI18nOptions(options: I18nOptions | undefined): FlattenedI18nOptions {
  return {
    locales: options ? [...options.locales] : [...DEFAULT_I18N_OPTIONS.locales],
    sourceLocale: options?.sourceLocale ?? DEFAULT_I18N_OPTIONS.sourceLocale,
    routing: options?.routing?.strategy ?? DEFAULT_I18N_OPTIONS.routing.strategy,
    domains: encodeI18nDomains(options?.routing?.domains),
  };
}

export function sanitizeI18nOptions(
  i18n: StackState["i18n"],
  options: I18nOptions | undefined,
): I18nOptions | undefined {
  if (i18n === "none") return undefined;

  const sourceLocale = options?.sourceLocale || DEFAULT_I18N_OPTIONS.sourceLocale;
  const locales = [
    ...new Set(options?.locales?.length ? options.locales : DEFAULT_I18N_OPTIONS.locales),
  ];
  if (!locales.includes(sourceLocale)) locales.unshift(sourceLocale);

  const routing: NonNullable<I18nOptions["routing"]> = {
    strategy: options?.routing?.strategy ?? DEFAULT_I18N_OPTIONS.routing.strategy,
    prefixDefaultLocale: options?.routing?.prefixDefaultLocale ?? false,
  };
  const domains = options?.routing?.domains
    ? Object.fromEntries(
        Object.entries(options.routing.domains).filter(([locale]) => locales.includes(locale)),
      )
    : undefined;
  if (domains && Object.keys(domains).length > 0) routing.domains = domains;

  return {
    sourceLocale,
    locales,
    routing,
    translateSkill: options?.translateSkill ?? true,
  };
}

import { isCancel as clackIsCancel, text } from "@clack/prompts";

import {
  getDefaultI18nLibrary,
  I18nOptionsSchema,
  validateI18nOptions,
  type I18n,
  type I18nConfigInput,
  type I18nOptions,
  type I18nRoutingStrategy,
} from "../types";
import { CLIError, UserCancelledError } from "../utils/errors";
import { parseI18nLocalesInput } from "../utils/i18n-cli";
import {
  buildI18nLibraryOptions,
  buildI18nRoutingOptions,
  validateI18nLocalesInput,
} from "./i18n-options";
import {
  isCancel,
  isGoBack,
  navigableConfirm,
  navigableSelect,
  preferValidInitial,
} from "./navigable";

export async function getI18nLibraryChoice(
  i18n: I18n | undefined,
  context: I18nConfigInput,
  previousValue?: I18n,
): Promise<I18n | symbol> {
  if (i18n !== undefined) return i18n;

  const options = buildI18nLibraryOptions(context);
  const selectable = options.filter((option) => !option.disabled);
  const response = await navigableSelect<I18n>({
    message: "Add internationalization?",
    options,
    initialValue: preferValidInitial(selectable, previousValue, getDefaultI18nLibrary(context)),
  });

  if (isGoBack(response)) return response;
  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

async function askLocales(initial: string[]): Promise<string[]> {
  const response = await text({
    message: "Locales (comma-separated)",
    placeholder: initial.join(", "),
    initialValue: initial.join(", "),
    validate: (value) => validateI18nLocalesInput(String(value ?? "")),
  });

  if (clackIsCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return parseI18nLocalesInput(String(response ?? ""));
}

async function askSourceLocale(locales: string[], initial: string): Promise<string | symbol> {
  const options = locales.map((locale) => ({ value: locale, label: locale }));
  const response = await navigableSelect<string>({
    message: "Source locale",
    options,
    initialValue: preferValidInitial(options, initial, locales[0] ?? "en"),
  });

  if (isGoBack(response)) return response;
  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

async function askDomains(
  locales: string[],
  sourceLocale: string,
  initial: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  const domains: Record<string, string> = {};

  for (const locale of locales) {
    const suggested =
      initial?.[locale] ?? (locale === sourceLocale ? "example.com" : `${locale}.example.com`);
    const response = await text({
      message: `Domain for ${locale}`,
      placeholder: suggested,
      initialValue: suggested,
      validate: (value) => {
        const host = String(value ?? "").trim();
        if (host.length === 0) return "Enter a host for this locale.";
        if (Object.values(domains).includes(host)) {
          return `Host "${host}" is already used by another locale.`;
        }
        return undefined;
      },
    });

    if (clackIsCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

    domains[locale] = String(response ?? "").trim();
  }

  return domains;
}

async function askRouting(
  context: I18nConfigInput,
  library: I18n,
  locales: string[],
  sourceLocale: string,
  initial: I18nOptions["routing"],
): Promise<NonNullable<I18nOptions["routing"]> | symbol> {
  const options = buildI18nRoutingOptions(context, library);
  const selectable = options.filter((option) => !option.disabled);
  const fallback = selectable[0]?.value ?? "cookie";

  const response = await navigableSelect<I18nRoutingStrategy>({
    message: "Locale routing",
    options,
    initialValue: preferValidInitial(selectable, initial?.strategy, fallback),
  });

  if (isGoBack(response)) return response;
  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  if (response !== "domain") {
    return { strategy: response, prefixDefaultLocale: initial?.prefixDefaultLocale ?? false };
  }

  const domains = await askDomains(locales, sourceLocale, initial?.domains);
  return { strategy: "domain", prefixDefaultLocale: false, domains };
}

async function askTranslateSkill(initial: boolean): Promise<boolean | symbol> {
  const response = await navigableConfirm({
    message: "Generate the i18n-translate agent skill?",
    initialValue: initial,
  });

  if (isGoBack(response)) return response;
  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

export async function getI18nOptionsChoice(
  library: I18n,
  provided: I18nOptions | undefined,
  context: I18nConfigInput,
  previousValue?: I18nOptions,
): Promise<I18nOptions | symbol | undefined> {
  if (library === "none") return undefined;
  if (provided !== undefined) return provided;

  const seed = previousValue ?? I18nOptionsSchema.parse({});
  const locales = await askLocales(seed.locales);
  const sourceLocale = await askSourceLocale(locales, seed.sourceLocale);
  if (isGoBack(sourceLocale)) return sourceLocale;

  const routing = await askRouting(context, library, locales, sourceLocale, seed.routing);
  if (isGoBack(routing)) return routing;

  const translateSkill = await askTranslateSkill(seed.translateSkill);
  if (isGoBack(translateSkill)) return translateSkill;

  const options: I18nOptions = { sourceLocale, locales, routing, translateSkill };
  const validation = validateI18nOptions(options);
  if (!validation.isOk) {
    throw new CLIError({ message: validation.error });
  }

  return I18nOptionsSchema.parse(options);
}

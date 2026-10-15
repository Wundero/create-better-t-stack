/**
 * inlang message-format complex messages (design D8, D4).
 *
 * `@inlang/plugin-message-format` does not understand ICU inline plurals.
 * A plural is authored as a *complex message*: an array of matches, each with
 * `declarations`, `selectors` and a `match` map (selector key → pattern). This
 * module validates that shape, collects placeholder names, compares a
 * translation against its source, and converts to and from the ICU subset in
 * `src/icu.ts` (used by `i18n:export` and the normalized catalog).
 *
 * The plain-string path stays ICU: `parseMessage` / `compareMessages` in
 * `src/icu.ts` validate simple messages exactly as before.
 */

import { compareMessages, extractArgumentNames, parseMessage } from "./icu";

export type ComplexPattern = string | readonly ComplexMatch[];
export interface ComplexMatch {
  readonly declarations?: readonly string[];
  readonly selectors: readonly string[];
  readonly match: Readonly<Record<string, ComplexPattern>>;
}
export type ComplexMessage = readonly ComplexMatch[];

/** A catalog value: an ICU string, or an inlang complex message. */
export type CatalogMessage = string | ComplexMessage;

export type CatalogMessageParseResult =
  | { readonly ok: true; readonly arguments: readonly string[] }
  | { readonly ok: false; readonly error: string };

export type CatalogMessageComparison =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

const PLURAL_CATEGORY_ORDER = ["zero", "one", "two", "few", "many", "other"] as const;
const DECLARATION_INPUT = /^input\s+([A-Za-z0-9_]+)$/;
const DECLARATION_LOCAL_PLURAL = /^local\s+([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9_]+)\s*:\s*plural$/;
const PLACEHOLDER = /\{\s*([A-Za-z0-9_]+)/g;

export function isComplexMessage(value: CatalogMessage): value is ComplexMessage {
  return Array.isArray(value);
}

function categoryRank(category: string): number {
  const index = PLURAL_CATEGORY_ORDER.indexOf(category as (typeof PLURAL_CATEGORY_ORDER)[number]);
  return index === -1 ? PLURAL_CATEGORY_ORDER.length : index;
}

function compareCategoryKeys(selector: string, firstKey: string, secondKey: string): number {
  return (
    categoryRank(firstKey.slice(selector.length + 1)) -
    categoryRank(secondKey.slice(selector.length + 1))
  );
}

/** CLDR plural categories for a locale, in the canonical order. */
export function pluralCategories(locale: string): string[] {
  const categories = [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories];
  return categories.sort((first, second) => categoryRank(first) - categoryRank(second));
}

function matchPlaceholders(entry: ComplexMatch): string[] {
  return Object.values(entry.match).flatMap(placeholderNames);
}

function placeholderNames(pattern: ComplexPattern): string[] {
  if (Array.isArray(pattern)) return pattern.flatMap(matchPlaceholders);
  return [...pattern.matchAll(PLACEHOLDER)].map((match) => match[1] as string);
}

function collectArguments(message: ComplexMessage): string[] {
  return [...new Set(message.flatMap(matchPlaceholders))].sort();
}

function selectorOf(match: ComplexMatch): string {
  return match.selectors[0] ?? "";
}

function isPluralMatch(match: ComplexMatch): boolean {
  return (match.declarations ?? []).some((line) => DECLARATION_LOCAL_PLURAL.test(line));
}

function pluralInput(match: ComplexMatch): string | undefined {
  for (const line of match.declarations ?? []) {
    const parsed = DECLARATION_LOCAL_PLURAL.exec(line);
    if (parsed) return parsed[2];
  }
  return undefined;
}

function validateMatch(
  match: ComplexMatch,
  index: number,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const path = `match[${index}]`;
  if (!Array.isArray(match.selectors) || match.selectors.length === 0) {
    return { ok: false, error: `${path} must declare at least one selector` };
  }

  const selector = selectorOf(match);
  const bodyKeys = Object.keys(match.match).filter((key) => key.startsWith(`${selector}=`));
  if (bodyKeys.length === 0) {
    return { ok: false, error: `${path} has no patterns for selector "${selector}"` };
  }
  if (isPluralMatch(match) && !bodyKeys.includes(`${selector}=other`)) {
    return { ok: false, error: `${path} is a plural and must define "${selector}=other"` };
  }
  return { ok: true };
}

function validateComplex(
  message: ComplexMessage,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (message.length === 0) return { ok: false, error: "a complex message has no matches" };
  for (const [index, match] of message.entries()) {
    const result = validateMatch(match, index);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** Validates one catalog value (string ICU or complex message). */
export function parseCatalogMessage(message: CatalogMessage): CatalogMessageParseResult {
  if (Array.isArray(message)) {
    const valid = validateComplex(message);
    return valid.ok
      ? { ok: true, arguments: collectArguments(message) }
      : { ok: false, error: valid.error };
  }

  const parsed = parseMessage(message);
  return parsed.ok
    ? { ok: true, arguments: parsed.arguments.map((argument) => argument.name) }
    : { ok: false, error: parsed.error };
}

/** Placeholder names, for the pending report and placeholder comparison. */
export function extractCatalogArguments(message: CatalogMessage): string[] {
  return Array.isArray(message) ? collectArguments(message) : extractArgumentNames(message);
}

function compareComplex(
  source: ComplexMessage,
  translation: ComplexMessage,
): CatalogMessageComparison {
  if (source.length !== translation.length) {
    return { ok: false, error: "the translation has a different number of matches" };
  }

  for (const [index, sourceMatch] of source.entries()) {
    const translationMatch = translation[index];
    if (!translationMatch) {
      return { ok: false, error: `the translation is missing match[${index}]` };
    }

    const selector = selectorOf(sourceMatch);
    if (selectorOf(translationMatch) !== selector) {
      return { ok: false, error: `match[${index}] must keep the selector "${selector}"` };
    }

    for (const [key, sourcePattern] of Object.entries(sourceMatch.match)) {
      if (!key.startsWith(`${selector}=`)) continue;
      const translationPattern = translationMatch.match[key];
      if (translationPattern === undefined) {
        return { ok: false, error: `the translation is missing "${key}"` };
      }
      const expected = [...new Set(placeholderNames(sourcePattern))].sort();
      const actual = [...new Set(placeholderNames(translationPattern))].sort();
      if (expected.join(",") !== actual.join(",")) {
        return {
          ok: false,
          error: `"${key}" placeholder set must stay [${expected.join(", ") || "none"}], got [${actual.join(", ") || "none"}]`,
        };
      }
    }
  }
  return { ok: true };
}

/** Validates that a translation keeps the source's structure and placeholders. */
export function compareCatalogMessages(
  source: CatalogMessage,
  translation: CatalogMessage,
): CatalogMessageComparison {
  const parsedSource = parseCatalogMessage(source);
  if (!parsedSource.ok) {
    return { ok: false, error: `source message is invalid: ${parsedSource.error}` };
  }
  const parsedTranslation = parseCatalogMessage(translation);
  if (!parsedTranslation.ok) {
    return { ok: false, error: `translation is invalid: ${parsedTranslation.error}` };
  }

  if (Array.isArray(source)) {
    if (!Array.isArray(translation)) {
      return { ok: false, error: "source and translation must use the same message shape" };
    }
    return compareComplex(source, translation);
  }
  if (Array.isArray(translation)) {
    return { ok: false, error: "source and translation must use the same message shape" };
  }

  const compared = compareMessages(source, translation);
  return compared.ok ? { ok: true } : { ok: false, error: compared.error };
}

/**
 * The ordered pattern bodies of a message, used as the ` || `-joined `source`
 * of a pending item (one form per plural category, in canonical order).
 */
export function messageForms(message: CatalogMessage): string[] {
  if (!Array.isArray(message)) return [message];
  const [first] = message;
  if (!first) return [];

  const selector = selectorOf(first);
  return Object.entries(first.match)
    .filter(([key]) => key.startsWith(`${selector}=`))
    .sort(([firstKey], [secondKey]) => compareCategoryKeys(selector, firstKey, secondKey))
    .map(([, pattern]) => (Array.isArray(pattern) ? JSON.stringify(pattern) : pattern));
}

/**
 * Builds the target-locale complex message from per-category forms. Mirrors the
 * `i18n-translate` contract: one form per CLDR category of the target locale,
 * in canonical order.
 */
export function buildComplexMessage(
  source: ComplexMessage,
  locale: string,
  forms: readonly string[],
): ComplexMessage {
  const base = source[0];
  if (!base) return [];

  const selector = selectorOf(base);
  const input = pluralInput(base) ?? selector;
  const declaresInput = (base.declarations ?? []).some((line) => DECLARATION_INPUT.test(line));

  const match: Record<string, string> = {};
  for (const [index, category] of pluralCategories(locale).entries()) {
    match[`${selector}=${category}`] = forms[Math.min(index, forms.length - 1)] ?? "";
  }

  const declarations = [
    ...(declaresInput ? [`input ${input}`] : []),
    `local ${selector} = ${input}: plural`,
  ];
  return [{ declarations, selectors: [selector], match }];
}

/**
 * Converts a complex message to the ICU subset in `src/icu.ts`. The plural
 * argument reference becomes `#`, exactly as ICU expects inside a plural.
 */
export function complexMessageToIcu(message: ComplexMessage): string {
  const [first] = message;
  if (!first) return "";

  const selector = selectorOf(first);
  const input = pluralInput(first) ?? selector;

  const parts = Object.entries(first.match)
    .filter(([key]) => key.startsWith(`${selector}=`))
    .sort(([firstKey], [secondKey]) => compareCategoryKeys(selector, firstKey, secondKey))
    .map(([key, pattern]) => {
      const category = key.slice(selector.length + 1);
      const body = Array.isArray(pattern) ? complexMessageToIcu(pattern) : pattern;
      return `${category} {${body.replaceAll(`{${input}}`, "#")}}`;
    });

  return `{${input}, plural, ${parts.join(" ")}}`;
}

/** Converts any catalog message to its ICU string form (for normalization). */
export function catalogMessageToIcu(message: CatalogMessage): string {
  return Array.isArray(message) ? complexMessageToIcu(message) : message;
}

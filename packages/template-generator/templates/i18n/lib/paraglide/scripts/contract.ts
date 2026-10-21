/**
 * The library-independent translation-script contract (design D8).
 *
 * `i18n:pending`, `i18n:apply` and `i18n:check` speak the same JSON shapes for
 * every i18n library. This module is the single definition of those shapes:
 * the `i18n-translate` skill writes exactly the file `decodeApplyFile`
 * accepts, `parsePendingReport` validates what `i18n:pending` prints, and
 * `i18n:check` reads the `I18N_CHECK_ALLOW_MISSING` environment variable.
 *
 * Everything here is library-independent: no compatibility rules, no catalog
 * formats and no library imports. Each library ships an identical copy so the
 * generated `packages/i18n/scripts/contract.ts` always matches the scripts
 * next to it.
 */

/** One untranslated message from `i18n:pending`. */
export interface PendingItem {
  readonly id: string;
  readonly locale: string;
  readonly source: string;
  readonly context: string | null;
  readonly comments: readonly string[];
  readonly references: readonly string[];
  readonly placeholders: readonly string[];
  /** Library-specific: `missing`, `empty`, `pending`, `fuzzy`, `obsolete`, … */
  readonly status: string;
}

/** The JSON envelope `i18n:pending` prints on stdout. */
export interface PendingReport {
  readonly library: string;
  readonly sourceLocale: string;
  readonly items: readonly PendingItem[];
}

/**
 * One item of the file passed to `i18n:apply <file>`.
 *
 * `translation` is a single form. `translations` carries one entry per plural
 * form (in the locale's CLDR order) for libraries whose catalogs store plural
 * forms separately, such as wuchale. Exactly one of the two is required.
 */
export interface ApplyItem {
  readonly id: string;
  readonly locale: string;
  readonly translation?: string;
  readonly translations?: readonly string[];
  readonly context?: string | null;
}

/** The file `i18n:apply <file>` consumes. */
export interface ApplyFile {
  readonly items: readonly ApplyItem[];
}

export interface ApplyFileOptions {
  /**
   * Translations are written for target locales only; the source locale is
   * edited in the catalogs directly. An item for the source locale is a
   * contract violation.
   */
  readonly sourceLocale: string;
}

/** `i18n:check` relaxes missing translations when this is `"1"`. */
export const I18N_CHECK_ALLOW_MISSING = "I18N_CHECK_ALLOW_MISSING";

export function isMissingAllowed(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment[I18N_CHECK_ALLOW_MISSING] === "1";
}

/** Raised when output or input violates the D8 contract. */
export class I18nContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "I18nContractError";
  }
}

function fail(message: string): never {
  throw new I18nContractError(message);
}

function requireNonEmptyString(value: string | undefined, path: string): string {
  if (value === undefined || value.trim().length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: readonly string[] | undefined, path: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${path} must be an array of strings`);
  return value;
}

function normalizePendingItem(item: PendingItem, path: string): PendingItem {
  return {
    id: requireNonEmptyString(item.id, `${path}.id`),
    locale: requireNonEmptyString(item.locale, `${path}.locale`),
    source: requireNonEmptyString(item.source, `${path}.source`),
    context: item.context ?? null,
    comments: requireStringArray(item.comments, `${path}.comments`),
    references: requireStringArray(item.references, `${path}.references`),
    placeholders: requireStringArray(item.placeholders, `${path}.placeholders`),
    status: requireNonEmptyString(item.status, `${path}.status`),
  };
}

/** Parses and validates the stdout of `i18n:pending`. */
export function parsePendingReport(stdout: string): PendingReport {
  let parsed: Partial<PendingReport> | null;
  try {
    parsed = JSON.parse(stdout) as Partial<PendingReport> | null;
  } catch (error) {
    fail(
      `i18n:pending output is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || Array.isArray(parsed)) fail("i18n:pending output must be an object");

  const items = parsed.items;
  if (!Array.isArray(items)) fail("i18n:pending output must contain an items array");

  return {
    library: requireNonEmptyString(parsed.library, "library"),
    sourceLocale: requireNonEmptyString(parsed.sourceLocale, "sourceLocale"),
    items: items.map((item, index) => normalizePendingItem(item, `items[${index}]`)),
  };
}

interface ApplyItemDraft {
  id: string;
  locale: string;
  translation?: string;
  translations?: readonly string[];
  context: string | null;
}

function normalizeApplyItem(
  item: ApplyItem,
  path: string,
  options: ApplyFileOptions,
): ApplyItemDraft {
  const id = requireNonEmptyString(item.id, `${path}.id`);
  const locale = requireNonEmptyString(item.locale, `${path}.locale`);
  if (locale === options.sourceLocale) {
    fail(`${path}.locale is the source locale "${locale}"; edit the source catalog instead`);
  }

  const translation = item.translation;
  const translations = item.translations;
  if (translation === undefined && translations === undefined) {
    fail(`${path} needs a translation or a translations array`);
  }

  const draft: ApplyItemDraft = { id, locale, context: item.context ?? null };
  if (translation !== undefined) {
    draft.translation = requireNonEmptyString(translation, `${path}.translation`);
  }
  if (translations !== undefined) {
    if (!Array.isArray(translations) || translations.length === 0) {
      fail(`${path}.translations must contain at least one form`);
    }
    draft.translations = translations;
  }
  return draft;
}

/**
 * Parses and validates the `i18n:apply <file>` payload: an object with a
 * non-empty `items` array, every item targeting a configured non-source
 * locale, with no duplicate `(id, locale)` pair.
 */
export function decodeApplyFile(text: string, options: ApplyFileOptions): ApplyFile {
  let parsed: Partial<ApplyFile> | null;
  try {
    parsed = JSON.parse(text) as Partial<ApplyFile> | null;
  } catch (error) {
    fail(`the apply file is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || Array.isArray(parsed)) {
    fail('the apply file must be an object with an "items" array');
  }

  const items = parsed.items;
  if (!Array.isArray(items)) fail('the apply file must contain an "items" array');
  if (items.length === 0) {
    fail("the apply file must contain at least one item; skip i18n:apply when nothing is pending");
  }

  const seen = new Set<string>();
  const decoded = items.map((item, index) => {
    const parsedItem = normalizeApplyItem(item, `items[${index}]`, options);
    const key = `${parsedItem.id}\u0000${parsedItem.locale}`;
    if (seen.has(key)) {
      fail(`items[${index}] duplicates ${parsedItem.id} (${parsedItem.locale})`);
    }
    seen.add(key);
    return parsedItem;
  });

  return { items: decoded };
}

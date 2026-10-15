/**
 * i18next ⇄ ICU message conversion for the normalized catalog (`i18n:export`).
 *
 * The supported subset is exactly: `{{name}}` interpolation and i18next v4
 * plural suffixes (`_one`, `_other`, …). Anything else — nesting via `$t(...)`,
 * a stray brace, or a non-identifier argument — fails with the message id.
 *
 * `importCatalogEntries` is the inverse of `exportCatalogEntries`; the
 * generator's ICU round-trip test asserts the two are lossless.
 */

export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export interface CatalogEntry {
  readonly id: string;
  readonly value: string;
}

/** One normalized message: the source-text id and its ICU form. */
export interface IcuMessage {
  readonly id: string;
  readonly icu: string;
}

export class IcuConversionError extends Error {
  readonly messageId: string;

  constructor(messageId: string, reason: string) {
    super(`Cannot convert "${messageId}" to ICU: ${reason}`);
    this.name = "IcuConversionError";
    this.messageId = messageId;
  }
}

const INTERPOLATION_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_$]*)\s*\}\}/g;
const SHORT_ARGUMENT_PATTERN = /\{([A-Za-z][A-Za-z0-9_$]*)\}/g;
const PLURAL_OPTION_PATTERN =
  /(zero|one|two|few|many|other) \{((?:[^{}]|\{[A-Za-z][A-Za-z0-9_$]*\})*)\}/g;

function isPluralCategory(value: string): value is PluralCategory {
  return (PLURAL_CATEGORIES as readonly string[]).includes(value);
}

interface PluralId {
  readonly base: string;
  readonly category: PluralCategory | null;
}

export function splitPluralId(id: string): PluralId {
  const separator = id.lastIndexOf("_");
  if (separator === -1) return { base: id, category: null };
  const suffix = id.slice(separator + 1);
  if (!isPluralCategory(suffix)) return { base: id, category: null };
  return { base: id.slice(0, separator), category: suffix };
}

/** Names of the `{{placeholders}}` in a message, in first-seen order. */
export function interpolationNames(message: string): string[] {
  const names: string[] = [];
  for (const match of message.matchAll(INTERPOLATION_PATTERN)) {
    const name = match[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** i18next template → ICU. Throws `IcuConversionError` outside the subset. */
export function toIcuMessage(id: string, message: string): string {
  if (message.includes("$t("))
    throw new IcuConversionError(id, "nesting via $t() is not supported");
  const icu = message.replace(INTERPOLATION_PATTERN, "{$1}");
  const withoutArguments = icu.replace(SHORT_ARGUMENT_PATTERN, "");
  if (withoutArguments.includes("{") || withoutArguments.includes("}")) {
    throw new IcuConversionError(id, "contains braces that are not {{placeholders}}");
  }
  return icu;
}

/** ICU → i18next template. Throws `IcuConversionError` outside the subset. */
const FORMATTED_ARGUMENT_PATTERN = /\{[A-Za-z][A-Za-z0-9_$]*\s*,/;

export function fromIcuMessage(id: string, icu: string): string {
  if (FORMATTED_ARGUMENT_PATTERN.test(icu) || icu.includes("#")) {
    throw new IcuConversionError(id, "ICU arguments other than {name} are not supported");
  }
  return icu.replace(SHORT_ARGUMENT_PATTERN, "{{$1}}");
}

interface PluralMember {
  readonly id: string;
  readonly category: PluralCategory | null;
  readonly value: string;
}

function comparePluralCategories(first: PluralCategory, second: PluralCategory): number {
  return PLURAL_CATEGORIES.indexOf(first) - PLURAL_CATEGORIES.indexOf(second);
}

function exportFamily(base: string, family: readonly PluralMember[]): IcuMessage {
  if (family.length === 1) {
    const [only] = family;
    if (!only) throw new IcuConversionError(base, "empty plural family");
    if (only.category !== null) {
      throw new IcuConversionError(base, `has _${only.category} but no other plural forms`);
    }
    return { id: base, icu: toIcuMessage(only.id, only.value) };
  }

  const forms: PluralMember[] = [];
  for (const member of family) {
    if (member.category === null) {
      throw new IcuConversionError(base, "mixes a plural family with a plain key of the same name");
    }
    forms.push(member);
  }
  if (!forms.some((form) => form.category === "other")) {
    throw new IcuConversionError(base, "is missing the `other` plural category");
  }

  forms.sort((first, second) =>
    comparePluralCategories(first.category ?? "other", second.category ?? "other"),
  );
  const options = forms
    .map((form) => `${form.category} {${toIcuMessage(form.id, form.value)}}`)
    .join(" ");
  return { id: base, icu: `{count, plural, ${options}}` };
}

/**
 * Source-text catalog entries → normalized ICU messages. Plural families
 * (`id_one`, `id_other`, …) collapse into one `{count, plural, …}` message.
 */
export function exportCatalogEntries(entries: readonly CatalogEntry[]): IcuMessage[] {
  const families = new Map<string, PluralMember[]>();
  for (const entry of entries) {
    const { base, category } = splitPluralId(entry.id);
    const family = families.get(base) ?? [];
    family.push({ id: entry.id, category, value: entry.value });
    families.set(base, family);
  }
  return [...families.entries()].map(([base, family]) => exportFamily(base, family));
}

/** Inverse of `exportCatalogEntries`, used by the ICU round-trip test. */
export function importCatalogEntries(messages: readonly IcuMessage[]): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const message of messages) {
    const pluralMatch = /^\{count, plural, (.*)\}$/s.exec(message.icu);
    if (!pluralMatch?.[1]) {
      entries.push({ id: message.id, value: fromIcuMessage(message.id, message.icu) });
      continue;
    }
    const forms = [...pluralMatch[1].matchAll(PLURAL_OPTION_PATTERN)];
    if (forms.length === 0) throw new IcuConversionError(message.id, "plural has no options");
    for (const form of forms) {
      const category = form[1];
      const body = form[2];
      if (!category || body === undefined) {
        throw new IcuConversionError(message.id, "plural option is malformed");
      }
      entries.push({
        id: `${message.id}_${category}`,
        value: fromIcuMessage(`${message.id}_${category}`, body),
      });
    }
  }
  return entries;
}

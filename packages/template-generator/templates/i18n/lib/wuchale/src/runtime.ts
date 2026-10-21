/**
 * wuchale runtime re-exports and the `plural()` code pattern.
 *
 * Surface glue imports `loadLocale` from here; wuchale's compiler injects its
 * own runtime imports into transformed components. The shared `Intl`
 * formatters (`createFormatters`) stay library-independent — never format
 * dates or numbers through wuchale.
 */

import { sourceLocale } from "./config";

export { commitLocale, loadLocale, loadLocaleSync, registerLoaders } from "wuchale/load-utils";
export type { CatalogModule, Runtime } from "wuchale/runtime";

const CATEGORY_ORDER: readonly Intl.LDMLPluralRule[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];

const categoryIndicesByLocale = new Map<string, ReadonlyMap<Intl.LDMLPluralRule, number>>();

/** CLDR category → candidate index, matching wuchale's generated `plural.js`. */
function categoryIndices(locale: string): ReadonlyMap<Intl.LDMLPluralRule, number> {
  const cached = categoryIndicesByLocale.get(locale);
  if (cached !== undefined) return cached;

  const categories = [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories];
  categories.sort(
    (first, second) => CATEGORY_ORDER.indexOf(first) - CATEGORY_ORDER.indexOf(second),
  );
  const indices = new Map(categories.map((category, index) => [category, index]));
  categoryIndicesByLocale.set(locale, indices);
  return indices;
}

/**
 * The `plural(count, ["one item", "# items"])` code pattern wuchale looks for.
 * The compiler replaces the candidate array with the compiled catalog for the
 * active locale and appends `_w_runtime_.l` as the locale argument, so this
 * only selects the candidate and substitutes `#`.
 */
export function plural(
  count: number,
  candidates: readonly string[],
  locale: string = sourceLocale,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const index = categoryIndices(locale).get(category) ?? 0;
  const candidate = candidates[index] ?? candidates[candidates.length - 1] ?? "";
  return candidate.replace("#", String(count));
}

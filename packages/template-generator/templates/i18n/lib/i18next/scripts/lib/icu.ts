/**
 * Placeholder extraction for the i18next uniform script contract: `i18n:pending`,
 * `i18n:apply` and `i18n:check` compare the `{{placeholders}}` of a source
 * message with its translations.
 */

const INTERPOLATION_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_$]*)\s*\}\}/g;

/** Names of the `{{placeholders}}` in a message, in first-seen order. */
export function interpolationNames(message: string): string[] {
  const names: string[] = [];
  for (const match of message.matchAll(INTERPOLATION_PATTERN)) {
    const name = match[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

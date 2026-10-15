/**
 * ICU MessageFormat subset used by `i18n:pending`, `i18n:apply` and `i18n:check`.
 *
 * The supported subset is arguments (`{name}`), `plural` and `selectordinal`
 * with `#`, `select`, and arbitrarily nested messages. Anything else —
 * `number`, `date`, `time` and markup — fails validation.
 */

export type IcuArgumentType = "argument" | "plural" | "selectordinal" | "select";

export interface IcuArgument {
  readonly name: string;
  readonly type: IcuArgumentType;
  /** Selector keys (`select`) or plural categories (`plural`, `selectordinal`). */
  readonly options: readonly string[];
}

export type IcuParseResult =
  | { readonly ok: true; readonly arguments: readonly IcuArgument[] }
  | { readonly ok: false; readonly error: string };

export type IcuComparison = { readonly ok: true } | { readonly ok: false; readonly error: string };

const ARGUMENT_NAME = /^[A-Za-z0-9_]+$/;
const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
const EXACT_SELECTOR = /^=[0-9]+$/;

class IcuError extends Error {}

interface ParseState {
  readonly message: string;
  index: number;
  readonly arguments: Map<string, IcuArgument>;
}

function parseMessageInto(state: ParseState, allowPound: boolean): void {
  const { message } = state;

  while (state.index < message.length) {
    const character = message.charAt(state.index);

    if (character === "}") return;

    if (character === "#") {
      if (!allowPound) throw new IcuError("`#` is only valid inside plural or selectordinal");
      state.index += 1;
      continue;
    }

    if (character === "{") {
      state.index += 1;
      parseArgument(state);
      continue;
    }

    state.index += 1;
  }
}

function readUntil(state: ParseState, terminators: readonly string[]): string {
  const start = state.index;

  while (state.index < state.message.length) {
    if (terminators.includes(state.message.charAt(state.index))) break;
    state.index += 1;
  }

  return state.message.slice(start, state.index);
}

function record(state: ParseState, argument: IcuArgument): void {
  const existing = state.arguments.get(argument.name);
  if (existing && existing.type !== argument.type) {
    throw new IcuError(
      `argument "${argument.name}" is used as both ${existing.type} and ${argument.type}`,
    );
  }
  state.arguments.set(argument.name, argument);
}

function parseSelectors(state: ParseState, argumentName: string, type: IcuArgumentType): string[] {
  const options: string[] = [];

  while (true) {
    while (state.index < state.message.length && /\s/.test(state.message.charAt(state.index))) {
      state.index += 1;
    }

    if (state.message.charAt(state.index) === "}") {
      state.index += 1;
      break;
    }

    const key = readUntil(state, ["{", "}"]).trim();
    if (state.message.charAt(state.index) !== "{" || key.length === 0) {
      throw new IcuError(`selector "${key}" in {${argumentName}, ${type}} has no message body`);
    }

    state.index += 1;
    parseMessageInto(state, type !== "select");
    if (state.message.charAt(state.index) !== "}") {
      throw new IcuError(`unbalanced braces in {${argumentName}, ${type}}`);
    }
    state.index += 1;
    options.push(key);
  }

  if (options.length === 0) {
    throw new IcuError(`{${argumentName}, ${type}} has no selectors`);
  }
  return options;
}

function validateSelectors(
  argumentName: string,
  type: IcuArgumentType,
  options: readonly string[],
): void {
  if (type === "select") return;

  for (const option of options) {
    if (!PLURAL_CATEGORIES.has(option) && !EXACT_SELECTOR.test(option)) {
      throw new IcuError(`"${option}" is not a plural category for {${argumentName}, ${type}}`);
    }
  }
  if (!options.includes("other")) {
    throw new IcuError(`{${argumentName}, ${type}} is missing the "other" selector`);
  }
}

function assertArgumentName(name: string): void {
  if (!ARGUMENT_NAME.test(name)) {
    throw new IcuError(`"${name}" is not a valid argument name`);
  }
}

function parseArgument(state: ParseState): void {
  const name = readUntil(state, [",", "}"]).trim();

  if (state.message.charAt(state.index) === "}") {
    state.index += 1;
    assertArgumentName(name);
    record(state, { name, type: "argument", options: [] });
    return;
  }

  state.index += 1;
  const type = readUntil(state, [",", "}"]).trim();
  assertArgumentName(name);

  if (type !== "plural" && type !== "selectordinal" && type !== "select") {
    throw new IcuError(`{${name}, ${type}} is outside the supported ICU subset`);
  }
  if (state.message.charAt(state.index) !== ",") {
    throw new IcuError(`{${name}, ${type}} is missing its selectors`);
  }
  state.index += 1;

  const options = parseSelectors(state, name, type);
  validateSelectors(name, type, options);
  record(state, { name, type, options });
}

/** Parses one message and rejects anything outside the supported ICU subset. */
export function parseMessage(message: string): IcuParseResult {
  const state: ParseState = { message, index: 0, arguments: new Map() };

  try {
    parseMessageInto(state, false);
    if (state.index < message.length) {
      throw new IcuError("unbalanced `}`");
    }
  } catch (error) {
    if (error instanceof IcuError) return { ok: false, error: error.message };
    throw error;
  }

  return { ok: true, arguments: [...state.arguments.values()] };
}

/** Sorted argument names, used as the `placeholders` field of pending items. */
export function extractArgumentNames(message: string): string[] {
  const parsed = parseMessage(message);
  if (!parsed.ok) return [];
  return parsed.arguments.map((argument) => argument.name).sort();
}

function selectorSetsMatch(source: IcuArgument, translation: IcuArgument): IcuComparison {
  if (source.type === "select") {
    const expected = [...source.options].sort();
    const actual = [...translation.options].sort();
    if (expected.join(",") !== actual.join(",")) {
      return {
        ok: false,
        error: `selector set for "${source.name}" must stay [${expected.join(", ")}], got [${actual.join(", ")}]`,
      };
    }
    return { ok: true };
  }

  const exactSelectors = source.options.filter((option) => EXACT_SELECTOR.test(option));
  for (const selector of exactSelectors) {
    if (!translation.options.includes(selector)) {
      return { ok: false, error: `translation for "${source.name}" is missing ${selector}` };
    }
  }
  if (!translation.options.includes("other")) {
    return { ok: false, error: `translation for "${source.name}" is missing the "other" selector` };
  }
  return { ok: true };
}

/**
 * Validates that a translation keeps the source's placeholder and ICU argument
 * sets: the same argument names, the same argument types, the same `select`
 * selector sets and the same exact-match plural selectors.
 */
export function compareMessages(source: string, translation: string): IcuComparison {
  const parsedSource = parseMessage(source);
  if (!parsedSource.ok) {
    return { ok: false, error: `source message is invalid: ${parsedSource.error}` };
  }

  const parsedTranslation = parseMessage(translation);
  if (!parsedTranslation.ok) {
    return { ok: false, error: `translation is invalid: ${parsedTranslation.error}` };
  }

  const translated = new Map(
    parsedTranslation.arguments.map((argument) => [argument.name, argument]),
  );

  for (const sourceArgument of parsedSource.arguments) {
    const translationArgument = translated.get(sourceArgument.name);
    if (!translationArgument) {
      return { ok: false, error: `translation is missing the argument "${sourceArgument.name}"` };
    }
    if (translationArgument.type !== sourceArgument.type) {
      return {
        ok: false,
        error: `argument "${sourceArgument.name}" must stay a ${sourceArgument.type}`,
      };
    }
    if (sourceArgument.type !== "argument") {
      const selectors = selectorSetsMatch(sourceArgument, translationArgument);
      if (!selectors.ok) return selectors;
    }
    translated.delete(sourceArgument.name);
  }

  const extra = [...translated.keys()];
  if (extra.length > 0) {
    return { ok: false, error: `translation adds the unknown argument(s) ${extra.join(", ")}` };
  }

  return { ok: true };
}

/**
 * ICU MessageFormat subset analysis shared by the Lingui `i18n:*` scripts.
 *
 * `i18n:export` must fail loudly when a message uses constructs the Rust side
 * cannot evaluate, and `i18n:apply` must reject translations whose argument
 * sets differ from the source. Both use the analyzer here. The subset is the
 * one D7 describes: arguments, `plural`/`selectordinal` with `#`, `select`,
 * and recursive nesting.
 */

const SUPPORTED_TYPES = new Set(["plural", "selectordinal", "select", "number", "date", "time"]);

const IDENTIFIER = /[A-Za-z0-9_$@.-]/;
const KEY = /[A-Za-z0-9_=+-]/;

export interface IcuArgument {
  name: string;
  type: "argument" | "plural" | "selectordinal" | "select" | "format";
  categories: string[];
}

export interface IcuAnalysis {
  arguments: IcuArgument[];
  issues: string[];
}

interface ScanState {
  text: string;
  index: number;
  depth: number;
  pluralDepth: number;
  issues: string[];
}

function scanIdentifier(state: ScanState): string {
  let value = "";
  while (state.index < state.text.length) {
    const character = state.text[state.index] ?? "";
    if (!IDENTIFIER.test(character)) break;
    value += character;
    state.index += 1;
  }
  return value;
}

function skipWhitespace(state: ScanState): void {
  while (state.index < state.text.length && /\s/.test(state.text[state.index] ?? "")) {
    state.index += 1;
  }
}

function scanKey(state: ScanState): string {
  let value = "";
  while (state.index < state.text.length) {
    const character = state.text[state.index] ?? "";
    if (!KEY.test(character)) break;
    value += character;
    state.index += 1;
  }
  return value;
}

function scanMessage(state: ScanState, untilBrace: boolean, argumentsList: IcuArgument[]): void {
  while (state.index < state.text.length) {
    const character = state.text[state.index] ?? "";

    if (character === "}") {
      if (untilBrace) {
        state.index += 1;
        return;
      }
      state.issues.push('Unexpected "}".');
      state.index += 1;
      continue;
    }

    if (character === "#") {
      if (state.pluralDepth === 0) {
        state.issues.push('"#" is only supported inside plural arguments.');
      }
      state.index += 1;
      continue;
    }

    if (character !== "{") {
      state.index += 1;
      continue;
    }

    state.index += 1;
    skipWhitespace(state);
    const name = scanIdentifier(state);
    skipWhitespace(state);

    const next = state.text[state.index] ?? "";
    if (next === "}") {
      state.index += 1;
      if (!name) state.issues.push("Empty argument name.");
      else argumentsList.push({ name, type: "argument", categories: [] });
      continue;
    }

    if (next !== ",") {
      state.issues.push(`Invalid argument syntax near "${name || "{"}".`);
      state.index += 1;
      continue;
    }
    state.index += 1;
    skipWhitespace(state);
    const type = scanIdentifier(state);
    skipWhitespace(state);

    if (!SUPPORTED_TYPES.has(type)) {
      state.issues.push(`Unsupported argument type "${type}" in "{${name}, ${type}".`);
    }

    if (type === "plural" || type === "selectordinal" || type === "select") {
      const categories: string[] = [];
      state.pluralDepth += type === "select" ? 0 : 1;
      while (state.index < state.text.length) {
        skipWhitespace(state);
        const character = state.text[state.index] ?? "";
        if (character === "}") {
          state.index += 1;
          break;
        }
        if (character === "{") {
          state.issues.push('Expected a category key before "{".');
          state.index += 1;
          state.depth += 1;
          scanMessage(state, true, argumentsList);
          state.depth -= 1;
          continue;
        }
        const category = scanKey(state);
        if (!category) {
          state.index += 1;
          continue;
        }
        categories.push(category);
        skipWhitespace(state);
        if ((state.text[state.index] ?? "") === "{") {
          state.index += 1;
          state.depth += 1;
          scanMessage(state, true, argumentsList);
          state.depth -= 1;
        }
      }
      state.pluralDepth -= type === "select" ? 0 : 1;
      if (!name) state.issues.push("Missing argument name.");
      else {
        argumentsList.push({
          name,
          type:
            type === "selectordinal" ? "selectordinal" : type === "select" ? "select" : "plural",
          categories: [...categories].sort(),
        });
      }
      continue;
    }

    // Format arguments (`number`, `date`, `time`) keep the style, not a message.
    let braces = 0;
    for (; state.index < state.text.length; state.index += 1) {
      const inner = state.text[state.index] ?? "";
      if (inner === "{") braces += 1;
      else if (inner === "}") {
        braces -= 1;
        if (braces < 0) {
          state.index += 1;
          break;
        }
      }
    }
    if (name) argumentsList.push({ name, type: "format", categories: [] });
  }

  if (untilBrace) state.issues.push('Missing closing "}".');
}

export function analyzeIcu(message: string): IcuAnalysis {
  const state: ScanState = { text: message, index: 0, depth: 0, pluralDepth: 0, issues: [] };
  const argumentsList: IcuArgument[] = [];
  scanMessage(state, false, argumentsList);
  return { arguments: argumentsList, issues: state.issues };
}

/** Returns the list of problems that keep a message out of the exported ICU subset. */
export function validateIcuSubset(message: string): string[] {
  return analyzeIcu(message).issues;
}

/**
 * Canonical, comparable form of a message's argument set. Two messages with
 * the same signature accept exactly the same values, so `i18n:apply` compares
 * the source signature with the translation signature.
 */
export function icuSignature(message: string): string {
  return analyzeIcu(message)
    .arguments.map((argument) =>
      argument.type === "argument" || argument.type === "format"
        ? argument.name
        : `${argument.name}:${argument.type}[${argument.categories.join(",")}]`,
    )
    .sort()
    .join("|");
}

/** The names `i18n:pending` hands to translators so they can keep placeholders intact. */
export function icuPlaceholders(message: string): string[] {
  return [...new Set(analyzeIcu(message).arguments.map((argument) => argument.name))].sort();
}

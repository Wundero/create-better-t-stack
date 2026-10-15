/**
 * Minimal Gettext `.po` reader/writer for the wuchale script contract.
 *
 * Handles the subset wuchale writes: header entries, singular and plural
 * messages, contexts, translator/extracted comments, references, flags and
 * obsolete entries with `#~`. It is intentionally dependency-free so the
 * generated `@<project>/i18n` package does not need `pofile` at runtime.
 */

export interface PoItem {
  comments: string[];
  extracted: string[];
  references: string[];
  flags: string[];
  context: string | null;
  id: string;
  pluralId: string | null;
  translations: string[];
  obsolete: boolean;
}

export interface PoCatalog {
  /** Verbatim header lines (comments + the empty `msgid`/`msgstr` entry). */
  headers: string[];
  items: PoItem[];
}

const COMMENT_PREFIXES = ["#.", "#:", "#,", "#"] as const;

const ESCAPES = new Map<string, string>([
  ["\\", "\\"],
  ['"', '"'],
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
]);

function unquote(value: string): string {
  try {
    return JSON.parse(value) as string;
  } catch {
    const inner = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    return inner.replace(
      /\\(["\\ntr])/g,
      (_match: string, char: string) => ESCAPES.get(char) ?? char,
    );
  }
}

export function quotePo(value: string): string {
  return JSON.stringify(value);
}

function createItem(): PoItem {
  return {
    comments: [],
    extracted: [],
    references: [],
    flags: [],
    context: null,
    id: "",
    pluralId: null,
    translations: [],
    obsolete: false,
  };
}

interface PendingField {
  key: "msgctxt" | "msgid" | "msgid_plural" | "msgstr";
  index: number;
  value: string;
}

function flushField(item: PoItem, field: PendingField | null): void {
  if (!field) return;
  if (field.key === "msgctxt") item.context = field.value;
  else if (field.key === "msgid") item.id = field.value;
  else if (field.key === "msgid_plural") item.pluralId = field.value;
  else item.translations[field.index] = field.value;
}

function parseBlock(block: string[]): PoItem {
  const item = createItem();
  let field: PendingField | null = null;

  for (const rawLine of block) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.startsWith('"')) {
      if (!field) continue;
      field.value += unquote(trimmed);
      continue;
    }

    const obsolete = trimmed.startsWith("#~");
    const line = obsolete ? trimmed.slice(2).trimStart() : trimmed;

    if (line.startsWith("#")) {
      flushField(item, field);
      field = null;
      item.obsolete = item.obsolete || obsolete;
      parseComment(item, line);
      continue;
    }

    const match = /^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?\s+(".*")\s*$/.exec(line);
    if (!match) {
      flushField(item, field);
      field = null;
      continue;
    }

    flushField(item, field);
    field = {
      key: match[1] as PendingField["key"],
      index: match[2] ? Number.parseInt(match[2], 10) : 0,
      value: match[3] ? unquote(match[3]) : "",
    };
  }

  flushField(item, field);
  return item;
}

function parseComment(item: PoItem, line: string): void {
  if (line.startsWith("#.")) {
    item.extracted.push(line.slice(2).trim());
    return;
  }
  if (line.startsWith("#:")) {
    item.references.push(...line.slice(2).trim().split(/\s+/).filter(Boolean));
    return;
  }
  if (line.startsWith("#,")) {
    item.flags.push(...line.slice(2).trim().split(/\s+/).filter(Boolean));
    return;
  }
  if (line.startsWith("#~|")) return;
  item.comments.push(line.startsWith("#") ? line.slice(1).trim() : line);
}

const FIELD_PATTERN = /^(#~\s+)?(msgctxt|msgid_plural|msgid|msgstr)(?:\[\d+\])?\s/;

export function parsePo(content: string): PoCatalog {
  const catalog: PoCatalog = { headers: [], items: [] };
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  let block: string[] = [];
  let blockHasField = false;
  let headerSeen = false;

  const consume = (): void => {
    if (block.length === 0) return;
    const raw = block;
    const item = parseBlock(raw);
    block = [];
    blockHasField = false;
    if (item.id === "" && item.context === null && item.pluralId === null) {
      if (!headerSeen) {
        headerSeen = true;
        catalog.headers = [...raw];
      }
      return;
    }
    catalog.items.push(item);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      consume();
      continue;
    }
    const isComment = COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    if (isComment && blockHasField) {
      consume();
    }
    block.push(line);
    if (FIELD_PATTERN.test(trimmed)) blockHasField = true;
  }
  consume();

  return catalog;
}

export function isUntranslated(translations: readonly string[]): boolean {
  return translations.every((value) => value.length === 0);
}

export function serializePo(catalog: PoCatalog): string {
  const lines: string[] = [];
  if (catalog.headers.length > 0) {
    lines.push(...catalog.headers, "");
  }

  for (const item of catalog.items) {
    const prefix = item.obsolete ? "#~ " : "";
    for (const comment of item.comments) lines.push(`# ${comment}`.trimEnd());
    for (const comment of item.extracted) lines.push(`#. ${comment}`.trimEnd());
    if (item.references.length > 0) lines.push(`#: ${item.references.join(" ")}`);
    if (item.flags.length > 0) lines.push(`#, ${item.flags.join(", ")}`);
    if (item.context !== null) lines.push(`${prefix}msgctxt ${quotePo(item.context)}`);
    lines.push(`${prefix}msgid ${quotePo(item.id)}`);
    if (item.pluralId !== null) {
      lines.push(`${prefix}msgid_plural ${quotePo(item.pluralId)}`);
      item.translations.forEach((translation, index) => {
        lines.push(`${prefix}msgstr[${index}] ${quotePo(translation)}`);
      });
    } else {
      lines.push(`${prefix}msgstr ${quotePo(item.translations[0] ?? "")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

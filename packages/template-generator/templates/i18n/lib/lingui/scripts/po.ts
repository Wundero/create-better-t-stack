/**
 * Minimal gettext PO reader/writer for the shared `i18n:*` script contract.
 *
 * The generated project owns its catalogs, so the scripts read and write the
 * exact Lingui PO shape (`msgid` = source text, optional `msgctxt`, `js-lingui-*`
 * flags, `#.` comments, `#:` references, `#~` obsolete entries) without pulling
 * in extra parsing dependencies.
 */
import { createHash } from "node:crypto";

export interface PoEntry {
  msgid: string;
  msgctxt?: string;
  msgstr: string;
  comments: string[];
  references: string[];
  flags: string[];
  obsolete: boolean;
  previous?: string;
}

export interface PoCatalog {
  headers: Record<string, string>;
  entries: PoEntry[];
}

export const EXPLICIT_ID_FLAG = "js-lingui-explicit-id";

/**
 * Lingui v6 message ID: first 6 chars of base64url(sha256(message + 0x1F + context)).
 * Must stay in sync with the macro transform so `i18n:apply` can address
 * generated-ID entries; a round-trip test locks it.
 */
export function generateMessageId(message: string, context = ""): string {
  const digest = createHash("sha256")
    .update(message)
    .update("\u001f")
    .update(context)
    .digest("base64url");
  return digest.slice(0, 6);
}

/** The runtime ID of a PO entry: explicit IDs stay as-is, generated ones are hashes. */
export function catalogId(entry: PoEntry): string {
  if (entry.flags.includes(EXPLICIT_ID_FLAG)) return entry.msgid;
  return generateMessageId(entry.msgid, entry.msgctxt ?? "");
}

/**
 * Source text of a PO entry. Generated-ID entries carry the source in `msgid`;
 * explicit-ID entries use `msgid` as the ID and keep the source text in the
 * source-locale `msgstr`.
 */
export function sourceTextOf(entry: PoEntry): string {
  if (!entry.flags.includes(EXPLICIT_ID_FLAG)) return entry.msgid;
  return entry.msgstr.trim() === "" ? entry.msgid : entry.msgstr;
}

export function unescapePo(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (character !== "\\") {
      result += character;
      continue;
    }
    const next = value[index + 1];
    index += 1;
    switch (next) {
      case "n":
        result += "\n";
        break;
      case "t":
        result += "\t";
        break;
      case "r":
        result += "\r";
        break;
      case '"':
        result += '"';
        break;
      case "\\":
        result += "\\";
        break;
      default:
        result += next ?? "";
    }
  }
  return result;
}

export function escapePo(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}

function quotedValue(line: string): string | undefined {
  const match = /^"((?:[^"\\]|\\.)*)"$/.exec(line);
  return match ? unescapePo(match[1] ?? "") : undefined;
}

function emptyEntry(): PoEntry {
  return {
    msgid: "",
    msgstr: "",
    comments: [],
    references: [],
    flags: [],
    obsolete: false,
  };
}

interface ParserState {
  entry: PoEntry;
  field?: "msgid" | "msgctxt" | "msgstr";
}

/** Parses one PO file. Header entries (`msgid ""`) feed `headers`. */
export function parsePoFile(content: string): PoCatalog {
  const headers: Record<string, string> = {};
  const entries: PoEntry[] = [];
  let state: ParserState | undefined;

  const pushEntry = (): void => {
    if (!state) return;
    const entry = state.entry;
    if (entry.msgid === "" && entry.msgctxt === undefined && !entry.obsolete) {
      for (const line of entry.msgstr.split("\n")) {
        const separator = line.indexOf(":");
        if (separator > 0) {
          headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
        }
      }
    } else if (entry.msgid !== "" || entry.msgctxt !== undefined) {
      entries.push(entry);
    }
    state = undefined;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const isObsolete = rawLine.startsWith("#~");
    const line = isObsolete ? rawLine.replace(/^#~\s?/, "") : rawLine;
    const trimmed = line.trim();

    if (trimmed === "") {
      pushEntry();
      continue;
    }

    if (trimmed.startsWith("#.")) {
      state ??= { entry: emptyEntry() };
      state.entry.comments.push(trimmed.slice(2).trim());
      continue;
    }
    if (trimmed.startsWith("#:")) {
      state ??= { entry: emptyEntry() };
      state.entry.references.push(...trimmed.slice(2).trim().split(/\s+/));
      continue;
    }
    if (trimmed.startsWith("#,")) {
      state ??= { entry: emptyEntry() };
      state.entry.flags.push(
        ...trimmed
          .slice(2)
          .split(",")
          .map((flag) => flag.trim())
          .filter(Boolean),
      );
      continue;
    }
    if (trimmed.startsWith("#|")) {
      state ??= { entry: emptyEntry() };
      const value = quotedValue(trimmed.slice(2).trim());
      if (value !== undefined) state.entry.previous = value;
      continue;
    }
    if (trimmed.startsWith("#")) {
      state ??= { entry: emptyEntry() };
      continue;
    }

    const continuation = quotedValue(trimmed);
    if (continuation !== undefined) {
      if (state?.field) {
        state.entry[state.field] = (state.entry[state.field] ?? "") + continuation;
      }
      continue;
    }

    const keyword = /^(msgid|msgctxt|msgstr)(?:\s+(.*))?$/.exec(trimmed);
    if (keyword) {
      const field = keyword[1] as ParserState["field"];
      const value = quotedValue(keyword[2] ?? '""') ?? "";
      state ??= { entry: emptyEntry() };
      state.field = field;
      if (field) state.entry[field] = value;
      if (isObsolete) state.entry.obsolete = true;
      continue;
    }

    if (isObsolete) {
      state ??= { entry: emptyEntry() };
      state.entry.obsolete = true;
    }
  }

  pushEntry();
  return { headers, entries };
}

function wrapString(keyword: string, value: string): string {
  if (!value.includes("\n")) return `${keyword} "${escapePo(value)}"`;
  const lines = value.split("\n");
  const parts = [`${keyword} "${escapePo(lines[0] ?? "")}\\n"`];
  for (let index = 1; index < lines.length; index += 1) {
    const last = index === lines.length - 1;
    parts.push(`"${escapePo(lines[index] ?? "")}${last ? "" : "\\n"}"`);
  }
  return parts.join("\n");
}

/** Serializes a catalog. Active entries keep their order; obsolete ones move last. */
export function serializePoFile(catalog: PoCatalog): string {
  const header = `msgid ""\nmsgstr ""\n${Object.entries(catalog.headers)
    .map(([key, value]) => `"${escapePo(`${key}: ${value}\n`)}"`)
    .join("\n")}`;

  const blocks: string[] = [];
  const obsolete: string[] = [];
  for (const entry of catalog.entries) {
    const lines: string[] = [];
    for (const comment of entry.comments) lines.push(`#. ${comment}`);
    if (entry.references.length > 0) lines.push(`#: ${entry.references.join(" ")}`);
    if (entry.previous !== undefined) lines.push(`#| msgid "${escapePo(entry.previous)}"`);
    if (entry.flags.length > 0) lines.push(`#, ${entry.flags.join(", ")}`);
    if (entry.msgctxt !== undefined) lines.push(wrapString("msgctxt", entry.msgctxt), "");
    lines.push(wrapString("msgid", entry.msgid));
    lines.push(wrapString("msgstr", entry.msgstr));
    const block = lines.join("\n");
    if (entry.obsolete)
      obsolete.push(
        block
          .split("\n")
          .map((line) => `#~ ${line}`)
          .join("\n"),
      );
    else blocks.push(block);
  }

  const sections = [header, ...blocks];
  if (obsolete.length > 0) sections.push(...obsolete);
  return `${sections.filter((section) => section.trim() !== "").join("\n\n")}\n`;
}

export function findEntry(catalog: PoCatalog, id: string): PoEntry | undefined {
  return catalog.entries.find((entry) => !entry.obsolete && catalogId(entry) === id);
}

export function createHeader(language: string) {
  return {
    "MIME-Version": "1.0",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Transfer-Encoding": "8bit",
    "X-Generator": "@lingui/cli",
    Language: language,
  };
}

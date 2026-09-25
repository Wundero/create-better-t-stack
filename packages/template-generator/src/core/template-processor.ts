import { type ProjectConfig, usesAlchemyManagedDatabase } from "@better-t-stack/types";
import Handlebars from "handlebars/runtime.js";
import isBinaryPath from "is-binary-path";

import { EMBEDDED_PARTIALS } from "../templates.generated";
import type { CompiledTemplate, TemplateEntry } from "./template-spec";

Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("ne", (a, b) => a !== b);
Handlebars.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
Handlebars.registerHelper("not", (a) => !a);
Handlebars.registerHelper("includes", (arr, val) => Array.isArray(arr) && arr.includes(val));
// Mirrors the sanitizers expo prebuild applies when it suggests identifiers.
const reservedAndroidSegments = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
  "true",
  "false",
  "null",
]);

function sanitizeAndroidPackage(value: string) {
  const output = value
    .replace(/[^a-zA-Z0-9_.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
  return (output || "app")
    .split(".")
    .map((segment) => {
      const valid = /^[a-zA-Z]/.test(segment) ? segment : `x${segment}`;
      return reservedAndroidSegments.has(valid) ? `x${valid}` : valid;
    })
    .join(".");
}

function sanitizeIosBundleIdentifier(value: string) {
  return value.replace(/(^[^a-zA-Z.-]|[^a-zA-Z0-9-.])/g, "-");
}

Handlebars.registerHelper("appId", (projectName: string, platform: "ios" | "android") => {
  const id = `com.anonymous.${projectName}`;
  return platform === "android" ? sanitizeAndroidPackage(id) : sanitizeIosBundleIdentifier(id);
});
Handlebars.registerHelper(
  "usesAlchemyDatabase",
  (backend, dbSetup, webDeploy, serverDeploy, dbSetupOptions) =>
    usesAlchemyManagedDatabase({ backend, dbSetup, webDeploy, serverDeploy, dbSetupOptions }),
);
Handlebars.registerHelper(
  "usesRequestScopedCloudflareEnv",
  (backend, webDeploy, frontend) =>
    backend === "self" &&
    webDeploy === "cloudflare" &&
    Array.isArray(frontend) &&
    (frontend.includes("nuxt") || frontend.includes("svelte")),
);

for (const [name, spec] of EMBEDDED_PARTIALS) {
  Handlebars.registerPartial(name, Handlebars.template(spec));
}

export function processTemplateString(spec: CompiledTemplate, context: ProjectConfig): string {
  return Handlebars.template(spec)(context);
}

export function isBinaryFile(filePath: string): boolean {
  return isBinaryPath(filePath);
}

export function transformFilename(filename: string): string {
  let result = filename.endsWith(".hbs") ? filename.slice(0, -4) : filename;

  const basename = result.split("/").pop() || result;
  if (basename === "_gitignore") result = result.replace(/_gitignore$/, ".gitignore");
  else if (basename === "_npmrc") result = result.replace(/_npmrc$/, ".npmrc");
  else if (basename === "_dockerignore") result = result.replace(/_dockerignore$/, ".dockerignore");
  else if (basename === "_vercelignore") result = result.replace(/_vercelignore$/, ".vercelignore");

  return result;
}

export function processFileContent(
  filePath: string,
  content: TemplateEntry,
  context: ProjectConfig,
): string {
  if (isBinaryFile(filePath)) return "[Binary file]";

  const originalPath = filePath.endsWith(".hbs") ? filePath : filePath + ".hbs";
  if (filePath !== originalPath || filePath.includes(".hbs")) {
    if (content.kind === "raw") return content.content;
    try {
      return processTemplateString(content, context);
    } catch (error) {
      console.warn(`Template processing failed for ${filePath}:`, error);
      return "";
    }
  }

  return content.kind === "raw" ? content.content : "";
}

export { Handlebars };

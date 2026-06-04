import type { ProjectConfig } from "@wundero/create-better-t-stack-types";
import Handlebars from "handlebars";
import isBinaryPath from "is-binary-path";

Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("ne", (a, b) => a !== b);
Handlebars.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
Handlebars.registerHelper("includes", (arr, val) => Array.isArray(arr) && arr.includes(val));
Handlebars.registerHelper("cfBinding", (cloudflare, binding) => {
  return Array.isArray(cloudflare?.bindings) && cloudflare.bindings.includes(binding);
});
Handlebars.registerHelper("hasCfPlatform", (cloudflare) => {
  return Boolean(
    cloudflare &&
    (cloudflare.hyperdrive === "postgres" ||
      (Array.isArray(cloudflare.bindings) && cloudflare.bindings.length > 0) ||
      cloudflare.email?.sender === "cloudflare"),
  );
});
Handlebars.registerHelper("themeVar", function (mode, token, defaultValue) {
  const themeStr = this.shadcnTheme;
  if (!themeStr) return defaultValue;
  try {
    const theme = JSON.parse(Buffer.from(themeStr, "base64").toString("utf-8"));
    if (theme && theme[mode] && theme[mode][token]) {
      return theme[mode][token];
    }
  } catch {}
  return defaultValue;
});
Handlebars.registerHelper("shadcnValue", function (property, defaultValue) {
  const themeStr = this.shadcnTheme;
  if (!themeStr) return defaultValue;
  try {
    const theme = JSON.parse(Buffer.from(themeStr, "base64").toString("utf-8"));
    if (theme && theme[property] !== undefined) {
      return theme[property];
    }
  } catch {}
  return defaultValue;
});

export function processTemplateString(content: string, context: ProjectConfig): string {
  return Handlebars.compile(content)(context);
}

export function isBinaryFile(filePath: string): boolean {
  return isBinaryPath(filePath);
}

export function transformFilename(filename: string): string {
  let result = filename.endsWith(".hbs") ? filename.slice(0, -4) : filename;

  const basename = result.split("/").pop() || result;
  if (basename === "_gitignore") result = result.replace(/_gitignore$/, ".gitignore");
  else if (basename === "_npmrc") result = result.replace(/_npmrc$/, ".npmrc");

  return result;
}

export function processFileContent(
  filePath: string,
  content: string,
  context: ProjectConfig,
): string {
  if (isBinaryFile(filePath)) return "[Binary file]";

  const originalPath = filePath.endsWith(".hbs") ? filePath : filePath + ".hbs";
  if (filePath !== originalPath || filePath.includes(".hbs")) {
    try {
      return processTemplateString(content, context);
    } catch (error) {
      console.warn(`Template processing failed for ${filePath}:`, error);
      return content;
    }
  }

  return content;
}

export { Handlebars };

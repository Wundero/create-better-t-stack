import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Handlebars from "handlebars";
import isBinaryPath from "is-binary-path";
import { glob } from "tinyglobby";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, "../templates");
const PARTIALS_DIR = path.join(__dirname, "../partials");
const OUTPUT_FILE = path.join(__dirname, "../src/templates.generated.ts");
const BINARY_OUTPUT_DIR = path.join(__dirname, "../templates-binary");

// Handlebars emits this fallback in every compiled program. Annotating it lets the generated file
// type-check under `strict`; the compiled function's own parameters receive `any` contextually.
const FALLBACK_SIGNATURE = "|| function(parent, propertyName) {";
const TYPED_FALLBACK_SIGNATURE = "|| function(parent: any, propertyName: any) {";

function escapeTemplateLiteral(content: string): string {
  return content.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Compiles a Handlebars source into an embedded spec object literal.
 *
 * Handlebars `compile()` emits code via `new Function`, which Cloudflare workerd forbids. Compiling
 * here, at build time in Node, and rendering the spec through `handlebars/runtime` keeps the
 * request path eval-free.
 */
function precompileEntryBody(source: string): string {
  const spec = Handlebars.precompile(source);
  const typed = spec.replaceAll(FALLBACK_SIGNATURE, TYPED_FALLBACK_SIGNATURE);
  return `{ kind: "template", ${typed.slice(1)}`;
}

async function generateTemplates() {
  console.log("📦 Generating embedded templates...");

  const files = await glob("**/*", { cwd: TEMPLATES_DIR, dot: true, onlyFiles: true });

  // Sort files alphabetically for deterministic output (minimizes git diffs)
  files.sort((a, b) => a.localeCompare(b));

  console.log(`📂 Found ${files.length} template files`);

  const entries: string[] = [];
  const binaryFiles: string[] = [];

  for (const file of files) {
    const fullPath = path.join(TEMPLATES_DIR, file);
    const normalizedPath = file.replace(/\\/g, "/");

    if (isBinaryPath(file)) {
      binaryFiles.push(normalizedPath);
      entries.push(`  ["${normalizedPath}", { kind: "raw", content: \`[Binary file]\` }]`);
    } else {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (normalizedPath.endsWith(".hbs")) {
        entries.push(`  ["${normalizedPath}", ${precompileEntryBody(content)}]`);
      } else {
        entries.push(
          `  ["${normalizedPath}", { kind: "raw", content: \`${escapeTemplateLiteral(content)}\` }]`,
        );
      }
    }
  }

  const partialSource = fs.readFileSync(path.join(PARTIALS_DIR, "getServerUrl.hbs"), "utf-8");
  const partialEntries = [
    `  ["getServerUrl", ${precompileEntryBody(partialSource)}]`,
    `  ["getServerUrlSpaces", ${precompileEntryBody(partialSource.replaceAll("\t", "  "))}]`,
  ];

  const output = `// Auto-generated - DO NOT EDIT
// Run 'bun run generate-templates' to regenerate

import type { CompiledTemplate, TemplateEntry } from "./core/template-spec";

const RAW_TEMPLATE_ENTRIES: ReadonlyArray<readonly [string, TemplateEntry]> = [
${entries.join(",\n")}
];

const RAW_PARTIAL_ENTRIES: ReadonlyArray<readonly [string, CompiledTemplate]> = [
${partialEntries.join(",\n")}
];

export const EMBEDDED_TEMPLATES: Map<string, TemplateEntry> = new Map(RAW_TEMPLATE_ENTRIES);

export const EMBEDDED_PARTIALS: Map<string, CompiledTemplate> = new Map(RAW_PARTIAL_ENTRIES);

export const TEMPLATE_COUNT = ${files.length};
`;

  fs.writeFileSync(OUTPUT_FILE, output);

  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`📊 File size: ${sizeMB} MB (${files.length} templates)`);

  await copyBinaryFiles(binaryFiles);
}

async function copyBinaryFiles(binaryFiles: string[]) {
  // Sort for deterministic output
  binaryFiles.sort((a, b) => a.localeCompare(b));

  console.log(`\n📁 Copying ${binaryFiles.length} binary files to templates-binary/...`);

  if (fs.existsSync(BINARY_OUTPUT_DIR)) {
    fs.rmSync(BINARY_OUTPUT_DIR, { recursive: true });
  }

  let totalSize = 0;

  for (const file of binaryFiles) {
    const srcPath = path.join(TEMPLATES_DIR, file);
    const destPath = path.join(BINARY_OUTPUT_DIR, file);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    fs.copyFileSync(srcPath, destPath);

    totalSize += fs.statSync(destPath).size;
  }

  const sizeKB = (totalSize / 1024).toFixed(2);
  console.log(`✅ Copied ${binaryFiles.length} binary files (${sizeKB} KB)`);
}

generateTemplates().catch((err) => {
  console.error("❌ Failed to generate templates:", err);
  process.exit(1);
});

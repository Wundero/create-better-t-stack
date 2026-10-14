import type { ProjectConfig } from "@better-t-stack/types";
import { Node, Project, SyntaxKind, type JsxElement, type SourceFile } from "ts-morph";

import type { VirtualFileSystem } from "../../../core/virtual-fs";

const DEMO_COMPONENT = "I18nDemo";

function createSourceFile(path: string, content: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(path, content);
}

function unwrap(expression: Node | undefined): Node | undefined {
  return expression && Node.isParenthesizedExpression(expression)
    ? expression.getExpression()
    : expression;
}

function rootJsxOf(sourceFile: SourceFile): JsxElement | undefined {
  const functions = sourceFile.getFunctions();
  const ordered = [...functions.filter((fn) => fn.isDefaultExport()), ...functions];

  for (const fn of ordered) {
    const body = fn.getBody();
    if (!body || !Node.isBlock(body)) continue;

    for (const statement of body.getStatements()) {
      if (!Node.isReturnStatement(statement)) continue;
      const element = unwrap(statement.getExpression())?.asKind(SyntaxKind.JsxElement);
      if (element) return element;
    }
  }

  return undefined;
}

function addNamedImport(sourceFile: SourceFile, name: string, moduleSpecifier: string): boolean {
  if (
    sourceFile
      .getImportDeclarations()
      .some((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier)
  ) {
    return true;
  }

  sourceFile.addImportDeclaration({ namedImports: [name], moduleSpecifier });
  return true;
}

function insertJsxDemo(vfs: VirtualFileSystem, pagePath: string, importPath: string): void {
  const content = vfs.readFile(pagePath);
  if (content === undefined || content.includes(`<${DEMO_COMPONENT}`)) return;

  const sourceFile = createSourceFile(pagePath, content);
  const root = rootJsxOf(sourceFile);
  if (!root) return;

  addNamedImport(sourceFile, DEMO_COMPONENT, importPath);
  const children = root
    .getJsxChildren()
    .map((child) => child.getFullText())
    .join("");
  root.setBodyText(`${children}\n<${DEMO_COMPONENT} />`);

  vfs.writeFile(pagePath, sourceFile.getFullText());
}

/**
 * Inserts `insertion` after `anchor` only when the anchor appears exactly once,
 * so a user-modified or restructured template is left untouched instead of
 * being corrupted (the D9 `anchored-insert` rule).
 */
function insertAfterOnce(content: string, anchor: string, insertion: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;

  const end = index + anchor.length;
  return `${content.slice(0, end)}\n${insertion}${content.slice(end)}`;
}

function insertBeforeOnce(content: string, anchor: string, insertion: string): string | undefined {
  const index = content.indexOf(anchor);
  if (index === -1) return undefined;
  if (content.indexOf(anchor, index + anchor.length) !== -1) return undefined;

  return `${content.slice(0, index)}${insertion}${content.slice(index)}`;
}

/** Renders the demo on the Next.js home page. */
export function insertNextDemo(vfs: VirtualFileSystem): void {
  insertJsxDemo(vfs, "apps/web/src/app/page.tsx", "@/components/i18n-demo");
}

/** Renders the demo on a Vite + React home route. */
export function insertViteReactDemo(vfs: VirtualFileSystem, pagePath: string): void {
  insertJsxDemo(vfs, pagePath, "@/components/i18n-demo");
}

/** Renders the demo on the Solid home route. */
export function insertSolidDemo(vfs: VirtualFileSystem): void {
  insertJsxDemo(vfs, "apps/web/src/routes/index.tsx", "~/components/i18n-demo");
}

/** Renders the demo on the Expo drawer home screen. */
export function insertReactNativeDemo(vfs: VirtualFileSystem): void {
  insertJsxDemo(vfs, "apps/native/app/(drawer)/index.tsx", "@/components/i18n-demo");
}

/** Renders the auto-imported demo component on the Nuxt home page. */
export function insertNuxtDemo(vfs: VirtualFileSystem): void {
  const pagePath = "apps/web/app/pages/index.vue";
  const content = vfs.readFile(pagePath);
  if (content === undefined || content.includes(`<${DEMO_COMPONENT}`)) return;

  const updated = insertAfterOnce(
    content,
    '<div class="grid gap-6 mt-6">',
    `      <${DEMO_COMPONENT} />`,
  );
  if (updated) vfs.writeFile(pagePath, updated);
}

/** Renders the demo component on the SvelteKit home page. */
export function insertSvelteDemo(vfs: VirtualFileSystem): void {
  const pagePath = "apps/web/src/routes/+page.svelte";
  const content = vfs.readFile(pagePath);
  if (content === undefined || content.includes(DEMO_COMPONENT)) return;

  let updated = insertAfterOnce(
    content,
    '<script lang="ts">',
    `\timport ${DEMO_COMPONENT} from "$lib/components/i18n-demo.svelte";`,
  );
  if (!updated) return;

  updated = insertAfterOnce(updated, '<div class="grid gap-6">', `\t<${DEMO_COMPONENT} />`);
  if (updated) vfs.writeFile(pagePath, updated);
}

/** Renders the demo component on the Astro home page. */
export function insertAstroDemo(vfs: VirtualFileSystem): void {
  const pagePath = "apps/web/src/pages/index.astro";
  const content = vfs.readFile(pagePath);
  if (content === undefined || content.includes(DEMO_COMPONENT)) return;

  let updated = insertAfterOnce(
    content,
    'import Layout from "../layouts/Layout.astro";',
    `import ${DEMO_COMPONENT} from "../components/I18nDemo.astro";`,
  );
  if (!updated) return;

  updated = insertAfterOnce(updated, '    <div class="grid gap-6">', `      <${DEMO_COMPONENT} />`);
  if (updated) vfs.writeFile(pagePath, updated);
}

const NITRO_ROUTE = `import { defineHandler } from "nitro";

import { renderI18nDemo } from "../../src/utils/i18n-demo";

export default defineHandler(() => renderI18nDemo());
`;

function wireServerEntry(vfs: VirtualFileSystem, routeBlock: string, anchor: string): void {
  const path = "apps/server/src/index.ts";
  const content = vfs.readFile(path);
  if (content === undefined || content.includes("i18n-demo")) return;

  const sourceFile = createSourceFile(path, content);
  addNamedImport(sourceFile, "renderI18nDemo", "./utils/i18n-demo");
  const withImport = sourceFile.getFullText();

  const updated = insertBeforeOnce(withImport, anchor, routeBlock);
  if (updated) vfs.writeFile(path, updated);
}

/** Mounts the demo endpoint in the selected backend's native idiom. */
export function wireServerRoutes(vfs: VirtualFileSystem, backend: ProjectConfig["backend"]): void {
  switch (backend) {
    case "nitro": {
      const path = "apps/server/server/routes/i18n-demo.get.ts";
      if (!vfs.exists("apps/server/nitro.config.ts") || vfs.exists(path)) return;
      vfs.writeFile(path, NITRO_ROUTE);
      return;
    }
    case "hono":
      wireServerEntry(
        vfs,
        'app.get("/i18n-demo", (c) => c.json(renderI18nDemo()));\n\n',
        'app.get("/", (c) => {',
      );
      return;
    case "express":
      wireServerEntry(
        vfs,
        'app.get("/i18n-demo", (_req, res) => {\n\tres.status(200).json(renderI18nDemo());\n});\n\n',
        'app.get("/", (_req, res) => {',
      );
      return;
    case "fastify":
      wireServerEntry(
        vfs,
        'fastify.get("/i18n-demo", async () => {\n\treturn renderI18nDemo();\n});\n\n',
        "fastify.get('/', async () => {",
      );
      return;
    case "elysia":
      wireServerEntry(
        vfs,
        '\t.get("/i18n-demo", () => renderI18nDemo())\n',
        '\t.get("/", () => "OK")',
      );
      return;
    default:
      return;
  }
}

/** Logs the host demo from the Electrobun Bun main process. */
export function wireElectrobunHost(vfs: VirtualFileSystem): void {
  const path = "apps/desktop/src/bun/index.ts";
  const content = vfs.readFile(path);
  if (content === undefined || content.includes("i18n-demo")) return;

  const sourceFile = createSourceFile(path, content);
  addNamedImport(sourceFile, "renderI18nDemo", "./i18n-demo");

  const usage =
    "const i18nDemo = renderI18nDemo();\nconsole.log(`${i18nDemo.heading} — ${i18nDemo.plural}`);\n\n";
  const updated = insertBeforeOnce(sourceFile.getFullText(), "new BrowserWindow({", usage);
  if (updated) vfs.writeFile(path, updated);
}

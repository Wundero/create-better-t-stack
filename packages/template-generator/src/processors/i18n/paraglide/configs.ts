import { Node, Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";

import type { VirtualFileSystem } from "../../../core/virtual-fs";

const PARAGLIDE_PACKAGE = "@inlang/paraglide-js";

function createSourceFile(path: string, content: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(path, content);
}

function ensureParaglideImport(sourceFile: SourceFile, namedImport: string): void {
  if (
    sourceFile
      .getImportDeclarations()
      .some((declaration) => declaration.getModuleSpecifierValue() === PARAGLIDE_PACKAGE)
  ) {
    return;
  }

  sourceFile.addImportDeclaration({
    namedImports: [namedImport],
    moduleSpecifier: PARAGLIDE_PACKAGE,
  });
}

function paraglideViteCall(project: string, outdir: string): string {
  return `paraglideVitePlugin({\n  project: ${JSON.stringify(project)},\n  outdir: ${JSON.stringify(outdir)},\n})`;
}

// Vite accepts an object or a callback returning one; only inspect returns that
// belong to the config callback, not nested helper functions (same shape as
// `processPwaPlugins`).
function getConfigObjects(node: Node): ObjectLiteralExpression[] {
  if (Node.isParenthesizedExpression(node)) return getConfigObjects(node.getExpression());
  if (Node.isObjectLiteralExpression(node)) return [node];
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const body = node.getBody();
    if (!Node.isBlock(body)) return getConfigObjects(body);
    return body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .filter(
        (statement) =>
          statement.getFirstAncestor(
            (ancestor) =>
              Node.isFunctionLikeDeclaration(ancestor) ||
              Node.isFunctionExpression(ancestor) ||
              Node.isArrowFunction(ancestor),
          ) === node,
      )
      .flatMap((statement) => {
        const expression = statement.getExpression();
        return expression ? getConfigObjects(expression) : [];
      });
  }
  return [];
}

function findConfigObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  const assignment = sourceFile.getExportAssignment((declaration) => !declaration.isExportEquals());
  const expression = assignment?.getExpression();

  if (expression && Node.isCallExpression(expression)) {
    const [argument] = expression.getArguments();
    const objects = argument ? getConfigObjects(argument) : [];
    if (objects.length > 0) return objects[0];
  }

  // Next.js: `const nextConfig: NextConfig = { … }; export default withVarlock(nextConfig);`
  const variable = sourceFile.getVariableDeclaration("nextConfig");
  return variable?.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
}

function addToPlugins(object: ObjectLiteralExpression, pluginCall: string): void {
  const plugins = object.getProperty("plugins");

  if (plugins && Node.isPropertyAssignment(plugins)) {
    const initializer = plugins.getInitializer();
    if (initializer && Node.isArrayLiteralExpression(initializer)) {
      const alreadyAdded = initializer
        .getElements()
        .some((element) => element.getText().includes("paraglide"));
      if (!alreadyAdded) initializer.addElement(pluginCall);
    }
    return;
  }

  if (!plugins) {
    object.addPropertyAssignment({ name: "plugins", initializer: `[${pluginCall}]` });
  }
}

/** Adds `paraglideVitePlugin` to the `plugins` array of a Vite config. */
export function wireViteConfig(
  vfs: VirtualFileSystem,
  path: string,
  project: string,
  outdir: string,
): void {
  const content = vfs.readFile(path);
  if (content === undefined || content.includes("paraglideVitePlugin")) return;

  const sourceFile = createSourceFile(path, content);
  const configObject = findConfigObject(sourceFile);
  if (!configObject) return;

  ensureParaglideImport(sourceFile, "paraglideVitePlugin");
  addToPlugins(configObject, paraglideViteCall(project, outdir));
  vfs.writeFile(path, sourceFile.getFullText());
}

function addToVitePlugins(object: ObjectLiteralExpression, pluginCall: string): void {
  const vite = object.getProperty("vite");

  if (!vite) {
    object.addPropertyAssignment({
      name: "vite",
      initializer: `{\n  plugins: [${pluginCall}],\n}`,
    });
    return;
  }

  if (!Node.isPropertyAssignment(vite)) return;
  const initializer = vite.getInitializer();
  if (initializer && Node.isObjectLiteralExpression(initializer)) {
    addToPlugins(initializer, pluginCall);
  }
}

/** Adds `paraglideVitePlugin` to `vite.plugins` in `nuxt.config.ts`. */
export function wireNuxtConfig(
  vfs: VirtualFileSystem,
  path: string,
  project: string,
  outdir: string,
): void {
  const content = vfs.readFile(path);
  if (content === undefined || content.includes("paraglideVitePlugin")) return;

  const sourceFile = createSourceFile(path, content);
  const configObject = findConfigObject(sourceFile);
  if (!configObject) return;

  ensureParaglideImport(sourceFile, "paraglideVitePlugin");
  addToVitePlugins(configObject, paraglideViteCall(project, outdir));
  vfs.writeFile(path, sourceFile.getFullText());
}

/** Adds `paraglideVitePlugin` to `vite.plugins` in `astro.config.mjs`. */
export function wireAstroConfig(
  vfs: VirtualFileSystem,
  path: string,
  project: string,
  outdir: string,
): void {
  wireNuxtConfig(vfs, path, project, outdir);
}

/** Wraps `nextConfig` with the Paraglide webpack plugin. */
export function wireNextConfig(vfs: VirtualFileSystem, path: string, project: string): void {
  const content = vfs.readFile(path);
  if (content === undefined || content.includes("paraglideWebpackPlugin")) return;

  const sourceFile = createSourceFile(path, content);
  const configObject = findConfigObject(sourceFile);
  if (!configObject) return;

  const outdir = "./src/paraglide";
  ensureParaglideImport(sourceFile, "paraglideWebpackPlugin");
  configObject.addMethod({
    name: "webpack",
    parameters: [{ name: "config" }],
    statements: [
      `config.plugins.push(paraglideWebpackPlugin({\n  project: ${JSON.stringify(project)},\n  outdir: ${JSON.stringify(outdir)},\n}));`,
      "return config;",
    ],
  });

  vfs.writeFile(path, sourceFile.getFullText());
}

/**
 * Ignore patterns for the compiled output: the root `.gitignore` gets one
 * entry per app (the outdir also emits its own `.gitignore`), and `biome.json`
 * skips the generated directories when the Biome addon is selected.
 */
export function writeIgnorePatterns(vfs: VirtualFileSystem, appOutdir: string | undefined): void {
  const path = ".gitignore";
  const content = vfs.readFile(path) ?? "";
  const lines = content.split("\n");

  const entries = ["packages/i18n/src/paraglide", appOutdir].filter(
    (entry): entry is string => entry !== undefined && !lines.includes(entry),
  );

  if (entries.length > 0) {
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    vfs.writeFile(
      path,
      `${content}${separator}\n# i18n (Paraglide compiled output)\n${entries.join("\n")}\n`,
    );
  }

  const biomePath = "biome.json";
  const biome = vfs.readFile(biomePath);
  if (biome === undefined || biome.includes("!**/paraglide")) return;

  const anchor = '"!**/convex/_generated"';
  const occurrences = biome.split(anchor).length - 1;
  if (occurrences !== 1) return;

  vfs.writeFile(biomePath, biome.replace(anchor, `${anchor},\n\t\t\t"!**/paraglide"`));
}

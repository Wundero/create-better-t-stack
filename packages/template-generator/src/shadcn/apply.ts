import type { ProjectConfig } from "@better-t-stack/types";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { JsxAttributeLike, JsxElement, JsxSelfClosingElement, SourceFile } from "ts-morph";

import type { JsonObject, JsonValue } from "../core/json-types";
import type { VirtualFileSystem } from "../core/virtual-fs";
import { composeComponentsJson } from "./components-json";
import { composeGlobalsCss } from "./globals";
import { iconLibraryImports, renderIconUsage } from "./icons";
import { composeUiPackageJsonDependencies } from "./package-json";
import type { ResolvedShadcnTheme } from "./resolve";
import { isJsonObject, isJsonString, type ShadcnIconLibrary } from "./types";

/** The create-app module that exports the placeholder component to strip out. */
export const ICON_PLACEHOLDER_MODULE = "@/app/(create)/components/icon-placeholder";

/** The placeholder component tag the registry emits for icon substitution. */
export const ICON_PLACEHOLDER_TAG = "IconPlaceholder";

/**
 * Target aliases from the generated `components.json`. Registry sources are
 * authored against `@/registry/<slug>/...` and are rewritten onto these.
 */
export interface ComponentAliases {
  components: string;
  ui: string;
  utils: string;
  hooks: string;
  lib: string;
}

export interface TransformComponentSourceOptions {
  aliases: ComponentAliases;
  iconLibrary: ShadcnIconLibrary;
}

/** `@/registry/<slug>/(ui|hooks|lib|components)/<name>` */
const REGISTRY_SPECIFIER = /^@\/registry\/[^/]+\/(ui|hooks|lib|components)\/([^/]+)$/;

const ICON_PROP_NAMES: readonly ShadcnIconLibrary[] = [
  "lucide",
  "tabler",
  "hugeicons",
  "phosphor",
  "remixicon",
];

type IconPlaceholderElement = JsxSelfClosingElement | JsxElement;

function isIconPropName(name: string): boolean {
  return ICON_PROP_NAMES.some((candidate) => candidate === name);
}

function aliasedSpecifier(
  aliases: ComponentAliases,
  section: string,
  itemName: string,
): string | undefined {
  switch (section) {
    case "ui":
      return `${aliases.ui}/${itemName}`;
    case "hooks":
      return `${aliases.hooks}/${itemName}`;
    case "lib":
      return `${aliases.lib}/${itemName}`;
    case "components":
      return `${aliases.components}/${itemName}`;
    default:
      return undefined;
  }
}

function rewriteImportSpecifiers(sourceFile: SourceFile, aliases: ComponentAliases): void {
  for (const declaration of sourceFile.getImportDeclarations()) {
    const current = declaration.getModuleSpecifierValue();
    const match = REGISTRY_SPECIFIER.exec(current);
    if (match === null) continue;
    const section = match[1];
    const itemName = match[2];
    if (section === undefined || itemName === undefined) continue;
    const rewritten = aliasedSpecifier(aliases, section, itemName);
    if (rewritten !== undefined && rewritten !== current) {
      declaration.setModuleSpecifier(rewritten);
    }
  }
}

function removeIconPlaceholderImports(sourceFile: SourceFile): void {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() === ICON_PLACEHOLDER_MODULE) {
      declaration.remove();
    }
  }
}

function placeholderAttributes(element: IconPlaceholderElement): readonly JsxAttributeLike[] {
  return Node.isJsxSelfClosingElement(element)
    ? element.getAttributes()
    : element.getOpeningElement().getAttributes();
}

function isIconPlaceholderElement(element: IconPlaceholderElement): boolean {
  const tagName = Node.isJsxSelfClosingElement(element)
    ? element.getTagNameNode()
    : element.getOpeningElement().getTagNameNode();
  return tagName.getText() === ICON_PLACEHOLDER_TAG;
}

interface CollectedIconProps {
  readonly iconName: string | undefined;
  readonly preservedAttributes: readonly string[];
}

function collectIconProps(
  attributes: readonly JsxAttributeLike[],
  library: ShadcnIconLibrary,
): CollectedIconProps {
  let iconName: string | undefined;
  const preservedAttributes: string[] = [];

  for (const attribute of attributes) {
    if (!Node.isJsxAttribute(attribute)) {
      preservedAttributes.push(attribute.getText());
      continue;
    }
    const name = attribute.getNameNode().getText();
    if (!isIconPropName(name)) {
      preservedAttributes.push(attribute.getText());
      continue;
    }
    if (name !== library) continue;
    const initializer = attribute.getInitializer();
    if (initializer !== undefined && Node.isStringLiteral(initializer)) {
      iconName = initializer.getLiteralValue();
    }
  }

  return { iconName, preservedAttributes };
}

function findIconPlaceholders(sourceFile: SourceFile): IconPlaceholderElement[] {
  const selfClosing = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    .filter((element) => isIconPlaceholderElement(element));
  const containers = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter((element) => isIconPlaceholderElement(element));
  return [...selfClosing, ...containers];
}

function transformIconPlaceholders(
  sourceFile: SourceFile,
  library: ShadcnIconLibrary,
): readonly string[] {
  const usedIconNames: string[] = [];
  for (const element of findIconPlaceholders(sourceFile)) {
    const { iconName, preservedAttributes } = collectIconProps(
      placeholderAttributes(element),
      library,
    );
    if (iconName === undefined || iconName.length === 0) {
      throw new Error(`IconPlaceholder is missing the "${library}" icon name`);
    }
    if (!usedIconNames.includes(iconName)) usedIconNames.push(iconName);
    element.replaceWithText(renderIconUsage(library, iconName, preservedAttributes));
  }
  return usedIconNames;
}

function addIconImports(
  sourceFile: SourceFile,
  library: ShadcnIconLibrary,
  iconNames: readonly string[],
): void {
  if (iconNames.length === 0) return;
  for (const iconImport of iconLibraryImports(library, iconNames)) {
    if (iconImport.namedImports.length === 0) continue;
    sourceFile.addImportDeclaration({
      moduleSpecifier: iconImport.moduleSpecifier,
      namedImports: [...iconImport.namedImports],
    });
  }
}

/**
 * Rewrites a registry component source into project-local source: registry
 * sibling imports are re-pointed at project aliases, every `IconPlaceholder` is
 * replaced by the configured library's icon usage, the placeholder import is
 * dropped, and the required icon imports are inserted. Unmanaged imports,
 * directives (`"use client"`) and all other content are preserved.
 */
export function transformComponentSource(
  content: string,
  options: TransformComponentSourceOptions,
): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("component.tsx", content);

  rewriteImportSpecifiers(sourceFile, options.aliases);
  removeIconPlaceholderImports(sourceFile);
  const usedIconNames = transformIconPlaceholders(sourceFile, options.iconLibrary);
  addIconImports(sourceFile, options.iconLibrary, usedIconNames);

  return sourceFile.getFullText();
}

function readStringRecord(value: JsonValue | undefined) {
  const record: Record<string, string> = {};
  if (!isJsonObject(value)) return record;
  for (const [key, entry] of Object.entries(value)) {
    if (isJsonString(entry)) record[key] = entry;
  }
  return record;
}

function applyWebComponentsJsonOverride(
  vfs: VirtualFileSystem,
  resolved: ResolvedShadcnTheme,
): void {
  const webComponentsJson = vfs.readJson<JsonObject>("apps/web/components.json");
  if (webComponentsJson === undefined) return;

  const baseConfig = resolved.base.config;
  webComponentsJson.style = baseConfig.style;
  webComponentsJson.iconLibrary = baseConfig.iconLibrary;
  webComponentsJson.menuColor = baseConfig.menuColor;
  webComponentsJson.menuAccent = baseConfig.menuAccent;

  const tailwind = webComponentsJson.tailwind;
  if (isJsonObject(tailwind)) {
    tailwind.baseColor = baseConfig.tailwind.baseColor;
  }

  if (baseConfig.rtl) {
    webComponentsJson.rtl = true;
  } else {
    delete webComponentsJson.rtl;
  }

  vfs.writeJson("apps/web/components.json", webComponentsJson);
}

/**
 * Materializes a resolved shadcn theme into the generated project tree: the ui
 * package config, globals css, transformed components, util source, ui
 * package.json dependencies, and the web app's design fields. The ui package
 * handler owns this single application so no file is written twice.
 */
export function applyShadcnThemeToVfs(
  vfs: VirtualFileSystem,
  config: ProjectConfig,
  resolved: ResolvedShadcnTheme,
): void {
  const rsc = config.frontend.includes("next");
  vfs.writeJson("packages/ui/components.json", composeComponentsJson(resolved.base, config, rsc));

  vfs.writeFile(
    "packages/ui/src/styles/globals.css",
    composeGlobalsCss({
      cssVars: resolved.base.cssVars,
      css: resolved.base.css,
      fonts: [...resolved.fonts],
      pointer: resolved.pointer,
    }),
  );

  for (const [name, content] of resolved.components) {
    vfs.writeFile(`packages/ui/src/components/${name}.tsx`, content);
  }

  vfs.writeFile("packages/ui/src/lib/utils.ts", resolved.utilsSource);

  if (resolved.directionSource !== undefined) {
    vfs.writeFile("packages/ui/src/components/direction.tsx", resolved.directionSource);
  }

  const uiPackageJson = vfs.readJson<JsonObject>("packages/ui/package.json");
  if (uiPackageJson !== undefined) {
    const next = composeUiPackageJsonDependencies(
      readStringRecord(uiPackageJson.dependencies),
      resolved,
    );
    uiPackageJson.dependencies = next.deps;
    vfs.writeJson("packages/ui/package.json", uiPackageJson);
  }

  applyWebComponentsJsonOverride(vfs, resolved);
}

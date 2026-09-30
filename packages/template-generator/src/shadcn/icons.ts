import type { ShadcnIconLibrary } from "./types";

/**
 * A single import declaration the transform must add when a component uses an
 * icon from a given library. `namedImports` are the identifiers pulled from
 * `moduleSpecifier` (icon glyphs or the library's wrapper component).
 */
export interface IconLibraryImport {
  readonly moduleSpecifier: string;
  readonly namedImports: readonly string[];
}

/**
 * Everything the transform needs to know about one icon library: the npm
 * packages it pulls in, how to render an icon usage, and the import
 * declarations to add for the icons actually used by a component.
 */
export interface IconLibraryDefinition {
  readonly id: ShadcnIconLibrary;
  readonly packages: readonly string[];
  renderUsage(iconName: string, attributes: readonly string[]): string;
  importDeclarations(iconNames: readonly string[]): readonly IconLibraryImport[];
}

function renderAttributes(attributes: readonly string[]): string {
  return attributes.length === 0 ? "" : ` ${attributes.join(" ")}`;
}

const LUCIDE_MODULE = "lucide-react";
const TABLER_MODULE = "@tabler/icons-react";
const HUGEICONS_REACT_MODULE = "@hugeicons/react";
const HUGEICONS_ICONS_MODULE = "@hugeicons/core-free-icons";
const PHOSPHOR_MODULE = "@phosphor-icons/react";
const REMIXICON_MODULE = "@remixicon/react";

const HUGEICONS_WRAPPER = "HugeiconsIcon";

/**
 * The five icon libraries the shadcn registry substitutes into its
 * `IconPlaceholder` elements. The table is exhaustive over `ShadcnIconLibrary`
 * and each entry renders the same shape the shadcn core icon table produces.
 */
const ICON_LIBRARIES = {
  lucide: {
    id: "lucide",
    packages: [LUCIDE_MODULE],
    renderUsage: (iconName, attributes) => `<${iconName}${renderAttributes(attributes)} />`,
    importDeclarations: (iconNames) => [
      { moduleSpecifier: LUCIDE_MODULE, namedImports: iconNames },
    ],
  },
  tabler: {
    id: "tabler",
    packages: [TABLER_MODULE],
    renderUsage: (iconName, attributes) => `<${iconName}${renderAttributes(attributes)} />`,
    importDeclarations: (iconNames) => [
      { moduleSpecifier: TABLER_MODULE, namedImports: iconNames },
    ],
  },
  hugeicons: {
    id: "hugeicons",
    packages: [HUGEICONS_REACT_MODULE, HUGEICONS_ICONS_MODULE],
    renderUsage: (iconName, attributes) =>
      `<${HUGEICONS_WRAPPER} icon={${iconName}} strokeWidth={2}${renderAttributes(attributes)} />`,
    importDeclarations: (iconNames) => [
      { moduleSpecifier: HUGEICONS_REACT_MODULE, namedImports: [HUGEICONS_WRAPPER] },
      { moduleSpecifier: HUGEICONS_ICONS_MODULE, namedImports: iconNames },
    ],
  },
  phosphor: {
    id: "phosphor",
    packages: [PHOSPHOR_MODULE],
    renderUsage: (iconName, attributes) =>
      `<${iconName} strokeWidth={2}${renderAttributes(attributes)} />`,
    importDeclarations: (iconNames) => [
      { moduleSpecifier: PHOSPHOR_MODULE, namedImports: iconNames },
    ],
  },
  remixicon: {
    id: "remixicon",
    packages: [REMIXICON_MODULE],
    renderUsage: (iconName, attributes) => `<${iconName}${renderAttributes(attributes)} />`,
    importDeclarations: (iconNames) => [
      { moduleSpecifier: REMIXICON_MODULE, namedImports: iconNames },
    ],
  },
} satisfies Record<ShadcnIconLibrary, IconLibraryDefinition>;

/** Returns the full definition for one icon library. */
export function getIconLibrary(library: ShadcnIconLibrary): IconLibraryDefinition {
  return ICON_LIBRARIES[library];
}

/** Returns the npm packages that must be installed for one icon library. */
export function iconLibraryPackages(library: ShadcnIconLibrary): readonly string[] {
  return getIconLibrary(library).packages;
}

/** Renders a single icon usage, preserving any extra serialized attributes. */
export function renderIconUsage(
  library: ShadcnIconLibrary,
  iconName: string,
  attributes: readonly string[] = [],
): string {
  return getIconLibrary(library).renderUsage(iconName, attributes);
}

/** Returns the import declarations to add for the used icon names. */
export function iconLibraryImports(
  library: ShadcnIconLibrary,
  iconNames: readonly string[],
): readonly IconLibraryImport[] {
  return getIconLibrary(library).importDeclarations(iconNames);
}

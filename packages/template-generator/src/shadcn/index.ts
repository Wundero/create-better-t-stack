export {
  createHttpShadcnRegistryClient,
  SHADCN_ACCEPT_HEADER,
  type CreateHttpShadcnRegistryClientOptions,
  type FetchLike,
} from "./client";
export { buildInitUrl, buildStyleItemUrl, styleSlug } from "./url";
export {
  getIconLibrary,
  iconLibraryImports,
  iconLibraryPackages,
  renderIconUsage,
  type IconLibraryDefinition,
  type IconLibraryImport,
} from "./icons";
export {
  componentDependencyNames,
  resolveComponentClosure,
  SHADCN_RTL_COMPONENT,
  SHADCN_UI_COMPONENTS,
  type ShadcnUiComponent,
} from "./components";
export {
  resolveShadcnDependencyVersion,
  SHADCN_BASE_PACKAGE,
  SHADCN_DEPENDENCY_VERSIONS,
} from "./dependency-versions";
export {
  transformComponentSource,
  applyShadcnThemeToVfs,
  ICON_PLACEHOLDER_MODULE,
  ICON_PLACEHOLDER_TAG,
  type ComponentAliases,
  type TransformComponentSourceOptions,
} from "./apply";
export { composeComponentsJson, shadcnAliases } from "./components-json";
export type { GenerationContext } from "./context";
export { composeUiPackageJsonDependencies, type UiPackageDependencies } from "./package-json";
export { resolveShadcnTheme, type ResolvedShadcnTheme } from "./resolve";
export {
  ShadcnRegistryError,
  isRegistryBase,
  isRegistryFontItem,
  isRegistryItem,
  type RegistryBase,
  type RegistryBaseConfig,
  type RegistryCss,
  type RegistryCssVars,
  type RegistryFile,
  type RegistryFont,
  type RegistryFontItem,
  type RegistryItem,
  type RegistryItemMeta,
  type RegistryItemType,
  type ResolveBaseInput,
  type ShadcnBase,
  type ShadcnBaseColor,
  type ShadcnIconLibrary,
  type ShadcnMenuAccent,
  type ShadcnMenuColor,
  type ShadcnRadius,
  type ShadcnRegistryClient,
  type ShadcnStyle,
  type ShadcnTheme,
} from "./types";

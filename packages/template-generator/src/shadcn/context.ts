import type { ResolvedShadcnTheme } from "./resolve";

/**
 * Per-generation context threaded through the template handlers. It carries the
 * pre-resolved shadcn theme (if any) so package and frontend handlers can apply
 * it to the virtual file system without re-doing registry work.
 */
export interface GenerationContext {
  readonly shadcn?: ResolvedShadcnTheme;
}

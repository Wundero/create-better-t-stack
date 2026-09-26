import { Result } from "better-result";

import { ShadcnRegistryError, type RegistryItem, type ShadcnRegistryClient } from "./types";

/**
 * The canonical shadcn UI components the generator ships for every style. The
 * registry exposes more, but these are the ones templates reference directly.
 */
export const SHADCN_UI_COMPONENTS = [
  "attachment",
  "bubble",
  "button",
  "card",
  "checkbox",
  "dropdown-menu",
  "empty",
  "input",
  "input-group",
  "label",
  "marker",
  "message",
  "message-scroller",
  "skeleton",
  "sonner",
  "textarea",
  "tooltip",
] as const;

export type ShadcnUiComponent = (typeof SHADCN_UI_COMPONENTS)[number];

/** The RTL direction wrapper item, required when a generated project needs RTL. */
export const SHADCN_RTL_COMPONENT = "direction";

function isNonComponentDependency(name: string): boolean {
  return name === "utils" || name.startsWith("font-");
}

/**
 * Returns the component names a registry item depends on, in first-seen order.
 * Utility (`utils`) and font (`font-*`, `font-heading-*`) dependencies are not
 * components and are excluded; duplicates collapse.
 */
export function componentDependencyNames(item: RegistryItem): string[] {
  const dependencies = item.registryDependencies ?? [];
  const names: string[] = [];
  for (const dependency of dependencies) {
    if (isNonComponentDependency(dependency)) continue;
    if (names.includes(dependency)) continue;
    names.push(dependency);
  }
  return names;
}

/**
 * Fetches each requested component and, recursively, every component it depends
 * on. The returned map preserves first-encounter order (seeded by `names`) and
 * contains each component exactly once. The first registry failure short
 * circuits and is returned as a typed error.
 */
export async function resolveComponentClosure(
  client: ShadcnRegistryClient,
  style: string,
  names: readonly string[],
): Promise<Result<Map<string, RegistryItem>, ShadcnRegistryError>> {
  const items = new Map<string, RegistryItem>();
  const queued = new Set<string>();
  const queue: string[] = [];

  for (const name of names) {
    if (queued.has(name)) continue;
    queued.add(name);
    queue.push(name);
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const name = queue[cursor];
    cursor += 1;
    if (name === undefined) break;

    const result = await client.getItem(style, name);
    if (!result.isOk()) return Result.err(result.error);

    const item = result.value;
    items.set(name, item);
    for (const dependency of componentDependencyNames(item)) {
      if (queued.has(dependency)) continue;
      queued.add(dependency);
      queue.push(dependency);
    }
  }

  return Result.ok(items);
}

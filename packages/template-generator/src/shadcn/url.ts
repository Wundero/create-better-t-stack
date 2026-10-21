import type { ResolveBaseInput } from "./types";

/**
 * The registry addresses a style by a compound slug: `<base>-<style>`
 * (e.g. `base-maia`, `radix-lyra`, `aria-nova`).
 */
export function styleSlug(base: string, style: string): string {
  return `${base}-${style}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * Builds a deterministic `GET /init` URL for a base resolution request.
 *
 * Parameter order is fixed so the same input always yields the same URL (which
 * keeps the client cache and any request logging stable). Optional parameters
 * are omitted per registry defaults: `chartColor` unless it differs from
 * `neutral`, `fontHeading` unless it differs from `inherit`, `pointer` only
 * when true. `track=1` is always present.
 */
export function buildInitUrl(input: ResolveBaseInput, baseUrl: string): string {
  const params: Array<[string, string]> = [];

  params.push(["base", input.base]);
  params.push(["style", input.style]);
  params.push(["baseColor", input.baseColor]);
  params.push(["theme", input.theme]);
  params.push(["iconLibrary", input.iconLibrary]);
  params.push(["font", input.font]);
  params.push(["rtl", String(input.rtl ?? false)]);
  if (input.menuAccent !== undefined) params.push(["menuAccent", input.menuAccent]);
  if (input.menuColor !== undefined) params.push(["menuColor", input.menuColor]);
  params.push(["radius", input.radius]);
  if (input.chartColor !== undefined && input.chartColor !== "neutral") {
    params.push(["chartColor", input.chartColor]);
  }
  if (input.fontHeading !== undefined && input.fontHeading !== "inherit") {
    params.push(["fontHeading", input.fontHeading]);
  }
  if (input.preset !== undefined) params.push(["preset", input.preset]);
  if (input.template !== undefined) params.push(["template", input.template]);
  if (input.only !== undefined) params.push(["only", input.only]);
  if (input.pointer === true) params.push(["pointer", "true"]);
  params.push(["track", "1"]);

  const search = new URLSearchParams(params);
  return `${normalizeBaseUrl(baseUrl)}/init?${search.toString()}`;
}

/**
 * URL for a style-scoped registry item, e.g.
 * `https://ui.shadcn.com/r/styles/base-maia/button.json`.
 */
export function buildStyleItemUrl(style: string, name: string, baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/r/styles/${style}/${name}.json`;
}

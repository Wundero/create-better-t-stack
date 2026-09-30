/**
 * Shared icon-source resolution for the stack builder.
 *
 * Icons are stored on `TECH_OPTIONS` as strings and may be one of:
 *  - a remote URL (`https://...`), e.g. the R2 icon bucket
 *  - a root-relative local path (`/icon/foo.svg`), vendored in `apps/web/public`
 *  - a text/emoji fallback (anything else), rendered as-is
 *
 * Some brand marks ship a separate variant for light backgrounds. Rather than
 * guessing the active theme in JS (unreliable before hydration), the renderer
 * paints both variants and lets CSS pick one via the `dark` class. `LIGHT_VARIANT_MATCHES`
 * lists the icons that have a `-light.svg` sibling.
 */
const LIGHT_VARIANT_MATCHES = [
  "drizzle",
  "prisma",
  "express",
  "clerk",
  "planetscale",
  "nx",
  "polar",
  "astro",
  "vercel",
  "aws",
] as const;

/** Whether an icon string should be rendered as an image (remote or local). */
export function isRenderableIconPath(icon: string): boolean {
  return icon.startsWith("https://") || icon.startsWith("/");
}

/** Whether the icon has a `-light.svg` sibling for light backgrounds. */
export function hasLightVariant(icon: string): boolean {
  return icon.endsWith(".svg") && LIGHT_VARIANT_MATCHES.some((match) => icon.includes(match));
}

/** Map an icon path to its `-light.svg` sibling. */
export function lightVariantSrc(icon: string): string {
  return icon.replace(/\.svg$/, "-light.svg");
}

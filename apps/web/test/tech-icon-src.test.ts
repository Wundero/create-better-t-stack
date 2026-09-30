import { describe, expect, test } from "bun:test";

import { hasLightVariant, isRenderableIconPath, lightVariantSrc } from "../src/lib/tech-icon-src";

describe("isRenderableIconPath", () => {
  test("accepts remote https icon urls", () => {
    expect(isRenderableIconPath("https://r2.better-t-stack.dev/icons/vercel.svg")).toBe(true);
  });

  test("accepts root-relative local icon paths", () => {
    expect(isRenderableIconPath("/icon/aws.svg")).toBe(true);
  });

  test("rejects emoji / plain text fallbacks", () => {
    expect(isRenderableIconPath("\ud83d\udc3a")).toBe(false);
    expect(isRenderableIconPath("PWA")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isRenderableIconPath("")).toBe(false);
  });
});

describe("hasLightVariant", () => {
  test("detects remote icons with a light variant", () => {
    expect(hasLightVariant("https://r2.better-t-stack.dev/icons/vercel.svg")).toBe(true);
  });

  test("detects local icons with a light variant", () => {
    expect(hasLightVariant("/icon/aws.svg")).toBe(true);
  });

  test("rejects icons without a light variant", () => {
    expect(hasLightVariant("/icon/wxt.svg")).toBe(false);
    expect(hasLightVariant("/icon/react.svg")).toBe(false);
  });

  test("rejects non-svg paths", () => {
    expect(hasLightVariant("/icon/aws.png")).toBe(false);
  });

  test("rejects emoji fallback", () => {
    expect(hasLightVariant("\ud83d\udc3a")).toBe(false);
  });
});

describe("lightVariantSrc", () => {
  test("maps a remote icon to its light sibling", () => {
    expect(lightVariantSrc("https://r2.better-t-stack.dev/icons/vercel.svg")).toBe(
      "https://r2.better-t-stack.dev/icons/vercel-light.svg",
    );
  });

  test("maps a local icon to its light sibling", () => {
    expect(lightVariantSrc("/icon/aws.svg")).toBe("/icon/aws-light.svg");
  });
});

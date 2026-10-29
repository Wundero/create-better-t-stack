import { describe, expect, test } from "bun:test";

import {
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONTS,
  PRESET_ICON_LIBRARIES,
  PRESET_MENU_ACCENTS,
  PRESET_MENU_COLORS,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
  V1_CHART_COLOR_MAP,
  decodePreset,
  encodePreset,
  isPresetCode,
  isValidPreset,
  parsePresetStyle,
  toBase62,
  DEFAULT_PRESET_CONFIG,
  type PresetConfig,
} from "../src/shadcn-preset";
import { DEFAULT_PRESETS } from "../src/shadcn-presets";

// Deterministic PRNG so the round-trip sample is reproducible.
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomConfig(random: () => number): PresetConfig {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)] as T;
  return {
    style: pick(PRESET_STYLES),
    baseColor: pick(PRESET_BASE_COLORS),
    theme: pick(PRESET_THEMES),
    chartColor: pick(PRESET_CHART_COLORS),
    iconLibrary: pick(PRESET_ICON_LIBRARIES),
    font: pick(PRESET_FONTS),
    fontHeading: pick(["inherit", ...PRESET_FONTS] as const),
    radius: pick(PRESET_RADII),
    menuAccent: pick(PRESET_MENU_ACCENTS),
    menuColor: pick(PRESET_MENU_COLORS),
  };
}

const GOLDEN: PresetConfig = {
  style: "maia",
  baseColor: "taupe",
  theme: "taupe",
  chartColor: "amber",
  iconLibrary: "hugeicons",
  font: "outfit",
  fontHeading: "raleway",
  radius: "medium",
  menuColor: "default-translucent",
  menuAccent: "subtle",
};

describe("encodePreset/decodePreset round-trip", () => {
  test("round-trips all named default presets", () => {
    for (const [name, config] of Object.entries(DEFAULT_PRESETS)) {
      expect(decodePreset(encodePreset(config)), `preset ${name} round-trip`).toEqual(config);
    }
  });

  test("round-trips 200 deterministic pseudo-random configs", () => {
    const random = mulberry32(20240923);
    for (let i = 0; i < 200; i++) {
      const config = randomConfig(random);
      expect(decodePreset(encodePreset(config)), `random config #${i}`).toEqual(config);
    }
  });
});

describe("decodePreset golden + defaults", () => {
  test("decodes the known v2 golden code", () => {
    expect(decodePreset("b1x9M8ZeJW")).toEqual(GOLDEN);
  });

  test("decodes empty payload to the default config", () => {
    expect(decodePreset("b")).toEqual(DEFAULT_PRESET_CONFIG);
    expect(decodePreset(encodePreset(DEFAULT_PRESET_CONFIG))).toEqual(DEFAULT_PRESET_CONFIG);
  });
});

describe("v1 compatibility", () => {
  test("v1 codes inherit the heading font and restore chartColor from the theme", () => {
    const decoded = decodePreset("a");
    expect(decoded).not.toBeNull();
    expect(decoded?.fontHeading).toBe("inherit");
    expect(decoded?.theme).toBe("neutral");
    expect(decoded?.chartColor).toBe(V1_CHART_COLOR_MAP.neutral);
    expect(decoded?.chartColor).toBe("blue");
  });

  test("exposes the v1 base-color to chart-color mapping", () => {
    expect(V1_CHART_COLOR_MAP).toEqual({
      neutral: "blue",
      stone: "lime",
      zinc: "amber",
      mauve: "emerald",
      olive: "violet",
      mist: "rose",
      taupe: "cyan",
    });
  });
});

describe("isPresetCode bounds", () => {
  test("accepts version prefix plus base62 payload", () => {
    expect(isPresetCode("a0")).toBe(true);
    expect(isPresetCode("b0")).toBe(true);
    expect(isPresetCode("b1x9M8ZeJW")).toBe(true);
    expect(isValidPreset("b1x9M8ZeJW")).toBe(true);
  });

  test("rejects wrong length, prefix, or alphabet", () => {
    expect(isPresetCode("")).toBe(false);
    expect(isPresetCode("x")).toBe(false);
    expect(isPresetCode("b")).toBe(false);
    expect(isPresetCode("c0")).toBe(false);
    expect(isPresetCode("0b")).toBe(false);
    expect(isPresetCode("b-")).toBe(false);
    expect(isPresetCode("b!")).toBe(false);
    expect(isPresetCode("b0000000000")).toBe(false);
    expect(isValidPreset("not-a-preset")).toBe(false);
  });
});

describe("index fallback", () => {
  test("oversized menuColor index falls back to index 0", () => {
    // menuColor occupies bits [0,3): index 5 is out of range for 4 values.
    expect(decodePreset(`b${toBase62(5)}`)?.menuColor).toBe("default");
  });

  test("oversized fontHeading index falls back to index 0", () => {
    // fontHeading occupies bits [46,51): index 30 exceeds the 27 heading values.
    expect(decodePreset(`b${toBase62(30 * 2 ** 46)}`)?.fontHeading).toBe("inherit");
  });
});

describe("parsePresetStyle", () => {
  test("splits registry base prefixes from the style name", () => {
    expect(parsePresetStyle("radix-nova")).toEqual({ base: "radix", style: "nova" });
    expect(parsePresetStyle("base-vega")).toEqual({ base: "base", style: "vega" });
    expect(parsePresetStyle("aria-maia")).toEqual({ base: "aria", style: "maia" });
    expect(parsePresetStyle("nova")).toEqual({ base: undefined, style: "nova" });
    expect(parsePresetStyle(undefined)).toEqual({ base: undefined, style: undefined });
  });
});

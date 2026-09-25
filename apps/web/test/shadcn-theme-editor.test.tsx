import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PRESET_CONFIG,
  DEFAULT_PRESETS,
  V1_CHART_COLOR_MAP,
  decodePreset,
  encodePreset,
  SHADCN_BASE_VALUES,
} from "@better-t-stack/types";

import {
  buildShadcnOptionsUpdate,
  formatPresetFieldValue,
  getPresetConfig,
  getShadcnSummary,
  hasReactWebFrontend,
  parsePresetInput,
  resetShadcnFields,
  SHADCN_BASE_OPTIONS,
  updatePresetCode,
} from "../src/app/(home)/new/_components/shadcn-theme/helpers";
import { DEFAULT_STACK } from "../src/lib/constant";
import { getShadcnConfig } from "../src/lib/shadcn-config";

const SAMPLE_PRESET = "b1x9M8ZeJW";

function stackWithPreset(preset: string) {
  return { ...DEFAULT_STACK, shadcnPreset: preset };
}

describe("shadcn theme editor helpers", () => {
  describe("hasReactWebFrontend", () => {
    test("is true for every React web frontend", () => {
      const reactFrontends = ["next", "tanstack-router", "react-router", "tanstack-start"] as const;
      for (const frontend of reactFrontends) {
        expect(hasReactWebFrontend({ webFrontend: [frontend] })).toBe(true);
      }
    });

    test("is false for non-React frontends and empty selections", () => {
      expect(hasReactWebFrontend({ webFrontend: ["nuxt"] })).toBe(false);
      expect(hasReactWebFrontend({ webFrontend: ["svelte"] })).toBe(false);
      expect(hasReactWebFrontend({ webFrontend: [] })).toBe(false);
      expect(hasReactWebFrontend({ webFrontend: ["none"] })).toBe(false);
    });

    test("is true when a React frontend is mixed with a non-React one", () => {
      expect(hasReactWebFrontend({ webFrontend: ["nuxt", "next"] })).toBe(true);
    });
  });

  describe("parsePresetInput", () => {
    test("accepts a raw preset code", () => {
      const parsed = parsePresetInput(SAMPLE_PRESET);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.code).toBe(SAMPLE_PRESET);
      expect(parsed.config.style).toBe("maia");
      expect(parsed.config.theme).toBe("taupe");
    });

    test("accepts a preset embedded in a shadcn URL", () => {
      const parsed = parsePresetInput(`https://ui.shadcn.com/themes?preset=${SAMPLE_PRESET}`);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.code).toBe(SAMPLE_PRESET);
    });

    test("rejects non-preset text and empty input", () => {
      expect(parsePresetInput("").ok).toBe(false);
      expect(parsePresetInput("not-a-preset").ok).toBe(false);
      expect(parsePresetInput("https://ui.shadcn.com/themes").ok).toBe(false);
    });
  });

  describe("updatePresetCode", () => {
    test("re-encodes after changing a single codec field", () => {
      const code = updatePresetCode(encodePreset({}), { style: "maia", theme: "taupe" });
      const decoded = decodePreset(code);
      expect(decoded?.style).toBe("maia");
      expect(decoded?.theme).toBe("taupe");
      expect(decoded?.baseColor).toBe(DEFAULT_PRESET_CONFIG.baseColor);
    });

    test("round-trips every named preset through encode + decode", () => {
      for (const [name, preset] of Object.entries(DEFAULT_PRESETS)) {
        const decoded = decodePreset(encodePreset(preset));
        expect(decoded, name).toEqual(preset);
      }
    });
  });

  describe("getPresetConfig", () => {
    test("falls back to defaults for an empty or invalid code", () => {
      expect(getPresetConfig("")).toEqual(DEFAULT_PRESET_CONFIG);
      expect(getPresetConfig("zzz")).toEqual(DEFAULT_PRESET_CONFIG);
    });

    test("fills v1 defaults for fields the v1 codec never stored", () => {
      const config = getPresetConfig("a0");
      expect(config.style).toBe(DEFAULT_PRESET_CONFIG.style);
      expect(config.fontHeading).toBe("inherit");
      expect(config.chartColor).toBe(V1_CHART_COLOR_MAP[DEFAULT_PRESET_CONFIG.theme]);
      expect(config.chartColor).toBeDefined();
    });
  });

  describe("buildShadcnOptionsUpdate", () => {
    test("maps base, RTL and pointer onto stack state fields", () => {
      const update = buildShadcnOptionsUpdate({
        preset: SAMPLE_PRESET,
        base: "radixui",
        rtl: true,
        pointer: true,
      });
      expect(update).toEqual({
        shadcnPreset: SAMPLE_PRESET,
        shadcnBase: "radixui",
        shadcnRtl: true,
        shadcnPointer: true,
      });
    });

    test("feeds getShadcnConfig with a non-default shadcn config", () => {
      const update = buildShadcnOptionsUpdate({
        preset: SAMPLE_PRESET,
        base: "react-aria",
        rtl: true,
        pointer: false,
      });
      const config = getShadcnConfig({
        shadcnPreset: update.shadcnPreset ?? "",
        shadcnBase: update.shadcnBase ?? "baseui",
        shadcnRtl: update.shadcnRtl ?? false,
        shadcnPointer: update.shadcnPointer ?? false,
      });
      expect(config).toEqual({
        preset: SAMPLE_PRESET,
        base: "react-aria",
        rtl: true,
        pointer: false,
      });
    });

    test("offers exactly the allowed shadcn bases", () => {
      expect(SHADCN_BASE_OPTIONS.map((option) => option.value).sort()).toEqual(
        [...SHADCN_BASE_VALUES].sort(),
      );
    });
  });

  describe("resetShadcnFields", () => {
    test("clears all four fields back to defaults", () => {
      expect(resetShadcnFields()).toEqual({
        shadcnPreset: "",
        shadcnBase: "baseui",
        shadcnRtl: false,
        shadcnPointer: false,
      });
    });

    test("produces an undefined config for the default stack", () => {
      const update = resetShadcnFields();
      const config = getShadcnConfig({
        shadcnPreset: update.shadcnPreset ?? "",
        shadcnBase: update.shadcnBase ?? "baseui",
        shadcnRtl: update.shadcnRtl ?? false,
        shadcnPointer: update.shadcnPointer ?? false,
      });
      expect(config).toBeUndefined();
    });
  });

  describe("getShadcnSummary", () => {
    test("reports the default stack as not custom", () => {
      const summary = getShadcnSummary({
        shadcnPreset: "",
        shadcnBase: "baseui",
        shadcnRtl: false,
        shadcnPointer: false,
      });
      expect(summary).toEqual({
        presetLabel: "default",
        baseLabel: "Base UI",
        rtl: false,
        pointer: false,
        isCustom: false,
      });
    });

    test("reports custom values with friendly base labels", () => {
      const summary = getShadcnSummary({
        shadcnPreset: SAMPLE_PRESET,
        shadcnBase: "react-aria",
        shadcnRtl: true,
        shadcnPointer: true,
      });
      expect(summary.presetLabel).toBe(SAMPLE_PRESET);
      expect(summary.baseLabel).toBe("React Aria");
      expect(summary.isCustom).toBe(true);
    });
  });

  describe("formatPresetFieldValue", () => {
    test("turns kebab-case codec values into readable labels", () => {
      expect(formatPresetFieldValue("react-aria")).toBe("React Aria");
      expect(formatPresetFieldValue("default-translucent")).toBe("Default Translucent");
      expect(formatPresetFieldValue("inherit")).toBe("Inherit");
    });

    test("leaves the sample preset decodable after a field edit", () => {
      const decoded = decodePreset(updatePresetCode(SAMPLE_PRESET, { radius: "large" }));
      expect(decoded?.radius).toBe("large");
    });
  });

  test("stackWithPreset keeps the rest of the stack intact", () => {
    const stack = stackWithPreset(SAMPLE_PRESET);
    expect(stack.shadcnPreset).toBe(SAMPLE_PRESET);
    expect(stack.webFrontend).toEqual(DEFAULT_STACK.webFrontend);
  });
});

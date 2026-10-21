import { describe, expect, test } from "bun:test";

import { encodePreset, ShadcnConfigSchema } from "@better-t-stack/types";

import { DEFAULT_STACK, type StackState } from "../src/lib/constant";
import { sanitizeStackState } from "../src/lib/sanitize-stack-addons";
import { DEFAULT_SHADCN_PRESET } from "../src/lib/shadcn-config";
import { StackStateSchema, stackStateToConfig } from "../src/lib/stack-schema";
import { loadStackParams } from "../src/lib/stack-url-state";
import { stackParsers } from "../src/lib/stack-url-state.client";
import { generateStackCommand, generateStackUrlFromState } from "../src/lib/stack-utils";

const VALID_PRESET = encodePreset({});

function createStack(overrides: Partial<StackState> = {}): StackState {
  return {
    ...DEFAULT_STACK,
    ...overrides,
    webFrontend: [...(overrides.webFrontend ?? DEFAULT_STACK.webFrontend)],
    nativeFrontend: [...(overrides.nativeFrontend ?? DEFAULT_STACK.nativeFrontend)],
    addons: [...(overrides.addons ?? DEFAULT_STACK.addons)],
    examples: [...(overrides.examples ?? DEFAULT_STACK.examples)],
  };
}

describe("shadcn theme stack state", () => {
  test("exposes shadcn defaults on the client parsers", () => {
    expect(stackParsers.shadcnPreset.defaultValue).toBe("");
    expect(stackParsers.shadcnBase.defaultValue).toBe("baseui");
    expect(stackParsers.shadcnRtl.defaultValue).toBe(false);
    expect(stackParsers.shadcnPointer.defaultValue).toBe(false);
  });

  test("round-trips shadcn fields through the URL", async () => {
    const stack = createStack({
      shadcnPreset: VALID_PRESET,
      shadcnBase: "radixui",
      shadcnRtl: true,
      shadcnPointer: true,
    });

    const url = generateStackUrlFromState(stack);
    expect(url).toContain(`th=${VALID_PRESET}`);
    expect(url).toContain("th-b=radixui");
    expect(url).toContain("th-rtl=true");
    expect(url).toContain("th-p=true");

    const loaded = await loadStackParams(Promise.resolve(new URL(url)));
    expect(loaded.shadcnPreset).toBe(VALID_PRESET);
    expect(loaded.shadcnBase).toBe("radixui");
    expect(loaded.shadcnRtl).toBe(true);
    expect(loaded.shadcnPointer).toBe(true);
  });

  test("falls back to defaults for invalid base and boolean params", async () => {
    const loaded = await loadStackParams(
      Promise.resolve(new URL("https://better-t-stack.dev/new?th-b=bogus&th-rtl=maybe")),
    );

    expect(loaded.shadcnBase).toBe("baseui");
    expect(loaded.shadcnRtl).toBe(false);
  });

  test("emits a full shadcn config when configured", () => {
    const config = stackStateToConfig(
      createStack({
        shadcnPreset: VALID_PRESET,
        shadcnBase: "radixui",
        shadcnRtl: true,
        shadcnPointer: true,
      }),
    );

    expect(config.shadcn).toEqual({
      preset: VALID_PRESET,
      base: "radixui",
      rtl: true,
      pointer: true,
    });
  });

  test("emits the default preset when only the base differs from default", () => {
    const config = stackStateToConfig(createStack({ shadcnBase: "react-aria" }));

    expect(config.shadcn).toEqual({
      preset: DEFAULT_SHADCN_PRESET,
      base: "react-aria",
      rtl: false,
      pointer: false,
    });
  });

  test("always emits a valid preset when configured without one", () => {
    const cases: Array<{ overrides: Partial<StackState>; flag: string }> = [
      { overrides: { shadcnBase: "radixui" }, flag: "--shadcn-base radixui" },
      { overrides: { shadcnRtl: true }, flag: "--shadcn-rtl" },
      { overrides: { shadcnPointer: true }, flag: "--shadcn-pointer" },
    ];

    for (const { overrides, flag } of cases) {
      const config = stackStateToConfig(createStack(overrides));
      expect(config.shadcn?.preset).toBe(DEFAULT_SHADCN_PRESET);
      expect(DEFAULT_SHADCN_PRESET).toBe(encodePreset({}));
      expect(ShadcnConfigSchema.safeParse(config.shadcn).success).toBe(true);

      const command = generateStackCommand(createStack(overrides));
      expect(command).toContain(`--shadcn-preset ${DEFAULT_SHADCN_PRESET}`);
      expect(command).toContain(flag);
    }
  });

  test("omits shadcn config when every field is at its default", () => {
    const config = stackStateToConfig(createStack());

    expect(config.shadcn).toBeUndefined();
  });

  test("includes shadcn flags in the generated command", () => {
    const command = generateStackCommand(
      createStack({
        shadcnPreset: VALID_PRESET,
        shadcnBase: "radixui",
        shadcnRtl: true,
        shadcnPointer: true,
      }),
    );

    expect(command).toContain(`--shadcn-preset ${VALID_PRESET}`);
    expect(command).toContain("--shadcn-base radixui");
    expect(command).toContain("--shadcn-rtl");
    expect(command).toContain("--shadcn-pointer");
  });

  test("emits the default preset for a base-only command but no other shadcn flags", () => {
    const rtlOnly = generateStackCommand(createStack({ shadcnRtl: true }));
    expect(rtlOnly).toContain("--shadcn-rtl");
    expect(rtlOnly).toContain(`--shadcn-preset ${DEFAULT_SHADCN_PRESET}`);
    expect(rtlOnly).not.toContain("--shadcn-base");
    expect(rtlOnly).not.toContain("--shadcn-pointer");

    const baseOnly = generateStackCommand(createStack({ shadcnBase: "react-aria" }));
    expect(baseOnly).toContain("--shadcn-base react-aria");
    expect(baseOnly).toContain(`--shadcn-preset ${DEFAULT_SHADCN_PRESET}`);
    expect(baseOnly).not.toContain("--shadcn-rtl");
    expect(baseOnly).not.toContain("--shadcn-pointer");
  });

  test("emits no shadcn flags for a default stack", () => {
    const command = generateStackCommand(createStack());

    expect(command).toBe("bun create better-t-stack@latest my-better-t-app --yes");
    expect(command).not.toContain("--shadcn");
  });

  test("rejects invalid shadcn values at the schema boundary", () => {
    expect(StackStateSchema.safeParse({ ...DEFAULT_STACK, shadcnBase: "bogus" }).success).toBe(
      false,
    );
    expect(ShadcnConfigSchema.safeParse({ preset: "x" }).success).toBe(false);
    expect(
      ShadcnConfigSchema.safeParse({ preset: VALID_PRESET, base: "baseui", rtl: true }).success,
    ).toBe(true);
  });

  test("drops invalid presets during sanitization without dropping the other fields", () => {
    const invalid = sanitizeStackState({ ...DEFAULT_STACK, shadcnPreset: "x" });
    expect(invalid.shadcnPreset).toBe("");
    expect(invalid.shadcnBase).toBe("baseui");
    expect(invalid.shadcnRtl).toBe(false);
    expect(invalid.shadcnPointer).toBe(false);
  });

  test("preserves configured shadcn fields through sanitization", () => {
    const sanitized = sanitizeStackState(
      createStack({
        shadcnPreset: VALID_PRESET,
        shadcnBase: "react-aria",
        shadcnRtl: true,
        shadcnPointer: true,
      }),
    );

    expect(sanitized.shadcnPreset).toBe(VALID_PRESET);
    expect(sanitized.shadcnBase).toBe("react-aria");
    expect(sanitized.shadcnRtl).toBe(true);
    expect(sanitized.shadcnPointer).toBe(true);
  });
});

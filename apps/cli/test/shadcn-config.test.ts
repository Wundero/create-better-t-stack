import { describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BetterTStackConfig } from "@better-t-stack/types";
import type { ProjectConfig } from "@better-t-stack/types";
import * as clack from "@clack/prompts";

import * as navigable from "../src/prompts/navigable";
import { getShadcnChoice } from "../src/prompts/shadcn";
import { readBtsConfig, updateBtsConfig } from "../src/utils/bts-config";
import type { ShadcnFlaggedInput } from "../src/utils/config-processing";
import { processFlags } from "../src/utils/config-processing";
import { validateShadcn } from "../src/utils/config-validation";
import { runWithContextAsync } from "../src/utils/context";
import { getConfigSections } from "../src/utils/display-config";
import { getProvidedFlags, processAndValidateFlags } from "../src/validation";

const VALID_PRESET = "nova";

describe("shadcn flag mapping", () => {
  it("maps all four discrete flags into config.shadcn", () => {
    const options: ShadcnFlaggedInput = {
      shadcnPreset: VALID_PRESET,
      shadcnBase: "radixui",
      shadcnRtl: true,
      shadcnPointer: true,
    };

    const config = processFlags(options, "app");

    expect(config.shadcn).toEqual({
      preset: VALID_PRESET,
      base: "radixui",
      rtl: true,
      pointer: true,
    });
  });

  it("maps each discrete flag independently", () => {
    const cases: ShadcnFlaggedInput[] = [
      { shadcnPreset: VALID_PRESET },
      { shadcnBase: "radixui" },
      { shadcnRtl: true },
      { shadcnPointer: true },
    ];

    for (const options of cases) {
      expect(processFlags(options, "app").shadcn).toBeDefined();
    }
  });

  it("omits shadcn when no shadcn flag is provided", () => {
    expect(processFlags({}, "app").shadcn).toBeUndefined();
  });

  it("preserves an explicit nested shadcn object", () => {
    const options: ShadcnFlaggedInput = {
      shadcn: { preset: "vega", base: "react-aria" },
      shadcnPreset: VALID_PRESET,
      shadcnRtl: true,
    };

    expect(processFlags(options, "app").shadcn).toEqual({ preset: "vega", base: "react-aria" });
  });
});

describe("shadcn prompt gating", () => {
  it("skips the prompt without rendering UI when no React web frontend is selected", async () => {
    const confirmSpy = spyOn(navigable, "navigableConfirm");
    try {
      const result = await getShadcnChoice(undefined, ["nuxt"]);

      expect(result).toBeUndefined();
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("returns the flag without prompting even for non-React frontends", async () => {
    const confirmSpy = spyOn(navigable, "navigableConfirm");
    try {
      const result = await getShadcnChoice({ preset: VALID_PRESET, base: "baseui" }, ["nuxt"]);

      expect(result).toEqual({ preset: VALID_PRESET, base: "baseui" });
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("collects a preset, base, rtl, and pointer answer for React frontends", async () => {
    const confirmSpy = spyOn(navigable, "navigableConfirm")
      .mockImplementationOnce(async () => true)
      .mockImplementation(async () => false);
    const selectSpy = spyOn(navigable, "navigableSelect").mockImplementation(
      async (options) => options.options[0].value,
    );
    const textSpy = spyOn(clack, "text").mockImplementation(async () => VALID_PRESET);
    try {
      const result = await runWithContextAsync({}, () =>
        getShadcnChoice(undefined, ["tanstack-router"]),
      );

      expect(result).toEqual({
        preset: VALID_PRESET,
        base: "baseui",
        rtl: false,
        pointer: false,
      });
      expect(confirmSpy).toHaveBeenCalledTimes(3);
      expect(selectSpy).toHaveBeenCalledTimes(1);
      expect(textSpy).toHaveBeenCalledTimes(1);
    } finally {
      confirmSpy.mockRestore();
      selectSpy.mockRestore();
      textSpy.mockRestore();
    }
  });

  it("rejects an invalid preset flag", async () => {
    await expect(getShadcnChoice({ preset: "not a preset!" }, ["next"])).rejects.toThrow(
      "Invalid shadcn preset",
    );
  });
});

describe("shadcn validation", () => {
  it("requires a preset when shadcn is configured", () => {
    const result = validateShadcn({ shadcn: { base: "baseui" }, frontend: ["next"] });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("requires a preset");
    }
  });

  it("rejects an invalid preset", () => {
    const result = validateShadcn({ shadcn: { preset: "nope" }, frontend: ["next"] });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Invalid shadcn preset");
    }
  });

  it("rejects shadcn without a React web frontend", () => {
    const result = validateShadcn({ shadcn: { preset: VALID_PRESET }, frontend: ["nuxt"] });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("React web frontend");
    }
  });

  it("does not inject a base into the config when omitted", () => {
    const config: Partial<ProjectConfig> = {
      shadcn: { preset: VALID_PRESET },
      frontend: ["next"],
    };
    const result = validateShadcn(config);

    expect(result.isOk()).toBe(true);
    expect(config.shadcn).toEqual({ preset: VALID_PRESET });
    expect(config.shadcn?.base).toBeUndefined();
  });

  it("defers the frontend check until a frontend is resolved", () => {
    const result = validateShadcn({ shadcn: { preset: VALID_PRESET } });

    expect(result.isOk()).toBe(true);
  });
});

describe("shadcn --yes interaction", () => {
  it("allows --yes together with shadcn flags", () => {
    const options: ShadcnFlaggedInput = { yes: true, shadcnPreset: VALID_PRESET };

    const result = processAndValidateFlags(options, getProvidedFlags(options), "shadcn-app");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.shadcn).toEqual({ preset: VALID_PRESET });
    }
  });

  it("rejects shadcn flags when a non-React frontend is explicitly selected", () => {
    const options: ShadcnFlaggedInput = {
      frontend: ["nuxt"],
      shadcnPreset: VALID_PRESET,
    };

    const result = processAndValidateFlags(options, getProvidedFlags(options), "shadcn-app");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("React web frontend");
    }
  });
});

describe("shadcn display", () => {
  it("renders a Product row with base, preset, rtl, and pointer", () => {
    const sections = getConfigSections({
      shadcn: { preset: VALID_PRESET, base: "radixui", rtl: true, pointer: true },
    });
    const product = sections.find((section) => section.title === "Product");

    expect(product?.rows).toContainEqual({
      label: "shadcn",
      value: "Radix UI · preset nova · RTL · pointer",
    });
  });

  it("labels the default baseui value", () => {
    const sections = getConfigSections({ shadcn: { preset: VALID_PRESET } });
    const product = sections.find((section) => section.title === "Product");

    expect(product?.rows).toContainEqual({ label: "shadcn", value: "Base UI · preset nova" });
  });
});

describe("shadcn persistence", () => {
  it("round-trips shadcn through bts.jsonc and preserves other fields", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bts-shadcn-"));
    try {
      const base = {
        version: "0.0.0",
        createdAt: new Date(0).toISOString(),
        database: "sqlite",
        orm: "drizzle",
        backend: "hono",
        runtime: "bun",
        frontend: ["tanstack-router"],
        addons: ["none"],
        examples: ["none"],
        auth: "none",
        payments: "none",
        packageManager: "bun",
        dbSetup: "none",
        api: "trpc",
        webDeploy: "none",
        serverDeploy: "none",
        shadcn: { preset: VALID_PRESET, base: "baseui", rtl: true },
      } satisfies BetterTStackConfig;
      await writeFile(path.join(dir, "bts.jsonc"), JSON.stringify(base, null, 2));

      const loaded = await readBtsConfig(dir);
      expect(loaded?.shadcn).toEqual({ preset: VALID_PRESET, base: "baseui", rtl: true });

      const updated = await updateBtsConfig(dir, {
        shadcn: { preset: "vega", base: "radixui" },
      });
      expect(updated.isOk()).toBe(true);
      const reloaded = await readBtsConfig(dir);
      expect(reloaded?.shadcn).toEqual({ preset: "vega", base: "radixui" });
      expect(reloaded?.database).toBe("sqlite");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

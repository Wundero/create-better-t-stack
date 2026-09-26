import { text } from "@clack/prompts";

import {
  DEFAULT_PRESETS,
  SHADCN_BASE_VALUES,
  type Frontend,
  type ShadcnBase,
  type ShadcnConfig,
} from "../types";
import { markPromptShown, setLastPromptShownUI } from "../utils/context";
import { UserCancelledError, ValidationError } from "../utils/errors";
import {
  hasReactWebFrontend,
  isValidShadcnPresetValue,
  normalizeShadcnPreset,
} from "../utils/shadcn";
import { isCancel, navigableConfirm, navigableSelect, preferValidInitial } from "./navigable";
import { navigableGroup } from "./navigable-group";

const BASE_LABELS = {
  baseui: "Base UI",
  radixui: "Radix UI",
  "react-aria": "React Aria",
} satisfies Record<ShadcnBase, string>;

const DEFAULT_SHADCN_BASE: ShadcnBase = "baseui";

type ShadcnPromptResults = {
  enabled: boolean;
  preset: string;
  base: ShadcnBase;
  rtl: boolean;
  pointer: boolean;
};

function assertValidPreset(preset: string) {
  if (!isValidShadcnPresetValue(preset)) {
    throw new ValidationError({
      field: "shadcnPreset",
      value: preset,
      message: `Invalid shadcn preset "${preset}". Use a preset code, a named preset (${Object.keys(
        DEFAULT_PRESETS,
      ).join(", ")}), or a preset URL.`,
    });
  }
  return normalizeShadcnPreset(preset);
}

export async function getShadcnChoice(
  flag: ShadcnConfig | undefined,
  frontend: Frontend[],
  previousAnswer?: ShadcnConfig,
): Promise<ShadcnConfig | undefined> {
  if (flag !== undefined) {
    if (flag.preset !== undefined) {
      return { ...flag, preset: assertValidPreset(flag.preset) };
    }
    return flag;
  }

  if (!hasReactWebFrontend(frontend)) {
    return undefined;
  }

  const baseOptions = SHADCN_BASE_VALUES.map((value) => ({
    value,
    label: BASE_LABELS[value],
  }));

  const result = await navigableGroup<ShadcnPromptResults>(
    {
      enabled: async () => {
        const response = await navigableConfirm({
          message: "Configure a shadcn/ui theme?",
          initialValue: true,
        });
        if (isCancel(response)) {
          throw new UserCancelledError({ message: "Operation cancelled" });
        }
        return response;
      },
      preset: async ({ results, previousAnswer: previousPreset }) => {
        const initial = previousPreset ?? previousAnswer?.preset ?? "";
        if (results.enabled === false) {
          return initial;
        }
        setLastPromptShownUI(true);
        markPromptShown();
        const response = await text({
          message: "shadcn theme preset (code, name, or URL)",
          placeholder: "nova",
          initialValue: initial || undefined,
          defaultValue: initial || undefined,
          validate: (value) => {
            const candidate = String(value ?? "").trim();
            if (!candidate) {
              return "Enter a shadcn preset code, named preset, or preset URL";
            }
            return isValidShadcnPresetValue(candidate)
              ? undefined
              : `Unknown shadcn preset. Try a code, ${Object.keys(DEFAULT_PRESETS).join(", ")}, or a preset URL.`;
          },
        });
        if (isCancel(response)) {
          throw new UserCancelledError({ message: "Operation cancelled" });
        }
        return assertValidPreset(String(response));
      },
      base: async ({ results, previousAnswer: previousBase }) => {
        if (results.enabled === false) {
          return previousBase ?? DEFAULT_SHADCN_BASE;
        }
        const response = await navigableSelect<ShadcnBase>({
          message: "Which shadcn component base?",
          options: baseOptions,
          initialValue: preferValidInitial(
            baseOptions,
            previousBase ?? previousAnswer?.base,
            DEFAULT_SHADCN_BASE,
          ),
        });
        if (isCancel(response)) {
          throw new UserCancelledError({ message: "Operation cancelled" });
        }
        return response;
      },
      rtl: async ({ results, previousAnswer: previousRtl }) => {
        if (results.enabled === false) {
          return previousRtl ?? previousAnswer?.rtl ?? false;
        }
        const response = await navigableConfirm({
          message: "Enable RTL (right-to-left) styles?",
          initialValue: previousRtl ?? previousAnswer?.rtl ?? false,
        });
        if (isCancel(response)) {
          throw new UserCancelledError({ message: "Operation cancelled" });
        }
        return response;
      },
      pointer: async ({ results, previousAnswer: previousPointer }) => {
        if (results.enabled === false) {
          return previousPointer ?? previousAnswer?.pointer ?? false;
        }
        const response = await navigableConfirm({
          message: "Enable pointer cursor styles on interactive elements?",
          initialValue: previousPointer ?? previousAnswer?.pointer ?? false,
        });
        if (isCancel(response)) {
          throw new UserCancelledError({ message: "Operation cancelled" });
        }
        return response;
      },
    },
    {
      sections: [{ label: "Product", prompts: ["enabled", "preset", "base", "rtl", "pointer"] }],
      onCancel: () => {
        throw new UserCancelledError({ message: "Operation cancelled" });
      },
    },
  );

  if (!result.enabled) {
    return undefined;
  }

  return {
    preset: result.preset,
    base: result.base,
    rtl: result.rtl,
    pointer: result.pointer,
  };
}

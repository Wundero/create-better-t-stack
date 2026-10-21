import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";

import { BetterTStackConfigSchema, type I18nLibrary, type I18nOptions } from "../../../types";
import { CLIError } from "../../../utils/errors";

const BTS_CONFIG_FILE = "bts.jsonc";

/**
 * Persist the resolved i18n selection into `bts.jsonc`. The Add Path owns this
 * write (rather than the shared `updateBtsConfig`) because the shared helper's
 * update keys are the addon/deploy fields only.
 */
export async function writeI18nToBtsConfig(
  projectDir: string,
  library: I18nLibrary,
  options: I18nOptions,
): Promise<Result<void, CLIError>> {
  return Result.tryPromise({
    try: async () => {
      const configPath = path.join(projectDir, BTS_CONFIG_FILE);
      let content = await fs.readFile(configPath, "utf-8");

      const errors: ParseError[] = [];
      const current = parse(content, errors, { allowTrailingComma: true });
      if (errors.length > 0) throw new Error("Invalid JSONC in bts.jsonc");
      BetterTStackConfigSchema.parse({ ...current, i18n: library, i18nOptions: options });

      content = applyEdits(
        content,
        modify(content, ["i18n"], library, { formattingOptions: { tabSize: 2 } }),
      );
      content = applyEdits(
        content,
        modify(content, ["i18nOptions"], options, { formattingOptions: { tabSize: 2 } }),
      );
      await fs.writeFile(configPath, content, "utf-8");
    },
    catch: (cause: unknown) =>
      new CLIError({
        message: `Failed to record the i18n configuration in bts.jsonc: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}

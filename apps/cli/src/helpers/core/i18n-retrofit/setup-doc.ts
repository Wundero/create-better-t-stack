import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { I18N_LIBRARY_META } from "../../../types";
import { CLIError } from "../../../utils/errors";
import type { RetrofitPlan } from "./types";

export const I18N_SETUP_DOC = "I18N_SETUP.md";

export function renderSetupDoc(plan: RetrofitPlan): string {
  const library = I18N_LIBRARY_META[plan.library];
  const manual = plan.edits.filter((edit) => edit.kind === "manual");

  const lines: string[] = [
    `# i18n setup (${library.label})`,
    "",
    "`bts add` wired your project for i18n without touching any file it could not edit",
    "safely. Apply the steps below by hand, then delete this file.",
    "",
    "Continue with the `i18n-adopt` skill to wrap your existing strings incrementally.",
    "",
  ];

  for (const [index, edit] of manual.entries()) {
    lines.push(`## ${index + 1}. ${edit.path}`, "", edit.description, "");
    if (edit.snippet) {
      lines.push("```", edit.snippet, "```", "");
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function writeSetupDoc(
  projectDir: string,
  plan: RetrofitPlan,
): Promise<Result<string, CLIError>> {
  const docPath = path.join(projectDir, I18N_SETUP_DOC);
  return Result.tryPromise({
    try: async () => {
      // Create-only: never clobber a doc the user may already be working through.
      if (await fs.pathExists(docPath)) return docPath;
      await fs.writeFile(docPath, renderSetupDoc(plan), "utf-8");
      return docPath;
    },
    catch: (cause: unknown) =>
      new CLIError({
        message: `Failed to write ${I18N_SETUP_DOC}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}

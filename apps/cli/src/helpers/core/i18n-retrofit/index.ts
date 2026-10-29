import { Result } from "better-result";

import {
  I18N_LIBRARY_META,
  I18nOptionsSchema,
  type I18nLibrary,
  type I18nOptions,
  type ProjectConfig,
} from "../../../types";
import { CLIError } from "../../../utils/errors";
import { buildAddLocalesPlan } from "./add-locales";
import { buildInstallPlan } from "./plan";
import { writeSetupDoc } from "./setup-doc";
import { summarizePlan, type RetrofitPlan, type RetrofitResult } from "./types";
import { writePlannedTree } from "./write";

export { I18N_SETUP_DOC, renderSetupDoc } from "./setup-doc";
export { writeI18nToBtsConfig } from "./bts-config";
export type {
  RetrofitEdit,
  RetrofitEditKind,
  RetrofitMode,
  RetrofitPlan,
  RetrofitResult,
  RetrofitSkipped,
  RetrofitSummary,
} from "./types";

export interface RunI18nRetrofitInput {
  projectDir: string;
  config: ProjectConfig;
  existingLibrary: I18nLibrary | "none";
  existingOptions?: I18nOptions;
  dryRun: boolean;
}

export function i18nLibrarySwitchError(
  existingLibrary: I18nLibrary,
  requestedLibrary: I18nLibrary,
): CLIError {
  return new CLIError({
    message: `This project already uses ${I18N_LIBRARY_META[existingLibrary].label}. Switching to ${I18N_LIBRARY_META[requestedLibrary].label} through \`bts add\` is not supported; remove the existing \`packages/i18n\` catalogs and config, then re-run \`bts add --i18n ${requestedLibrary}\`.`,
  });
}

export function renderPlan(plan: RetrofitPlan): string[] {
  const lines: string[] = [];
  for (const edit of plan.edits) {
    lines.push(`${edit.kind.padEnd(15)} ${edit.path}`);
  }
  for (const skip of plan.skipped) {
    lines.push(`${"skip".padEnd(15)} ${skip.path} — ${skip.reason}`);
  }
  return lines;
}

export async function runI18nRetrofit(
  input: RunI18nRetrofitInput,
): Promise<Result<RetrofitResult, CLIError>> {
  const library = input.config.i18n;
  if (library === undefined || library === "none") {
    return Result.err(
      new CLIError({ message: "runI18nRetrofit requires a selected i18n library." }),
    );
  }

  const planResult = await buildPlan(input, library);
  if (planResult.isErr()) return Result.err(planResult.error);
  const plan = planResult.value;
  const summary = summarizePlan(plan);

  if (input.dryRun) {
    return Result.ok({ plan, summary, dryRun: true });
  }

  const writeResult = await writePlannedTree(input.projectDir, plan.edits);
  if (writeResult.isErr()) return Result.err(writeResult.error);

  let setupDocPath: string | undefined;
  if (summary.manual > 0) {
    const docResult = await writeSetupDoc(input.projectDir, plan);
    if (docResult.isErr()) return Result.err(docResult.error);
    setupDocPath = docResult.value;
  }

  return Result.ok({ plan, summary, setupDocPath, dryRun: false });
}

async function buildPlan(
  input: RunI18nRetrofitInput,
  library: I18nLibrary,
): Promise<Result<RetrofitPlan, CLIError>> {
  if (input.existingLibrary === "none") {
    return buildInstallPlan({ projectDir: input.projectDir, config: input.config });
  }

  if (input.existingLibrary !== library) {
    return Result.err(i18nLibrarySwitchError(input.existingLibrary, library));
  }

  const existingOptions = I18nOptionsSchema.parse(input.existingOptions ?? {});
  const requestedOptions = I18nOptionsSchema.parse(input.config.i18nOptions ?? {});
  return buildAddLocalesPlan({
    projectDir: input.projectDir,
    config: input.config,
    library,
    existingOptions,
    requestedOptions,
  });
}

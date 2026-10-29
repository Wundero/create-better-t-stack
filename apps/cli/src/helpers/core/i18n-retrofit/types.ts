import type { I18nLibrary, I18nOptions } from "../../../types";

/**
 * Retrofit edit kinds (design D9). Every planned change is exactly one of:
 *
 * - `create` — a new file. Skipped (reported) when the path already exists.
 * - `config-edit` — a structured edit of a config/JSON/TOML file.
 * - `anchored-insert` — an in-place edit of a root/provider file that the
 *   create-path only applies when a known anchor appears exactly once.
 * - `manual` — anything that cannot be applied safely. Reported in the outro
 *   and written to `I18N_SETUP.md` with the exact snippet.
 */
export type RetrofitEditKind = "create" | "config-edit" | "anchored-insert" | "manual";

export type RetrofitMode = "install" | "add-locales" | "noop";

export interface RetrofitEdit {
  kind: RetrofitEditKind;
  /** Project-relative POSIX path. */
  path: string;
  description: string;
  /** Full new file content. Present for `create`. */
  content?: string;
  /** Exact snippet to apply by hand. Present for `manual`. */
  snippet?: string;
}

export interface RetrofitSkipped {
  path: string;
  reason: string;
}

export interface RetrofitPlan {
  mode: RetrofitMode;
  library: I18nLibrary;
  options: I18nOptions;
  edits: RetrofitEdit[];
  skipped: RetrofitSkipped[];
}

export interface RetrofitSummary {
  created: number;
  edited: number;
  manual: number;
  skipped: number;
}

export interface RetrofitResult {
  plan: RetrofitPlan;
  summary: RetrofitSummary;
  /** Set when at least one manual edit was written to `I18N_SETUP.md`. */
  setupDocPath?: string;
  dryRun: boolean;
}

export function summarizePlan(plan: RetrofitPlan): RetrofitSummary {
  let created = 0;
  let edited = 0;
  let manual = 0;
  for (const edit of plan.edits) {
    if (edit.kind === "create") created += 1;
    else if (edit.kind === "manual") manual += 1;
    else edited += 1;
  }
  return { created, edited, manual, skipped: plan.skipped.length };
}

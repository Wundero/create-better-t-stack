import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { type ProjectConfig } from "../../types";
import { AddonSetupError } from "../../utils/errors";
import { createSpinner } from "../../utils/terminal-output";

export async function validatePostHogSetup(
  config: ProjectConfig,
): Promise<Result<void, AddonSetupError>> {
  const { projectDir } = config;
  const s = createSpinner();
  const posthogFile = path.join(projectDir, "packages", "observability", "src", "posthog.ts");

  s.start("Validating PostHog setup...");

  const exists = await fs.pathExists(posthogFile);
  if (!exists) {
    const error = new AddonSetupError({
      addon: "posthog",
      message: "PostHog setup incomplete. Missing packages/observability/src/posthog.ts",
    });
    s.stop("PostHog validation failed");
    return Result.err(error);
  }

  s.stop("PostHog analytics support verified successfully!");
  return Result.ok(undefined);
}

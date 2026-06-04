import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { type ProjectConfig } from "../../types";
import { AddonSetupError } from "../../utils/errors";
import { createSpinner } from "../../utils/terminal-output";

export async function validateOpenTelemetrySetup(
  config: ProjectConfig,
): Promise<Result<void, AddonSetupError>> {
  const { projectDir } = config;
  const s = createSpinner();
  const otelFile = path.join(projectDir, "packages", "observability", "src", "otel.ts");

  s.start("Validating OpenTelemetry setup...");

  const exists = await fs.pathExists(otelFile);
  if (!exists) {
    const error = new AddonSetupError({
      addon: "opentelemetry",
      message: "OpenTelemetry setup incomplete. Missing packages/observability/src/otel.ts",
    });
    s.stop("OpenTelemetry validation failed");
    return Result.err(error);
  }

  s.stop("OpenTelemetry observability support verified successfully!");
  return Result.ok(undefined);
}

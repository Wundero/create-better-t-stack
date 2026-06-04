import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { type ProjectConfig } from "../../types";
import { AddonSetupError } from "../../utils/errors";
import { createSpinner } from "../../utils/terminal-output";

export async function validateTauriSetup(
  config: ProjectConfig,
): Promise<Result<void, AddonSetupError>> {
  const { projectDir } = config;
  const s = createSpinner();
  const tauriDir = path.join(projectDir, "apps", "tauri", "src-tauri");

  s.start("Validating Tauri desktop app setup...");

  const requiredFiles = [
    path.join(tauriDir, "Cargo.toml"),
    path.join(tauriDir, "tauri.conf.json"),
    path.join(tauriDir, "src", "main.rs"),
    path.join(tauriDir, "src", "lib.rs"),
  ];

  const missing = await Promise.all(
    requiredFiles.map(async (file) => {
      const exists = await fs.pathExists(file);
      return exists ? null : path.relative(projectDir, file);
    }),
  );

  const missingFiles = missing.filter((f): f is string => f !== null);

  if (missingFiles.length > 0) {
    const error = new AddonSetupError({
      addon: "tauri",
      message: `Tauri setup incomplete. Missing files: ${missingFiles.join(", ")}`,
    });
    s.stop("Tauri validation failed");
    return Result.err(error);
  }

  s.stop("Tauri desktop app support verified successfully!");
  return Result.ok(undefined);
}

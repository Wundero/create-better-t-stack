import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { type ProjectConfig } from "../../types";
import { addPackageDependency } from "../../utils/add-package-deps";
import { AddonSetupError } from "../../utils/errors";
import { createSpinner } from "../../utils/terminal-output";

export async function setupPortless(config: ProjectConfig): Promise<Result<void, AddonSetupError>> {
  const { projectDir } = config;

  return Result.tryPromise({
    try: async () => {
      const s = createSpinner();

      s.start("Configuring Portless...");

      await addPackageDependency({
        devDependencies: ["portless"],
        projectDir,
      });

      const portlessJsonPath = path.join(projectDir, "portless.json");
      const portlessJsonExists = await fs.pathExists(portlessJsonPath);

      if (!portlessJsonExists) {
        s.stop("Portless configuration missing");
        throw new AddonSetupError({
          addon: "portless",
          message: "portless.json not found in project root",
        });
      }

      s.stop("Portless configured successfully!");
    },
    catch: (error) =>
      new AddonSetupError({
        addon: "portless",
        message: `Failed to set up portless: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      }),
  });
}

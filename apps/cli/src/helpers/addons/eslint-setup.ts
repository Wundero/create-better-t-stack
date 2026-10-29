import path from "node:path";

import { Result } from "better-result";
import fs from "fs-extra";

import { addPackageDependency } from "../../utils/add-package-deps";
import { AddonSetupError } from "../../utils/errors";

export async function setupEslint(projectDir: string): Promise<Result<void, AddonSetupError>> {
  return Result.tryPromise({
    try: async () => {
      await addPackageDependency({
        devDependencies: [
          "eslint",
          "@eslint/js",
          "typescript-eslint",
          "eslint-config-prettier",
          "prettier",
          "globals",
        ],
        projectDir,
      });

      const packageJsonPath = path.join(projectDir, "package.json");
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);

        packageJson.scripts = {
          ...packageJson.scripts,
          check: "eslint --fix . && prettier --write .",
        };

        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
      }
    },
    catch: (error) =>
      new AddonSetupError({
        addon: "eslint",
        message: `Failed to set up eslint: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      }),
  });
}

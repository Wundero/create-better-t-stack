import { describe, expect, it } from "bun:test";

import {
  ALL_WORKSPACE_PACKAGE_JSON_PATHS,
  CATALOG_PACKAGE_PATHS,
  WORKSPACE_APP_DIRS,
  WORKSPACE_PACKAGE_DIRS,
} from "../../../packages/template-generator/src/generators/workspace-paths";

const LEGACY_ADD_PACKAGE_JSON_PATHS = [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "apps/native/package.json",
  "apps/desktop/package.json",
  "apps/fumadocs/package.json",
  "apps/docs/package.json",
  "packages/api/package.json",
  "packages/db/package.json",
  "packages/auth/package.json",
  "packages/backend/package.json",
  "packages/config/package.json",
  "packages/email/package.json",
  "packages/env/package.json",
  "packages/infra/package.json",
  "packages/ui/package.json",
];

describe("workspace paths", () => {
  it("covers root and every app/package package.json path", () => {
    expect(ALL_WORKSPACE_PACKAGE_JSON_PATHS).toContain("package.json");
    for (const dir of WORKSPACE_APP_DIRS) {
      expect(ALL_WORKSPACE_PACKAGE_JSON_PATHS).toContain(`${dir}/package.json`);
    }
    for (const dir of WORKSPACE_PACKAGE_DIRS) {
      expect(ALL_WORKSPACE_PACKAGE_JSON_PATHS).toContain(`${dir}/package.json`);
    }
  });

  it("has no duplicates in package.json paths", () => {
    const unique = new Set(ALL_WORKSPACE_PACKAGE_JSON_PATHS);
    expect(unique.size).toBe(ALL_WORKSPACE_PACKAGE_JSON_PATHS.length);
  });

  it("starts the catalog paths with the root package", () => {
    expect(CATALOG_PACKAGE_PATHS[0]).toBe(".");
  });

  it("preserves the previously inlined add-handler list exactly", () => {
    expect([...ALL_WORKSPACE_PACKAGE_JSON_PATHS]).toEqual(LEGACY_ADD_PACKAGE_JSON_PATHS);
  });
});

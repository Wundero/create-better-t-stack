import { describe, expect, it } from "bun:test";

import { VirtualFileSystem } from "../../../packages/template-generator/src/core/virtual-fs";
import { extractAndRenameSubtree } from "../../../packages/template-generator/src/generators/extract-subtree";

function createVfs(): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  vfs.writeFile(
    "apps/web/package.json",
    `${JSON.stringify(
      {
        name: "web",
        dependencies: { "@acme/api": "workspace:*", next: "^16.3.4" },
      },
      null,
      2,
    )}\n`,
  );
  vfs.writeFile("apps/web/src/index.ts", "export const index = true;\n");
  vfs.writeFile("apps/web/src/nested/deep.ts", "export const deep = 1;\n");
  vfs.writeFile("packages/api/package.json", `${JSON.stringify({ name: "@acme/api" }, null, 2)}\n`);
  vfs.writeFile("package.json", `${JSON.stringify({ name: "root" }, null, 2)}\n`);
  return vfs;
}

describe("extractAndRenameSubtree", () => {
  it("extracts only the source subtree and renames it to the target prefix", () => {
    const vfs = createVfs();

    const result = extractAndRenameSubtree(vfs, "apps/web", "apps/admin", "admin");

    expect([...result.keys()]).toEqual([
      "apps/admin/package.json",
      "apps/admin/src/index.ts",
      "apps/admin/src/nested/deep.ts",
    ]);
    expect(result.get("apps/admin/src/index.ts")).toBe("export const index = true;\n");
    expect(result.get("apps/admin/src/nested/deep.ts")).toBe("export const deep = 1;\n");
  });

  it("rewrites the target package.json name while preserving other fields", () => {
    const vfs = createVfs();

    const result = extractAndRenameSubtree(vfs, "apps/web", "apps/admin", "admin");

    const pkg = JSON.parse(result.get("apps/admin/package.json") ?? "{}") as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("admin");
    expect(pkg.dependencies["@acme/api"]).toBe("workspace:*");
    expect(pkg.dependencies.next).toBe("^16.3.4");
    expect(result.get("apps/admin/package.json")).toBe(
      `${JSON.stringify({ name: "admin", dependencies: { "@acme/api": "workspace:*", next: "^16.3.4" } }, null, 2)}\n`,
    );
  });

  it("never includes the root package.json or any file outside the source prefix", () => {
    const vfs = createVfs();

    const result = extractAndRenameSubtree(vfs, "apps/web", "apps/admin", "admin");

    expect(result.has("package.json")).toBe(false);
    expect([...result.keys()].some((key) => key.startsWith("apps/web/"))).toBe(false);
    expect([...result.keys()].some((key) => key.startsWith("packages/"))).toBe(false);
  });

  it("does not mutate the source virtual file system", () => {
    const vfs = createVfs();
    const before = vfs.getAllFiles();
    const beforePkg = vfs.readFile("apps/web/package.json");

    extractAndRenameSubtree(vfs, "apps/web", "apps/admin", "admin");

    expect(vfs.getAllFiles()).toEqual(before);
    expect(vfs.readFile("apps/web/package.json")).toBe(beforePkg);
    expect(vfs.fileExists("apps/web/package.json")).toBe(true);
  });

  it("returns an empty map when the source prefix does not exist", () => {
    const vfs = createVfs();

    const result = extractAndRenameSubtree(vfs, "apps/does-not-exist", "apps/admin", "admin");

    expect(result.size).toBe(0);
  });

  it("keeps the original package name when newPackageName is omitted", () => {
    const vfs = createVfs();

    const result = extractAndRenameSubtree(vfs, "apps/web", "apps/admin");

    const pkg = JSON.parse(result.get("apps/admin/package.json") ?? "{}") as { name: string };
    expect(pkg.name).toBe("web");
  });
});

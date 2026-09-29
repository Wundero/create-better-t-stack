import { describe, expect, test } from "bun:test";

import {
  CLI_PACKAGE_NAME,
  getInstallCommand,
  getStackCommandBase,
  resolvePackageManager,
} from "../src/lib/cli-commands";
import { DEFAULT_STACK } from "../src/lib/constant";
import { generateStackCommand } from "../src/lib/stack-utils";

describe("cli command builder", () => {
  test("renders the scoped preview package for every supported package manager", () => {
    expect(getInstallCommand("bun")).toBe("bunx @wundero/bts@latest");
    expect(getInstallCommand("npm")).toBe("npx @wundero/bts@latest");
    expect(getInstallCommand("pnpm")).toBe("pnpm dlx @wundero/bts@latest");
  });

  test("never emits npm create for the scoped package", () => {
    const command = getStackCommandBase("npm");

    expect(command.startsWith("npx ")).toBe(true);
    expect(command).not.toContain("create");
  });

  test("defaults unknown package managers to bun and honors npm/pnpm", () => {
    expect(resolvePackageManager("yarn")).toBe("bun");
    expect(getStackCommandBase("pnpm")).toBe("pnpm dlx @wundero/bts@latest");
  });

  test("generateStackCommand uses the scoped package base", () => {
    expect(generateStackCommand(DEFAULT_STACK)).toStartWith(`bunx ${CLI_PACKAGE_NAME}@latest`);
  });
});

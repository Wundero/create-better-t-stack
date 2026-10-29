/**
 * Runs the local `@lingui/cli` for the commands it owns (`extract`, `compile`,
 * `check`). Spawning the CLI keeps its catalog semantics authoritative instead
 * of re-implementing them; `pending`/`apply` still run in-process against the
 * PO files so the JSON contract stays library-independent.
 *
 * The CLI spawns its subcommands through `process.argv[0]`, which breaks under
 * `bun x` (the child inherits `bun x` as `execArgv` and exits silently). The
 * scripts therefore resolve the local bin and run it with the current runtime.
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { packageRoot } from "./catalogs";

function resolveLinguiBin(): string | undefined {
  let dir = packageRoot;
  for (;;) {
    const candidate = path.join(dir, "node_modules", ".bin", "lingui");
    if (existsSync(candidate)) {
      try {
        return realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function runLinguiCli(args: string[]): number {
  const bin = resolveLinguiBin();
  const commandArgs = bin ? [bin, ...args] : ["x", "lingui", ...args];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: packageRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

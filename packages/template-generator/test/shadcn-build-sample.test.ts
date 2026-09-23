import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProjectConfig } from "@better-t-stack/types";

import { loadTemplates } from "../src/core/template-reader";
import { writeTree } from "../src/fs-writer";
import { generate } from "../src/generator";
import { createHttpShadcnRegistryClient } from "../src/shadcn";

const fixturesDir = fileURLToPath(new URL("./fixtures/shadcn/", import.meta.url));
const enabled = process.env.BTS_SHADCN_BUILD_SAMPLE === "1";

const BUILD_SAMPLE_CONFIG: ProjectConfig = {
  projectName: "shadcn-sample",
  projectDir: "/tmp/shadcn-sample",
  relativePath: "shadcn-sample",
  database: "none",
  orm: "none",
  backend: "none",
  runtime: "none",
  frontend: ["next"],
  addons: [],
  examples: [],
  auth: "none",
  payments: "none",
  git: false,
  packageManager: "bun",
  install: false,
  dbSetup: "none",
  api: "none",
  webDeploy: "none",
  serverDeploy: "none",
  shadcn: { preset: "b1x9M8ZeJW", base: "baseui" },
};

async function serveFixture(relativePath: string): Promise<Response | null> {
  try {
    const body = await readFile(`${fixturesDir}${relativePath}`, "utf8");
    return new Response(body, { headers: { "content-type": "application/json" } });
  } catch {
    return null;
  }
}

async function run(command: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  if (exitCode === 0) return;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  throw new Error(
    `command failed (${exitCode}): ${command.join(" ")}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
  );
}

describe("generated shadcn project build sample", () => {
  test.skipIf(!enabled)(
    "b1x9M8ZeJW baseui next installs and typechecks",
    async () => {
      const server = Bun.serve({
        port: 0,
        fetch: async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/init") {
            const base = url.searchParams.get("base") ?? "base";
            const style = url.searchParams.get("style") ?? "maia";
            const fixture = await serveFixture(`init/${base}-${style}.json`);
            return fixture ?? new Response("bad request", { status: 400 });
          }
          const match = /^\/r\/styles\/([^/]+)\/([^/]+)\.json$/.exec(url.pathname);
          if (match) {
            const style = match[1] ?? "";
            const name = match[2] ?? "";
            const fixture = await serveFixture(`styles/${style}/${name}.json`);
            return fixture ?? new Response("not found", { status: 404 });
          }
          return new Response("not found", { status: 404 });
        },
      });

      const dir = await mkdtemp(path.join(os.tmpdir(), "bts-shadcn-build-"));
      try {
        const templates = await loadTemplates();
        const result = await generate({
          config: BUILD_SAMPLE_CONFIG,
          templates,
          registry: createHttpShadcnRegistryClient({ baseUrl: `http://localhost:${server.port}` }),
        });
        expect(result.isOk()).toBe(true);
        if (!result.isOk()) return;

        const written = await writeTree(result.value, dir);
        expect(written.isOk()).toBe(true);
        if (!written.isOk()) return;

        await run(["bun", "install"], dir);
        await run(["bun", "run", "check-types"], path.join(dir, "packages/ui"));
      } finally {
        server.stop(true);
        await rm(dir, { recursive: true, force: true });
      }
    },
    1_800_000,
  );
});

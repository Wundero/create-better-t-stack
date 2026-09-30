/**
 * RED tests for issue #1096: the skills addon swallows transient git-clone
 * failures without retrying and without surfacing the underlying reason.
 *
 * Expected against the current (unfixed) production module:
 *  - S1 passes (control: a healthy source is invoked exactly once)
 *  - S2 fails: a transient failure is never retried (source invoked once, not twice)
 *  - S3 fails: no retry, no failure reason in the warning, no "some sources failed"
 *    message, no manual retry command
 *  - S4 fails: `stripAnsi` / `getInstallFailureReason` are not exported yet (Wave 2)
 *
 * S4 uses a namespace import instead of named imports on purpose: named imports of
 * the two future exports would make the WHOLE file fail to load, hiding the S1-S3
 * assertion failures. With a namespace import the module loads, S1-S3 run, and S4
 * fails as a missing-export assertion (plus TS2339 diagnostics until Wave 2).
 */
import { describe, expect, it, spyOn } from "bun:test";
import path from "node:path";

import fs from "fs-extra";

import * as skillsSetupModule from "../src/helpers/addons/skills-setup";
import type { ProjectConfig } from "../src/types";
import { runWithContextAsync } from "../src/utils/context";
import { cliLog } from "../src/utils/terminal-output";
import { SMOKE_DIR } from "./setup";

type SequenceOptions = {
  failTimes: number;
  failCode: number;
  errorText: string;
};

const SKILLS_SOURCE = "vercel/turborepo";
const SOURCE_COMMAND_FRAGMENT = `skills@latest add ${SKILLS_SOURCE}`;

function createProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectName: "test-app",
    projectDir: path.join(SMOKE_DIR, "skills-install-retry"),
    relativePath: ".",
    database: "sqlite",
    orm: "drizzle",
    backend: "hono",
    runtime: "bun",
    frontend: ["tanstack-router"],
    addons: ["none"],
    examples: ["none"],
    auth: "none",
    payments: "none",
    git: false,
    packageManager: "bun",
    install: false,
    dbSetup: "none",
    api: "trpc",
    webDeploy: "none",
    serverDeploy: "none",
    ...overrides,
  };
}

/**
 * Single explicitly configured source keeps the run deterministic: in silent mode the
 * production code installs ONLY configured selections, regardless of recommendations.
 */
function createSkillsConfig(projectDir: string): ProjectConfig {
  return createProjectConfig({
    projectDir,
    addons: ["skills"],
    addonOptions: {
      skills: {
        scope: "project",
        agents: ["codex"],
        selections: [{ source: SKILLS_SOURCE, skills: ["turborepo"] }],
      },
    },
  });
}

/**
 * Fake `bunx` that fails the first `failTimes` invocations, then succeeds.
 * Every invocation is appended to markerFile; a sibling `${markerFile}.count` file
 * tracks the invocation number so retries can be observed.
 */
async function writeFakeBunxSequence(
  binDir: string,
  markerFile: string,
  opts: SequenceOptions,
): Promise<void> {
  const bunxPath = path.join(binDir, "bunx");
  await fs.ensureDir(binDir);
  const script = `#!/bin/sh
printf '%s\\n' "$*" >> "${markerFile}"
count=0
if [ -f "${markerFile}.count" ]; then
  count=$(cat "${markerFile}.count")
fi
count=$((count + 1))
printf '%s' "$count" > "${markerFile}.count"
if [ "$count" -le ${opts.failTimes} ]; then
  cat >&2 <<'BTS_FAKE_BUNX_ERROR'
${opts.errorText}
BTS_FAKE_BUNX_ERROR
  exit ${opts.failCode}
fi
exit 0
`;
  await fs.writeFile(bunxPath, script);
  await fs.chmod(bunxPath, 0o755);
}

async function runWithFakeBunxSequence<T>(
  projectDir: string,
  callback: () => Promise<T>,
  opts: SequenceOptions,
): Promise<{ markerFile: string; result: T }> {
  const binDir = path.join(projectDir, ".fake-bin");
  const markerFile = path.join(projectDir, "runner.log");
  await fs.ensureDir(projectDir);
  await fs.remove(markerFile);
  await fs.remove(`${markerFile}.count`);
  await writeFakeBunxSequence(binDir, markerFile, opts);

  const previousPath = process.env.PATH;
  const previousSkipExternal = process.env.BTS_SKIP_EXTERNAL_COMMANDS;
  const previousTestMode = process.env.BTS_TEST_MODE;

  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  delete process.env.BTS_SKIP_EXTERNAL_COMMANDS;
  delete process.env.BTS_TEST_MODE;

  try {
    const result = await callback();
    return { markerFile, result };
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }

    if (previousSkipExternal === undefined) {
      delete process.env.BTS_SKIP_EXTERNAL_COMMANDS;
    } else {
      process.env.BTS_SKIP_EXTERNAL_COMMANDS = previousSkipExternal;
    }

    if (previousTestMode === undefined) {
      delete process.env.BTS_TEST_MODE;
    } else {
      process.env.BTS_TEST_MODE = previousTestMode;
    }
  }
}

/**
 * Captures user-facing output for the non-silent scenario. The spinner writes straight
 * to process.stdout and @clack's log (used by cliLog) does too, so spying the stream
 * methods captures both. cliLog methods are spied as well so the assertions do not
 * depend on the host TTY/color handling.
 */
async function captureRun<T>(callback: () => Promise<T>): Promise<{ result: T; output: string }> {
  const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  const warnSpy = spyOn(cliLog, "warn");
  const infoSpy = spyOn(cliLog, "info");
  const successSpy = spyOn(cliLog, "success");
  const messageSpy = spyOn(cliLog, "message");

  try {
    const result = await callback();
    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls]
      .map((call) => String(call[0]))
      .join("");
    const logged = [
      ...warnSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...successSpy.mock.calls,
      ...messageSpy.mock.calls,
    ]
      .map((call) => String(call[0]))
      .join("\n");
    return { result, output: `${written}\n${logged}` };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    successSpy.mockRestore();
    messageSpy.mockRestore();
  }
}

async function readRunnerLog(markerFile: string): Promise<string> {
  return (await fs.pathExists(markerFile)) ? fs.readFile(markerFile, "utf8") : "";
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// Mirrors the production failure shape: ANSI color codes + box-drawing chrome around a
// real error line, which is exactly the noise the extraction helper must strip.
const BUILD_NOISY_ERROR = "\u001b[31m│  Error: Failed to clone repository\u001b[0m\n";

describe("Skills install retry (#1096)", () => {
  it("installs a healthy explicitly configured source exactly once", async () => {
    const projectDir = path.join(SMOKE_DIR, "skills-retry-happy");
    await fs.remove(projectDir);

    const config = createSkillsConfig(projectDir);

    const { markerFile, result } = await runWithFakeBunxSequence(
      projectDir,
      () => runWithContextAsync({ silent: true }, () => skillsSetupModule.setupSkills(config)),
      { failTimes: 0, failCode: 99, errorText: "" },
    );

    expect(result.isOk()).toBe(true);
    expect(countOccurrences(await readRunnerLog(markerFile), SOURCE_COMMAND_FRAGMENT)).toBe(1);
  });

  it("retries a transiently failing source once and still succeeds", async () => {
    const projectDir = path.join(SMOKE_DIR, "skills-retry-transient");
    await fs.remove(projectDir);

    const config = createSkillsConfig(projectDir);

    const { markerFile, result } = await runWithFakeBunxSequence(
      projectDir,
      () => runWithContextAsync({ silent: true }, () => skillsSetupModule.setupSkills(config)),
      { failTimes: 1, failCode: 99, errorText: BUILD_NOISY_ERROR },
    );

    expect(result.isOk()).toBe(true);
    // Core RED assertion: current code invokes the runner once, so this is 1 today.
    expect(countOccurrences(await readRunnerLog(markerFile), SOURCE_COMMAND_FRAGMENT)).toBe(2);
  });

  it("surfaces the failure reason, failure-aware message, and manual retry commands", async () => {
    const projectDir = path.join(SMOKE_DIR, "skills-retry-persistent");
    await fs.remove(projectDir);

    const config = createSkillsConfig(projectDir);

    const captured = await captureRun(() =>
      runWithFakeBunxSequence(
        projectDir,
        () => runWithContextAsync({ silent: false }, () => skillsSetupModule.setupSkills(config)),
        { failTimes: 2, failCode: 99, errorText: BUILD_NOISY_ERROR },
      ),
    );

    const { markerFile, result } = captured.result;
    const output = skillsSetupModule.stripAnsi(captured.output);

    expect(result.isOk()).toBe(true);
    expect(output).toMatch(/some sources failed/i);
    expect(output).toContain("Failed to clone repository");
    // Manual retry command; `@latest` is optional so either command spelling matches.
    expect(output).toMatch(/skills(?:@latest)? add vercel\/turborepo/);
    expect(countOccurrences(await readRunnerLog(markerFile), SOURCE_COMMAND_FRAGMENT)).toBe(2);
  });

  it("exports stripAnsi and getInstallFailureReason for failure diagnostics", () => {
    const { stripAnsi, getInstallFailureReason } = skillsSetupModule;

    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");

    expect(
      getInstallFailureReason({
        stderr: "\u001b[31m│  Error: Failed to clone repository\u001b[0m\n",
        stdout: "",
      }),
    ).toBe("Failed to clone repository");

    expect(getInstallFailureReason({ stderr: "all good\n", stdout: "done\n" })).toBeUndefined();
    expect(getInstallFailureReason(undefined)).toBeUndefined();
    expect(getInstallFailureReason({})).toBeUndefined();
    expect(getInstallFailureReason("command failed with exit code 99")).toBeUndefined();

    const longMatchingLine = `Error: ${"x".repeat(500)}`;
    const sliced = getInstallFailureReason({ stderr: longMatchingLine, stdout: "" });
    expect((sliced ?? "").length).toBeLessThanOrEqual(200);
  });
});

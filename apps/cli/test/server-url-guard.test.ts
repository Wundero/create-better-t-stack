import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

async function generateNextDockerProject(): Promise<string> {
  const result = await createVirtual({
    projectName: "server-url-guard",
    frontend: ["next"],
    backend: "hono",
    runtime: "bun",
    api: "trpc",
    auth: "better-auth",
    database: "sqlite",
    orm: "drizzle",
    dbSetup: "none",
    webDeploy: "docker",
    serverDeploy: "docker",
    install: false,
    git: false,
    packageManager: "bun",
  });

  expect(result.isOk()).toBe(true);

  if (result.isErr()) {
    throw result.error;
  }

  const files = collectFiles(result.value.root, result.value.root.path);
  return files.get("apps/web/src/utils/trpc.ts") ?? "";
}

/**
 * Slice out the emitted `getServerUrl` function by brace matching so it can be
 * evaluated in isolation, then transpile the TS source down to runnable JS.
 */
function extractGetServerUrl(source: string): (url: string | undefined) => string {
  const start = source.indexOf("function getServerUrl(");
  if (start === -1) {
    throw new Error("getServerUrl function not found in generated source");
  }
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error("could not locate end of getServerUrl function");
  }
  const functionSource = source.slice(start, end);
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(functionSource);
  // Controlled globals: `window` undefined (server) and `globalThis.process`
  // absent, so the process-env lookup yields undefined and the guard is reached.
  const evaluate = new Function("window", "globalThis", `${executable}\nreturn getServerUrl;`);
  return evaluate(undefined, {}) as (url: string | undefined) => string;
}

describe("getServerUrl guard", () => {
  it("emits a nullable-aware signature", async () => {
    const source = await generateNextDockerProject();
    expect(source).toMatch(/function getServerUrl\(url: string \| undefined\)/);
  });

  it("throws a clear error before dereferencing the url", async () => {
    const source = await generateNextDockerProject();
    expect(source).toContain("throw new Error(");
    const throwIndex = source.indexOf("throw new Error(");
    // The SERVER_URL early-return block runs first by design and legitimately
    // calls `processEnv.SERVER_URL.endsWith(...)`, so the guard only needs to
    // precede the dereference of the possibly-undefined `url` argument.
    const urlDerefIndex = source.indexOf("url.endsWith(");
    expect(throwIndex).toBeGreaterThan(-1);
    expect(urlDerefIndex).toBeGreaterThan(-1);
    expect(throwIndex).toBeLessThan(urlDerefIndex);
  });

  it("throws an Error naming getServerUrl when called with undefined", async () => {
    const source = await generateNextDockerProject();
    const getServerUrl = extractGetServerUrl(source);
    expect(() => getServerUrl(undefined)).toThrow(/getServerUrl/);
  });
});

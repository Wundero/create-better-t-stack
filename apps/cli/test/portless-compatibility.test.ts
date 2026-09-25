import { describe, expect, it } from "bun:test";

import { supportsPortlessMode } from "../../../packages/types/src/compatibility";
import {
  BetterTStackConfigSchema,
  CreateInputSchema,
  ProjectConfigSchema,
} from "../../../packages/types/src/schemas";
import type { ProjectConfig } from "../src/types";
import { validatePortlessCompatibility } from "../src/utils/compatibility-rules";
import {
  validateConfigForProgrammaticUse,
  validateFullConfig,
} from "../src/utils/config-validation";

const PROJECT_CONFIG = {
  projectName: "portless-app",
  projectDir: "/tmp/portless-app",
  relativePath: "../portless-app",
  database: "sqlite",
  orm: "drizzle",
  backend: "hono",
  runtime: "bun",
  frontend: ["next"],
  addons: ["none"],
  examples: ["none"],
  auth: "none",
  payments: "none",
  git: true,
  packageManager: "bun",
  install: true,
  dbSetup: "none",
  api: "trpc",
  webDeploy: "none",
  serverDeploy: "none",
} as const;

type PortlessInput = Parameters<typeof supportsPortlessMode>[0];

const ALLOWED_STACK: PortlessInput = {
  frontend: ["next"],
  addons: [],
  backend: "hono",
  runtime: "bun",
  webDeploy: "none",
  serverDeploy: "none",
};

describe("portless option schemas", () => {
  it("accepts portless: true and portless omitted in CreateInputSchema", () => {
    const withPortless = CreateInputSchema.safeParse({ projectName: "app", portless: true });
    const withoutPortless = CreateInputSchema.safeParse({ projectName: "app" });

    expect(withPortless.success).toBe(true);
    expect(withPortless.success && withPortless.data.portless).toBe(true);
    expect(withoutPortless.success).toBe(true);
    expect(withoutPortless.success && withoutPortless.data.portless).toBeUndefined();
  });

  it("accepts portless: true and portless omitted in ProjectConfigSchema", () => {
    const withPortless = ProjectConfigSchema.safeParse({ ...PROJECT_CONFIG, portless: true });
    const withoutPortless = ProjectConfigSchema.safeParse(PROJECT_CONFIG);

    expect(withPortless.success).toBe(true);
    expect(withPortless.success && withPortless.data.portless).toBe(true);
    expect(withoutPortless.success).toBe(true);
    expect(withoutPortless.success && withoutPortless.data.portless).toBeUndefined();
  });

  it("accepts portless: true and portless omitted in BetterTStackConfigSchema", () => {
    const base = {
      ...PROJECT_CONFIG,
      version: "0.0.0",
      createdAt: new Date(0).toISOString(),
    };
    const withPortless = BetterTStackConfigSchema.safeParse({ ...base, portless: true });
    const withoutPortless = BetterTStackConfigSchema.safeParse(base);

    expect(withPortless.success).toBe(true);
    expect(withPortless.success && withPortless.data.portless).toBe(true);
    expect(withoutPortless.success).toBe(true);
    expect(withoutPortless.success && withoutPortless.data.portless).toBeUndefined();
  });
});

describe("supportsPortlessMode", () => {
  it("allows a representative web stack", () => {
    expect(supportsPortlessMode(ALLOWED_STACK)).toBe(true);
  });

  it("denies each incompatible selection", () => {
    const deniedCases: { name: string; input: PortlessInput }[] = [
      { name: "native frontend", input: { ...ALLOWED_STACK, frontend: ["native-bare"] } },
      { name: "tauri addon", input: { ...ALLOWED_STACK, addons: ["tauri"] } },
      { name: "electrobun addon", input: { ...ALLOWED_STACK, addons: ["electrobun"] } },
      { name: "convex backend", input: { ...ALLOWED_STACK, backend: "convex" } },
      { name: "workers runtime", input: { ...ALLOWED_STACK, runtime: "workers" } },
      { name: "docker webDeploy", input: { ...ALLOWED_STACK, webDeploy: "docker" } },
      { name: "docker serverDeploy", input: { ...ALLOWED_STACK, serverDeploy: "docker" } },
    ];

    for (const { name, input } of deniedCases) {
      expect(supportsPortlessMode(input), name).toBe(false);
    }
  });
});

const PORTLESS_RULE_CONFIG = {
  frontend: ["next"],
  addons: [],
  backend: "hono",
  runtime: "bun",
  webDeploy: "none",
  serverDeploy: "none",
  portless: true,
} satisfies Partial<ProjectConfig>;

const PORTLESS_FULL_CONFIG = {
  ...PORTLESS_RULE_CONFIG,
  projectName: "portless-app",
  projectDir: "/tmp/portless-app",
  relativePath: "../portless-app",
  database: "sqlite",
  orm: "drizzle",
  examples: ["none"],
  auth: "none",
  payments: "none",
  dbSetup: "none",
  api: "trpc",
} satisfies Partial<ProjectConfig>;

const PORTLESS_DENIED_CASES: {
  name: string;
  overrides: Partial<ProjectConfig>;
  message: string;
}[] = [
  {
    name: "native frontend",
    overrides: { frontend: ["native-bare"] },
    message:
      "Portless dev mode is not compatible with the native frontend 'native-bare'. Remove --portless or choose a different frontend.",
  },
  {
    name: "tauri addon",
    overrides: { addons: ["tauri"] },
    message:
      "Portless dev mode is not compatible with the 'tauri' addon. Remove --portless or choose a different addon.",
  },
  {
    name: "electrobun addon",
    overrides: { addons: ["electrobun"] },
    message:
      "Portless dev mode is not compatible with the 'electrobun' addon. Remove --portless or choose a different addon.",
  },
  {
    name: "convex backend",
    overrides: { backend: "convex" },
    message:
      "Portless dev mode is not compatible with the Convex backend. Remove --portless or choose a different backend.",
  },
  {
    name: "workers runtime",
    overrides: { runtime: "workers", serverDeploy: "cloudflare" },
    message:
      "Portless dev mode is not compatible with the Cloudflare Workers runtime. Remove --portless or choose a different runtime.",
  },
  {
    name: "docker web deploy",
    overrides: { webDeploy: "docker" },
    message:
      "Portless dev mode is not compatible with '--web-deploy docker'. Remove --portless or choose a different deployment.",
  },
  {
    name: "docker server deploy",
    overrides: { serverDeploy: "docker" },
    message:
      "Portless dev mode is not compatible with '--server-deploy docker'. Remove --portless or choose a different deployment.",
  },
];

describe("validatePortlessCompatibility", () => {
  it("allows a representative portless stack", () => {
    expect(validatePortlessCompatibility(PORTLESS_RULE_CONFIG).isOk()).toBe(true);
  });

  it("skips validation when portless is not enabled", () => {
    const result = validatePortlessCompatibility({
      ...PORTLESS_RULE_CONFIG,
      portless: undefined,
      frontend: ["native-bare"],
      addons: ["tauri"],
    });

    expect(result.isOk()).toBe(true);
  });

  it("reports the exact reason for each denied selection", () => {
    for (const { name, overrides, message } of PORTLESS_DENIED_CASES) {
      const result = validatePortlessCompatibility({ ...PORTLESS_RULE_CONFIG, ...overrides });

      expect(result.isErr(), name).toBe(true);
      if (result.isErr()) {
        expect(result.error.message, name).toBe(message);
      }
    }
  });
});

describe("portless validation wiring", () => {
  it("enforces portless compatibility in validateFullConfig", () => {
    for (const { name, overrides, message } of PORTLESS_DENIED_CASES) {
      const result = validateFullConfig(
        { ...PORTLESS_FULL_CONFIG, ...overrides },
        new Set(["portless"]),
        {},
      );

      expect(result.isErr(), name).toBe(true);
      if (result.isErr()) {
        expect(result.error.message, name).toBe(message);
      }
    }
  });

  it("accepts the allowed stack through validateFullConfig", () => {
    expect(validateFullConfig(PORTLESS_FULL_CONFIG, new Set(["portless"]), {}).isOk()).toBe(true);
  });

  it("enforces portless compatibility in validateConfigForProgrammaticUse", () => {
    for (const { name, overrides, message } of PORTLESS_DENIED_CASES) {
      const result = validateConfigForProgrammaticUse({ ...PORTLESS_FULL_CONFIG, ...overrides });

      expect(result.isErr(), name).toBe(true);
      if (result.isErr()) {
        expect(result.error.message, name).toBe(message);
      }
    }
  });

  it("accepts the allowed stack through validateConfigForProgrammaticUse", () => {
    expect(validateConfigForProgrammaticUse(PORTLESS_FULL_CONFIG).isOk()).toBe(true);
  });
});

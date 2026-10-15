import { describe, expect, it } from "bun:test";

import { getAllJsonSchemas } from "@better-t-stack/types/json-schema";
import { createRouterClient } from "@orpc/server";
import { z } from "zod";

import { router } from "../src/index";

type CliCommandJson = {
  name: string;
  description?: string;
  options: { name: string; choices?: string[] }[];
  commands?: CliCommandJson[];
};

const cliOptionSchema = z.object({
  name: z.string(),
  choices: z.array(z.string()).optional(),
});

const cliCommandSchema: z.ZodType<CliCommandJson> = z.lazy(() =>
  z.object({
    name: z.string(),
    description: z.string().optional(),
    options: z.array(cliOptionSchema),
    commands: z.array(cliCommandSchema).optional(),
  }),
);

const cliSchema = z.object({
  commands: z.array(cliCommandSchema),
});
const allSchemas = z.object({ cli: cliSchema, schemas: z.record(z.string(), z.unknown()) });

const caller = createRouterClient(router);

describe("Schema command", () => {
  it("returns full schema payload for 'all'", async () => {
    const result = allSchemas.parse(await caller.schema({ name: "all" }));

    expect(result).toHaveProperty("cli");
    expect(result).toHaveProperty("schemas");
    expect(result.schemas).toHaveProperty("createInput");
    expect(result.schemas).toHaveProperty("addInput");
    expect(result.schemas).toHaveProperty("addonOptions");
    expect(result.schemas).toHaveProperty("dbSetupOptions");
    expect(Array.isArray(result.cli.commands)).toBe(true);
  });

  it("exposes scaffold and generate schemas in the full schema payload", async () => {
    const result = allSchemas.parse(await caller.schema({ name: "all" }));

    expect(result.schemas).toHaveProperty("scaffoldAppInput");
    expect(result.schemas).toHaveProperty("scaffoldPackageInput");
    expect(result.schemas).toHaveProperty("generateInput");

    const schemaKeys = Object.keys(getAllJsonSchemas());
    expect(schemaKeys).toContain("scaffoldAppInput");
    expect(schemaKeys).toContain("scaffoldPackageInput");
    expect(schemaKeys).toContain("generateInput");
  });

  it("returns a specific schema payload", async () => {
    const result = await caller.schema({ name: "createInput" });

    expect(result).toHaveProperty("type", "object");
    expect(result).toHaveProperty("properties");
  });

  it("includes agent-focused commands in CLI introspection", async () => {
    const result = cliSchema.parse(await caller.schema({ name: "cli" }));
    const commandNames = result.commands.map((command) => command.name);

    expect(commandNames).toContain("create-json");
    expect(commandNames).toContain("add-json");
    expect(commandNames).toContain("schema");
  });

  it("exposes the nested generate command tree and generate-json", async () => {
    const result = cliSchema.parse(await caller.schema({ name: "cli" }));
    const generateCommand = result.commands.find((command) => command.name === "generate");

    expect(generateCommand).toBeDefined();
    expect(generateCommand?.commands?.map((command) => command.name).sort()).toEqual([
      "app",
      "package",
    ]);

    const appCommand = generateCommand?.commands?.find((command) => command.name === "app");
    const packageCommand = generateCommand?.commands?.find((command) => command.name === "package");
    expect(appCommand?.description).toContain("Generate a new app");
    expect(packageCommand?.description).toContain("Generate a new workspace package");

    const commandNames = result.commands.map((command) => command.name);
    expect(commandNames).toContain("generate-json");
  });

  it("describes the post-create launcher option", async () => {
    const result = cliSchema.parse(await caller.schema({ name: "cli" }));
    const createCommand = result.commands.find((command) => command.name === "create");
    const openOption = createCommand?.options.find((option) => option.name === "open");

    expect(openOption?.choices).toContain("vscode");
    expect(openOption?.choices).toContain("codex");
    expect(openOption?.choices).toContain("claude-code");
    expect(openOption?.choices).toContain("opencode");
    expect(openOption?.choices).toContain("pi");
    expect(openOption?.choices).toContain("goose");
    expect(openOption?.choices).toContain("continue");
  });
});

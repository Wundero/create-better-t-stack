import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import path from "node:path";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { createBtsMcpServer } from "../src/mcp";
import { oracleCompatibility } from "./oracles/i18n";
import { SMOKE_DIR } from "./setup";

interface JsonSchemaView {
  type?: string;
  properties?: Record<string, JsonSchemaView>;
}

async function connectInMemoryClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createBtsMcpServer();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "mcp-i18n-test-client", version: "0.0.0" },
    {
      capabilities: {},
    },
  );
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

function getExplicitCreateInput(projectPath: string) {
  return {
    projectName: projectPath,
    frontend: ["next"] as const,
    backend: "hono" as const,
    runtime: "bun" as const,
    database: "none" as const,
    orm: "none" as const,
    api: "trpc" as const,
    auth: "none" as const,
    payments: "none" as const,
    addons: [] as const,
    examples: [] as const,
    git: false,
    packageManager: "bun" as const,
    install: false,
    dbSetup: "none" as const,
    webDeploy: "none" as const,
    serverDeploy: "none" as const,
    emailRenderer: "none" as const,
    emailDeploy: "none" as const,
  };
}

function getToolText(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

describe("MCP i18n contract", () => {
  let cleanups: Array<() => Promise<void>> = [];

  beforeEach(async () => {
    process.env.BTS_SKIP_EXTERNAL_COMMANDS = "1";
    process.env.BTS_TEST_MODE = "1";
  });

  afterEach(async () => {
    for (const cleanup of cleanups.reverse()) {
      await Promise.race([
        cleanup(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
        }),
      ]);
    }
    cleanups = [];
  });

  it("exposes i18n in the create contract guidance", async () => {
    const { client, cleanup } = await connectInMemoryClient();
    cleanups.push(cleanup);

    const result = await client.callTool({
      name: "bts_get_stack_guidance",
      arguments: {},
    });

    const payload = result.structuredContent as {
      ok: boolean;
      data?: {
        createContract?: {
          requiresExplicitFields?: string[];
          optionalFields?: string[];
        };
        fieldNotes?: Record<string, string>;
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data?.createContract?.requiresExplicitFields).toContain("i18n");
    expect(payload.data?.createContract?.optionalFields).toContain("i18nOptions");
    expect(payload.data?.fieldNotes?.i18n).toContain("none");
  });

  it("exposes i18n and i18nOptions in the plan, create and add tool schemas", async () => {
    const { client, cleanup } = await connectInMemoryClient();
    cleanups.push(cleanup);

    const result = await client.listTools();
    const toolsByName = new Map(result.tools.map((tool) => [tool.name, tool]));

    for (const toolName of [
      "bts_plan_project",
      "bts_create_project",
      "bts_plan_addons",
      "bts_add_addons",
    ]) {
      const schema = toolsByName.get(toolName)?.inputSchema as JsonSchemaView | undefined;
      expect(schema?.properties).toHaveProperty("i18n");
      expect(schema?.properties).toHaveProperty("i18nOptions");
    }
  });

  it("serves the i18n and i18nOptions schema names", async () => {
    const { client, cleanup } = await connectInMemoryClient();
    cleanups.push(cleanup);

    for (const name of ["i18n", "i18nOptions"]) {
      const result = await client.callTool({ name: "bts_get_schema", arguments: { name } });
      const payload = result.structuredContent as { ok?: boolean };

      expect(result.isError ?? false).toBe(false);
      expect(payload.ok).toBe(true);
    }
  });

  it("returns the shared reason for incompatible i18n combinations", async () => {
    const { client, cleanup } = await connectInMemoryClient();
    cleanups.push(cleanup);

    const result = await client.callTool({
      name: "bts_plan_project",
      arguments: {
        ...getExplicitCreateInput(path.join(SMOKE_DIR, "mcp-i18n-incompatible")),
        frontend: ["svelte"],
        api: "orpc",
        i18n: "lingui",
      },
    });

    const expectedReason = oracleCompatibility("lingui", ["svelte"]).reason;

    expect(result.isError).toBe(true);
    expect(expectedReason).toBeDefined();
    if (expectedReason !== undefined) {
      expect(getToolText(result)).toContain(expectedReason);
    }
  });

  it("returns the shared reason from the same oracle for another library", async () => {
    const { client, cleanup } = await connectInMemoryClient();
    cleanups.push(cleanup);

    const result = await client.callTool({
      name: "bts_plan_project",
      arguments: {
        ...getExplicitCreateInput(path.join(SMOKE_DIR, "mcp-i18n-incompatible-wuchale")),
        frontend: ["nuxt"],
        api: "orpc",
        i18n: "wuchale",
      },
    });

    const expectedReason = oracleCompatibility("wuchale", ["nuxt"]).reason;

    expect(result.isError).toBe(true);
    expect(expectedReason).toBeDefined();
    if (expectedReason !== undefined) {
      expect(getToolText(result)).toContain(expectedReason);
    }
  });

  it("plans an i18n project with normalized options", async () => {
    const { client, cleanup } = await connectInMemoryClient();
    cleanups.push(cleanup);

    const result = await client.callTool({
      name: "bts_plan_project",
      arguments: {
        ...getExplicitCreateInput(path.join(SMOKE_DIR, "mcp-i18n-plan")),
        i18n: "lingui",
        i18nOptions: {
          sourceLocale: "en",
          locales: ["en", "fr"],
          routing: { strategy: "prefix", prefixDefaultLocale: false },
          translateSkill: false,
        },
      },
    });

    const payload = result.structuredContent as {
      ok: boolean;
      data?: {
        projectConfig?: {
          i18n?: string;
          i18nOptions?: { locales?: string[]; sourceLocale?: string; translateSkill?: boolean };
        };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data?.projectConfig?.i18n).toBe("lingui");
    expect(payload.data?.projectConfig?.i18nOptions?.locales).toEqual(["en", "fr"]);
    expect(payload.data?.projectConfig?.i18nOptions?.sourceLocale).toBe("en");
    expect(payload.data?.projectConfig?.i18nOptions?.translateSkill).toBe(false);
  });
});

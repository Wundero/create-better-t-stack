/**
 * Runtime spike: prove `trpc-cli@0.16.0` (apps/cli/node_modules) supports
 *   (a) NESTED oRPC subrouters rendered as subcommands, and
 *   (b) procedures with `jsonInput: "always"`.
 *
 * Deliberately isolated from `../src/index.ts` and from `@better-t-stack/*`:
 * the router below is built from `@orpc/server` + `trpc-cli` + `zod` only, so
 * NO repo build is required to run this test.
 *
 * Findings recorded here (see assertions below):
 *   - Nested routers ARE supported. `os.router({ generate: os.router({ app, package }) })`
 *     emits a parent command `generate` whose children are `app` and `package`.
 *     Exact runtime spelling is space-separated: `spike generate app` /
 *     `spike generate package` (NOT `generate-app` / `generate-package`).
 *   - `jsonInput: "always"` IS honored. The observable in `toJSON()` is a
 *     required `--json <json>` option on the leaf command (the `jsonInput` meta
 *     value itself is not serialized by `commandToJSON`). Invoking
 *     `generate-json --json '{"target":"t"}'` runs the handler.
 *   - Programmatic invocation works via `cli.buildProgram()` +
 *     `program.parseAsync([...], { from: "user" })`; the handler return value is
 *     stashed on `program.__ran.at(-1).__result`.
 *   - Recommendation: prefer nested routers for grouping
 *     (`generate` → `app` / `package`). The flat fallback
 *     (`generate-app` / `generate-package`) is NOT required by trpc-cli.
 */

import { describe, expect, it } from "bun:test";

import { os } from "@orpc/server";
import { createCli, type TrpcCliMeta } from "trpc-cli";
import z from "zod";

type CommandJson = {
  name: string;
  description?: string;
  arguments: { name: string }[];
  options: { name: string; flags?: string; required: boolean }[];
  commands: CommandJson[];
};

const command = os.$meta<TrpcCliMeta>({});

const generate = os.router({
  app: command
    .meta({ description: "spike app" })
    .input(z.object({ name: z.string() }))
    .handler(({ input }) => input),
  package: command
    .meta({ description: "spike package" })
    .input(z.object({ name: z.string() }))
    .handler(({ input }) => input),
});

const router = os.router({
  generate,
  generateJson: command
    .meta({ description: "json", jsonInput: "always" })
    .input(z.object({ target: z.string() }))
    .handler(({ input }) => input),
});

const cli = createCli({ router, name: "spike", version: "0.0.0" });

type BuiltProgram = ReturnType<typeof cli.buildProgram>;
type ProgramWithRan = BuiltProgram & { __ran: { __result?: unknown }[] };

function findCommand(commands: CommandJson[], name: string): CommandJson | undefined {
  return commands.find((c) => c.name === name);
}

describe("trpc-cli nested router + jsonInput spike", () => {
  const schema = cli.toJSON();

  // Printed once so the raw shape is visible in test output.
  console.log("spike toJSON()", JSON.stringify(schema, null, 2));

  it("renders a nested subrouter as a parent command with child subcommands", () => {
    const parent = findCommand(schema.commands as CommandJson[], "generate");

    expect(parent).toBeDefined();
    expect(parent?.commands.map((c) => c.name)).toEqual(["app", "package"]);

    const appCmd = findCommand(parent?.commands ?? [], "app");
    const packageCmd = findCommand(parent?.commands ?? [], "package");
    expect(appCmd?.description).toBe("spike app");
    expect(packageCmd?.description).toBe("spike package");
  });

  it("does NOT expose the nested procedures as flat generate-app / generate-package commands", () => {
    const names = (schema.commands as CommandJson[]).map((c) => c.name);
    expect(names).not.toContain("generate-app");
    expect(names).not.toContain("generate-package");
  });

  it('honors jsonInput: "always" via a required --json option on the leaf command', () => {
    const jsonCmd = findCommand(schema.commands as CommandJson[], "generate-json");
    expect(jsonCmd).toBeDefined();

    const jsonOption = jsonCmd?.options.find((o) => o.name === "json");
    expect(jsonOption).toBeDefined();
    expect(jsonOption?.required).toBe(true);
    expect(jsonOption?.flags).toBe("--json <json>");
  });

  it("supports programmatic invocation of a nested leaf command", async () => {
    const program = cli.buildProgram() as ProgramWithRan;
    await program.parseAsync(["generate", "package", "--name", "x"], { from: "user" });

    expect(program.__ran.at(-1)?.__result).toEqual({ name: "x" });
  });

  it('supports programmatic invocation of a jsonInput: "always" command', async () => {
    const program = cli.buildProgram() as ProgramWithRan;
    await program.parseAsync(["generate-json", "--json", JSON.stringify({ target: "t" })], {
      from: "user",
    });

    expect(program.__ran.at(-1)?.__result).toEqual({ target: "t" });
  });
});

import { writeSync } from "node:fs";

import { lineByLineLogger } from "trpc-cli";

import { createBtsCli } from "./index";
import { startBtsMcpServer } from "./mcp";

const [, , command, ...args] = process.argv;

// trpc-cli exits immediately after logging. Large JSON payloads can exceed the
// pipe buffer, so async console writes are cut off on exit. Write
// synchronously and retry partial/EAGAIN writes to flush the whole payload.
function writeAll(fd: 1 | 2, value: string): void {
  const data = Buffer.from(value);
  let offset = 0;
  while (offset < data.length) {
    try {
      offset += writeSync(fd, data, offset, data.length - offset);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EAGAIN") throw error;
    }
  }
}

const cliLogger = lineByLineLogger({
  info: (...values: unknown[]) => writeAll(1, `${values.map(String).join(" ")}\n`),
  error: (...values: unknown[]) => writeAll(2, `${values.map(String).join(" ")}\n`),
});

if (command === "mcp") {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: create-better-t-stack mcp

Start the Better T Stack MCP server over stdio.

This command is intended to be launched by an MCP client, for example:
  create-better-t-stack mcp`);
    process.exit(0);
  }

  await startBtsMcpServer();
} else {
  await createBtsCli().run({ logger: cliLogger });
}

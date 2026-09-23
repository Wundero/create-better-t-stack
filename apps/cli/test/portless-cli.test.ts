import { describe, expect, it } from "bun:test";

import { router } from "../src/index";
import { processFlags } from "../src/utils/config-processing";

const createInputSchema = router.create["~orpc"].inputSchema;

function parseCreateInput(value: unknown) {
  if (!createInputSchema) {
    throw new Error("create procedure is missing its input schema");
  }
  return createInputSchema.safeParse(value);
}

describe("portless CLI flag plumbing", () => {
  it("accepts --portless on the create CLI input schema", () => {
    const result = parseCreateInput(["my-app", { portless: true }]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[1].portless).toBe(true);
  });

  it("keeps portless optional when the flag is omitted", () => {
    const result = parseCreateInput(["my-app", {}]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[1].portless).toBeUndefined();
  });

  it("rejects non-boolean portless values", () => {
    const result = parseCreateInput(["my-app", { portless: "yes" }]);

    expect(result.success).toBe(false);
  });

  it("maps portless into the partial project config", () => {
    expect(processFlags({ portless: true }).portless).toBe(true);
    expect(processFlags({ portless: false }).portless).toBe(false);
    expect(processFlags({}).portless).toBeUndefined();
  });
});

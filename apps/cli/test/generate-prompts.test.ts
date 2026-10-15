import { describe, expect, it } from "bun:test";

import { resolveGenerateSelection, validateAppName } from "../src/prompts/generate";

describe("resolveGenerateSelection", () => {
  it("maps a web category to a frontend selection", () => {
    expect(resolveGenerateSelection({ category: "frontend", framework: "next" })).toEqual({
      kind: "frontend",
      frontend: "next",
    });
  });

  it("maps a mobile category to a frontend selection", () => {
    expect(resolveGenerateSelection({ category: "mobile", framework: "native-uniwind" })).toEqual({
      kind: "mobile",
      frontend: "native-uniwind",
    });
  });

  it("maps a backend category to a backend selection", () => {
    expect(resolveGenerateSelection({ category: "backend", framework: "hono" })).toEqual({
      kind: "backend",
      backend: "hono",
    });
  });

  it("rejects an ungeneatable backend framework", () => {
    expect(() => resolveGenerateSelection({ category: "backend", framework: "convex" })).toThrow(
      "Invalid backend framework: convex",
    );
  });

  it("rejects a native framework under the frontend category", () => {
    expect(() =>
      resolveGenerateSelection({ category: "frontend", framework: "native-bare" }),
    ).toThrow("Invalid frontend framework: native-bare");
  });

  it("rejects a web framework under the mobile category", () => {
    expect(() => resolveGenerateSelection({ category: "mobile", framework: "next" })).toThrow(
      "Invalid mobile framework: next",
    );
  });

  it("rejects the none placeholder", () => {
    expect(() => resolveGenerateSelection({ category: "frontend", framework: "none" })).toThrow(
      "Invalid frontend framework: none",
    );
  });
});

describe("validateAppName", () => {
  it("accepts lowercase npm-style names", () => {
    expect(validateAppName("admin")).toBeUndefined();
    expect(validateAppName("admin-app")).toBeUndefined();
  });

  it("rejects uppercase names with the schema message", () => {
    expect(validateAppName("Admin")).toBe("App name must be an unscoped lowercase npm name");
  });

  it("rejects path traversal names", () => {
    expect(validateAppName("../x")).toBe("App name must be an unscoped lowercase npm name");
  });

  it("rejects the reserved node_modules name", () => {
    expect(validateAppName("node_modules")).toBe("App name is reserved");
  });
});

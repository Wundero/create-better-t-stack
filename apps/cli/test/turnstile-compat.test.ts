import { describe, expect, it } from "bun:test";

import {
  AddonsSchema,
  validateAddonCompatibility,
  validateTurnstileCompatibility,
  type Auth,
  type Backend,
  type Frontend,
  type Runtime,
} from "@better-t-stack/types";

import { validateAddonsAgainstConfig } from "../src/utils/compatibility-rules";

describe("Turnstile addon compatibility", () => {
  it("accepts turnstile in AddonsSchema", () => {
    expect(AddonsSchema.safeParse("turnstile").success).toBe(true);
    expect(AddonsSchema.options).toContain("turnstile");
  });

  describe("validateAddonCompatibility", () => {
    const accepted: Array<[string, Frontend, Auth, Backend, Runtime]> = [
      ["next fullstack", "next", "better-auth", "self", "none"],
      ["svelte + hono workers", "svelte", "better-auth", "hono", "workers"],
      ["tanstack-router + hono workers", "tanstack-router", "better-auth", "hono", "workers"],
    ];

    for (const [name, frontend, auth, backend, runtime] of accepted) {
      it(`accepts ${name}`, () => {
        const result = validateAddonCompatibility("turnstile", [frontend], auth, backend, runtime);
        expect(result.isCompatible).toBe(true);
      });
    }

    const rejected: Array<[string, Frontend[], Auth, Backend, Runtime, string]> = [
      ["auth none", ["next"], "none", "self", "none", "requires Better Auth"],
      ["auth clerk", ["next"], "clerk", "self", "none", "requires Better Auth"],
      ["convex backend", ["next"], "better-auth", "convex", "none", "Hono backend"],
      ["none backend", ["next"], "better-auth", "none", "none", "Hono backend"],
      ["express backend", ["tanstack-router"], "better-auth", "express", "node", "Hono backend"],
      ["hono without workers", ["svelte"], "better-auth", "hono", "bun", "'workers' runtime"],
      ["native frontend", ["native-bare"], "better-auth", "self", "none", "web frontends only"],
    ];

    for (const [name, frontends, auth, backend, runtime, reason] of rejected) {
      it(`rejects ${name}`, () => {
        const result = validateAddonCompatibility("turnstile", frontends, auth, backend, runtime);
        expect(result.isCompatible).toBe(false);
        if (!result.isCompatible) {
          expect(result.reason).toContain(reason);
        }
      });
    }
  });

  describe("validateTurnstileCompatibility", () => {
    it("accepts cloudflare web + self backend", () => {
      const result = validateTurnstileCompatibility({
        webDeploy: "cloudflare",
        serverDeploy: "none",
        backend: "self",
      });
      expect(result.isCompatible).toBe(true);
    });

    it("accepts cloudflare web + cloudflare server + hono", () => {
      const result = validateTurnstileCompatibility({
        webDeploy: "cloudflare",
        serverDeploy: "cloudflare",
        backend: "hono",
      });
      expect(result.isCompatible).toBe(true);
    });

    it("rejects webDeploy none", () => {
      const result = validateTurnstileCompatibility({
        webDeploy: "none",
        serverDeploy: "none",
        backend: "self",
      });
      expect(result.isCompatible).toBe(false);
      if (!result.isCompatible) {
        expect(result.reason).toContain("--web-deploy cloudflare");
      }
    });

    it("rejects webDeploy vercel", () => {
      const result = validateTurnstileCompatibility({
        webDeploy: "vercel",
        serverDeploy: "none",
        backend: "self",
      });
      expect(result.isCompatible).toBe(false);
    });

    it("rejects cloudflare web + none server + hono backend", () => {
      const result = validateTurnstileCompatibility({
        webDeploy: "cloudflare",
        serverDeploy: "none",
        backend: "hono",
      });
      expect(result.isCompatible).toBe(false);
      if (!result.isCompatible) {
        expect(result.reason).toContain("--server-deploy cloudflare");
      }
    });
  });

  describe("validateAddonsAgainstConfig", () => {
    it("accepts turnstile with cloudflare web deploy", () => {
      const result = validateAddonsAgainstConfig(["turnstile"], {
        frontend: ["next"],
        auth: "better-auth",
        backend: "self",
        runtime: "none",
        webDeploy: "cloudflare",
        serverDeploy: "none",
      });
      expect(result.isOk()).toBe(true);
    });

    it("rejects turnstile without cloudflare web deploy", () => {
      const result = validateAddonsAgainstConfig(["turnstile"], {
        frontend: ["next"],
        auth: "better-auth",
        backend: "self",
        runtime: "none",
        webDeploy: "none",
        serverDeploy: "none",
      });
      expect(result.isErr()).toBe(true);
    });
  });
});

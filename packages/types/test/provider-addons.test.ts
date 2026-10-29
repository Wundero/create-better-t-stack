import { describe, expect, test } from "bun:test";

import {
  getProviderAddonsFor,
  isProviderAddon,
  isProviderAddonAvailable,
  PROVIDER_ADDON_META,
  PROVIDER_ADDON_PROVIDER,
  PROVIDER_ADDONS,
} from "../src/provider-addons";

const PROVIDER_ADDON_PROVIDERS = ["cloudflare", "aws", "fly", "railway", "neon", "prisma"] as const;

describe("provider addon registry", () => {
  test("registers every provider addon id exactly once", () => {
    expect(PROVIDER_ADDONS.length).toBe(31);
    expect(new Set(PROVIDER_ADDONS).size).toBe(PROVIDER_ADDONS.length);
  });

  test("provides complete metadata for every provider addon", () => {
    for (const id of PROVIDER_ADDONS) {
      const meta = PROVIDER_ADDON_META[id];
      expect(meta.id).toBe(id);
      expect(meta.iconSlug).toBe(id);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.hint.length).toBeGreaterThan(0);
      expect(PROVIDER_ADDON_PROVIDERS).toContain(meta.provider);
      expect(meta.color).toMatch(/^from-\w+-\d+ to-\w+-\d+$/);
      expect(PROVIDER_ADDON_PROVIDER[id]).toBe(meta.provider);
    }
  });

  test("recognizes provider addons and rejects the other addons", () => {
    for (const id of PROVIDER_ADDONS) {
      expect(isProviderAddon(id)).toBe(true);
    }

    expect(isProviderAddon("turborepo")).toBe(false);
    expect(isProviderAddon("pwa")).toBe(false);
    expect(isProviderAddon("none")).toBe(false);
  });
});

describe("provider addon availability", () => {
  test("gates Cloudflare addons on a Cloudflare web or server target", () => {
    const addon = "cloudflare-r2";

    expect(isProviderAddonAvailable(addon, {})).toBe(false);
    expect(isProviderAddonAvailable(addon, { webDeploy: "cloudflare" })).toBe(true);
    expect(isProviderAddonAvailable(addon, { serverDeploy: "cloudflare" })).toBe(true);
    expect(isProviderAddonAvailable(addon, { webDeploy: "aws" })).toBe(false);
  });

  test("gates AWS addons on an AWS server target", () => {
    const addon = "aws-s3";

    expect(isProviderAddonAvailable(addon, {})).toBe(false);
    expect(isProviderAddonAvailable(addon, { serverDeploy: "aws" })).toBe(true);
    expect(isProviderAddonAvailable(addon, { webDeploy: "aws" })).toBe(false);
  });

  test("gates Fly, Railway, and Neon addons on their server targets", () => {
    expect(isProviderAddonAvailable("fly-redis", { serverDeploy: "fly" })).toBe(true);
    expect(isProviderAddonAvailable("fly-redis", { serverDeploy: "railway" })).toBe(false);
    expect(isProviderAddonAvailable("railway-buckets", { serverDeploy: "railway" })).toBe(true);
    expect(isProviderAddonAvailable("railway-buckets", { serverDeploy: "fly" })).toBe(false);
    expect(isProviderAddonAvailable("neon-buckets", { serverDeploy: "neon" })).toBe(true);
    expect(isProviderAddonAvailable("neon-buckets", { serverDeploy: "railway" })).toBe(false);
  });

  test("gates Prisma addons on a Prisma server target or Prisma Postgres setup", () => {
    expect(isProviderAddonAvailable("prisma-buckets", {})).toBe(false);
    expect(isProviderAddonAvailable("prisma-buckets", { serverDeploy: "prisma" })).toBe(true);
    expect(isProviderAddonAvailable("prisma-buckets", { dbSetup: "prisma-postgres" })).toBe(true);
    expect(isProviderAddonAvailable("prisma-buckets", { dbSetup: "neon" })).toBe(false);
  });

  test("collects the addons for a configuration", () => {
    expect(getProviderAddonsFor({})).toEqual([]);
    expect(getProviderAddonsFor({ webDeploy: "cloudflare" })).toHaveLength(12);
    expect(getProviderAddonsFor({ serverDeploy: "cloudflare" })).toHaveLength(12);
    expect(getProviderAddonsFor({ serverDeploy: "aws" })).toHaveLength(10);
    expect(getProviderAddonsFor({ serverDeploy: "fly" })).toHaveLength(3);
    expect(getProviderAddonsFor({ serverDeploy: "railway" })).toHaveLength(3);
    expect(getProviderAddonsFor({ serverDeploy: "neon" })).toHaveLength(2);
    expect(getProviderAddonsFor({ dbSetup: "prisma-postgres" })).toEqual(["prisma-buckets"]);
  });
});

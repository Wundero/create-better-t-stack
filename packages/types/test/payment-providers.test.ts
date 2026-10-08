import { describe, expect, it } from "bun:test";

import {
  hasReactWebFrontend,
  isNativeOnlyFrontend,
  supportsPaymentsAuth,
  supportsPaymentsBackend,
  supportsPaymentsFrontend,
} from "../src/compatibility";
import {
  ALL_PAYMENT_IDS,
  PAYMENT_PROVIDER_IDS,
  PAYMENT_PROVIDERS,
  getPaymentProvider,
  isPaymentProvider,
  isPaymentProviderId,
} from "../src/payment-providers";
import { PaymentsSchema } from "../src/schemas";

describe("payments provider registry", () => {
  it("exposes every provider in the shared schema, ending with none", () => {
    expect(PaymentsSchema.options).toEqual([...ALL_PAYMENT_IDS]);
    expect(PaymentsSchema.options.at(-1)).toBe("none");
    for (const id of ["stripe", "autumn", "dodo", "creem", "chargebee", "commet"] as const) {
      expect(PaymentsSchema.options).toContain(id);
    }
  });

  it("keeps provider metadata aligned with the registry ids", () => {
    for (const id of [...PAYMENT_PROVIDER_IDS, "polar"] as const) {
      const meta = getPaymentProvider(id);
      expect(meta.id).toBe(id);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.serverDeps.length).toBeGreaterThan(0);
    }
  });

  it("guards concrete providers separately from none", () => {
    expect(isPaymentProviderId("stripe")).toBe(true);
    expect(isPaymentProvider("stripe")).toBe(true);
    expect(isPaymentProvider("none")).toBe(false);
    expect(isPaymentProvider(undefined)).toBe(false);
    expect(isPaymentProviderId("paypal")).toBe(false);
  });

  it("flags polar as the only convex/native-capable provider", () => {
    expect(PAYMENT_PROVIDERS.polar.supportsConvex).toBe(true);
    expect(PAYMENT_PROVIDERS.polar.supportsNative).toBe(true);
    for (const id of PAYMENT_PROVIDER_IDS) {
      expect(PAYMENT_PROVIDERS[id].supportsConvex).toBe(false);
      expect(PAYMENT_PROVIDERS[id].supportsNative).toBe(false);
    }
  });

  it("flags autumn as react-web-only", () => {
    expect(PAYMENT_PROVIDERS.autumn.reactWebOnly).toBe(true);
    expect(PAYMENT_PROVIDERS.commet.clientCheckout).toBe(false);
  });
});

describe("payments capability predicates", () => {
  it("requires better-auth for every provider", () => {
    expect(supportsPaymentsAuth("polar", "better-auth")).toBe(true);
    expect(supportsPaymentsAuth("stripe", "better-auth")).toBe(true);
    expect(supportsPaymentsAuth("stripe", "clerk")).toBe(false);
    expect(supportsPaymentsAuth("autumn", "none")).toBe(false);
    expect(supportsPaymentsAuth("none", "clerk")).toBe(true);
    expect(supportsPaymentsAuth(undefined, "clerk")).toBe(true);
  });

  it("rejects convex for non-polar providers only", () => {
    expect(supportsPaymentsBackend("polar", "convex")).toBe(true);
    expect(supportsPaymentsBackend("stripe", "convex")).toBe(false);
    expect(supportsPaymentsBackend("commet", "convex")).toBe(false);
    expect(supportsPaymentsBackend("stripe", "hono")).toBe(true);
    expect(supportsPaymentsBackend("none", "convex")).toBe(true);
  });

  it("rejects native-only stacks for non-polar providers", () => {
    expect(supportsPaymentsFrontend("polar", ["native-bare"])).toBe(true);
    expect(supportsPaymentsFrontend("stripe", ["native-bare"])).toBe(false);
    expect(supportsPaymentsFrontend("stripe", ["next"])).toBe(true);
    expect(supportsPaymentsFrontend("stripe", ["nuxt"])).toBe(true);
    expect(supportsPaymentsFrontend("stripe", ["none"])).toBe(true);
    expect(supportsPaymentsFrontend("none", ["native-bare"])).toBe(true);
  });

  it("requires a react web frontend for autumn", () => {
    expect(supportsPaymentsFrontend("autumn", ["next"])).toBe(true);
    expect(supportsPaymentsFrontend("autumn", ["tanstack-start"])).toBe(true);
    expect(supportsPaymentsFrontend("autumn", ["nuxt"])).toBe(false);
    expect(supportsPaymentsFrontend("autumn", ["svelte", "next"])).toBe(true);
    expect(supportsPaymentsFrontend("autumn", ["none"])).toBe(false);
  });

  it("detects react web and native-only frontend sets", () => {
    expect(hasReactWebFrontend(["next"])).toBe(true);
    expect(hasReactWebFrontend(["nuxt", "svelte"])).toBe(false);
    expect(hasReactWebFrontend(undefined)).toBe(false);
    expect(isNativeOnlyFrontend(["native-bare", "native-uniwind"])).toBe(true);
    expect(isNativeOnlyFrontend(["native-bare", "next"])).toBe(false);
    expect(isNativeOnlyFrontend(["none", "native-bare"])).toBe(true);
    expect(isNativeOnlyFrontend(["none"])).toBe(false);
    expect(isNativeOnlyFrontend([])).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import type { CreateInput, Frontend, Payments } from "../src/types";
import { validatePaymentsCompatibility } from "../src/utils/compatibility-rules";
import { collectFiles } from "./setup";

type Files = Map<string, string>;

const base: CreateInput = {
  projectName: "payments-probe",
  frontend: ["next"],
  backend: "hono",
  runtime: "node",
  api: "orpc",
  database: "postgres",
  orm: "drizzle",
  auth: "better-auth",
  payments: "none",
  addons: ["none"],
  examples: ["none"],
  dbSetup: "none",
  webDeploy: "none",
  serverDeploy: "none",
  git: false,
  packageManager: "bun",
  install: false,
};

async function generate(overrides: Partial<CreateInput>): Promise<Files> {
  const result = await createVirtual({ ...base, ...overrides });
  if (result.isErr()) throw new Error(`Generation failed: ${result.error.message}`);
  return collectFiles(result.value.root, result.value.root.path);
}

type ProviderCase = {
  id: Payments;
  serverPkg: string;
  serverImport: string;
  serverCall: string;
  clientPkg?: string;
  clientCall?: string;
  envKey: string;
  adapter: string;
  component: string;
  success: string;
};

const reactAdapter = "apps/web/src/lib/payments.ts";
const reactComponent = "apps/web/src/components/payment-actions.tsx";

const providerCases: ProviderCase[] = [
  {
    id: "stripe",
    serverPkg: "@better-auth/stripe",
    serverImport: "@better-auth/stripe",
    serverCall: "stripe({",
    clientPkg: "@better-auth/stripe/client",
    clientCall: "stripeClient({ subscription: true })",
    envKey: "STRIPE_SECRET_KEY",
    adapter: reactAdapter,
    component: reactComponent,
    success: "apps/web/src/app/success/page.tsx",
  },
  {
    id: "autumn",
    serverPkg: "autumn-js",
    serverImport: "autumn-js/better-auth",
    serverCall: "autumn()",
    envKey: "AUTUMN_SECRET_KEY",
    adapter: reactAdapter,
    component: reactComponent,
    success: "apps/web/src/app/success/page.tsx",
  },
  {
    id: "dodo",
    serverPkg: "@dodopayments/better-auth",
    serverImport: "@dodopayments/better-auth",
    serverCall: "dodopayments({",
    clientPkg: "@dodopayments/better-auth/client",
    clientCall: "dodopaymentsClient()",
    envKey: "DODO_PAYMENTS_API_KEY",
    adapter: reactAdapter,
    component: reactComponent,
    success: "apps/web/src/app/success/page.tsx",
  },
  {
    id: "creem",
    serverPkg: "@creem_io/better-auth",
    serverImport: "@creem_io/better-auth",
    serverCall: "creem({",
    clientPkg: "@creem_io/better-auth/client",
    clientCall: "creemClient()",
    envKey: "CREEM_API_KEY",
    adapter: reactAdapter,
    component: reactComponent,
    success: "apps/web/src/app/success/page.tsx",
  },
  {
    id: "chargebee",
    serverPkg: "@chargebee/better-auth",
    serverImport: "@chargebee/better-auth",
    serverCall: "chargebee({",
    clientPkg: "@chargebee/better-auth/client",
    clientCall: "chargebeeClient({ subscription: true })",
    envKey: "CHARGEBEE_API_KEY",
    adapter: reactAdapter,
    component: reactComponent,
    success: "apps/web/src/app/success/page.tsx",
  },
  {
    id: "commet",
    serverPkg: "@commet/better-auth",
    serverImport: "@commet/better-auth",
    serverCall: "commet({",
    clientPkg: "@commet/better-auth/client",
    clientCall: "commetClient()",
    envKey: "COMMET_API_KEY",
    adapter: reactAdapter,
    component: reactComponent,
    success: "apps/web/src/app/success/page.tsx",
  },
];

describe("payment provider generation", () => {
  for (const provider of providerCases) {
    it(`scaffolds ${provider.id} server plugin, deps, env, and web adapter`, async () => {
      const files = await generate({ payments: provider.id });

      const server = files.get("packages/auth/src/index.ts") ?? "";
      expect(server).toContain(`"${provider.serverImport}"`);
      expect(server).toContain(provider.serverCall);

      const authPkg = files.get("packages/auth/package.json") ?? "";
      expect(authPkg).toContain(provider.serverPkg);

      const webPkg = files.get("apps/web/package.json") ?? "";
      expect(webPkg).toContain(provider.serverPkg);

      const env = files.get("apps/server/.env") ?? "";
      expect(env).toContain(provider.envKey);

      expect(files.has(provider.adapter)).toBe(true);
      expect(files.has(provider.component)).toBe(true);
      expect(files.has(provider.success)).toBe(true);

      if (provider.clientPkg && provider.clientCall) {
        const client = files.get("apps/web/src/lib/auth-client.ts") ?? "";
        expect(client).toContain(provider.clientPkg);
        expect(client).toContain(provider.clientCall);
      }
    });
  }

  it("wraps React apps in AutumnProvider for autumn", async () => {
    const files = await generate({ payments: "autumn" });
    const providers = files.get("apps/web/src/components/providers.tsx") ?? "";
    expect(providers).toContain("AutumnProvider");
    expect(providers).toContain('from "autumn-js/react"');
  });

  it("keeps Polar's Convex path free of web payment templates", async () => {
    const files = await generate({
      payments: "polar",
      backend: "convex",
      runtime: "none",
      database: "none",
      orm: "none",
      api: "none",
      frontend: ["next"],
    });
    expect(files.has("packages/backend/convex/polar.ts")).toBe(true);
    expect(files.has("apps/web/src/app/success/page.tsx")).toBe(false);
  });

  it("does not emit a success page when payments is none", async () => {
    const files = await generate({ payments: "none" });
    expect(files.has("apps/web/src/app/success/page.tsx")).toBe(false);
    expect(files.has("apps/web/src/lib/payments.ts")).toBe(false);
  });
});

describe("payment provider adapters per web language", () => {
  const languageCases: Array<{
    provider: Payments;
    frontend: Frontend[];
    adapter: string;
    component: string;
    success: string;
  }> = [
    {
      provider: "dodo",
      frontend: ["svelte"],
      adapter: "apps/web/src/lib/payments.ts",
      component: "apps/web/src/lib/components/PaymentActions.svelte",
      success: "apps/web/src/routes/success/+page.svelte",
    },
    {
      provider: "creem",
      frontend: ["solid"],
      adapter: "apps/web/src/lib/payments.ts",
      component: "apps/web/src/components/payment-actions.tsx",
      success: "apps/web/src/routes/success.tsx",
    },
    {
      provider: "chargebee",
      frontend: ["nuxt"],
      adapter: "apps/web/app/lib/payments.ts",
      component: "apps/web/app/components/PaymentActions.vue",
      success: "apps/web/app/pages/success.vue",
    },
    {
      provider: "commet",
      frontend: ["astro"],
      adapter: "apps/web/src/lib/payments.ts",
      component: "apps/web/src/components/PaymentActions.astro",
      success: "apps/web/src/pages/success.astro",
    },
  ];

  for (const testCase of languageCases) {
    it(`generates ${testCase.provider} adapter for ${testCase.frontend[0]}`, async () => {
      const files = await generate({ payments: testCase.provider, frontend: testCase.frontend });
      expect(files.has(testCase.adapter)).toBe(true);
      expect(files.has(testCase.component)).toBe(true);
      expect(files.has(testCase.success)).toBe(true);
    });
  }

  it("adds the Commet checkout route for fullstack apps only", async () => {
    const fullstack = await generate({
      payments: "commet",
      backend: "self",
      runtime: "none",
      frontend: ["next"],
    });
    expect(files_list(fullstack, "payments/commet")).toContain(
      "apps/web/src/app/api/payments/commet/checkout/route.ts",
    );

    const standalone = await generate({ payments: "commet" });
    expect(files_list(standalone, "payments/commet")).not.toContain(
      "apps/web/src/app/api/payments/commet/checkout/route.ts",
    );
  });
});

function files_list(files: Files, needle: string): string[] {
  return [...files.keys()].filter((key) => key.includes(needle)).sort();
}

describe("payment provider capability validation", () => {
  it("rejects new providers without better-auth", () => {
    const result = validatePaymentsCompatibility("stripe", "clerk", "hono", ["next"]);
    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.message : "").toContain(
      "Stripe payments requires Better Auth",
    );
  });

  it("rejects new providers with the Convex backend", () => {
    const result = validatePaymentsCompatibility("stripe", "better-auth", "convex", ["next"]);
    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.message : "").toContain("Convex backend");
  });

  it("rejects new providers for native-only stacks", () => {
    const result = validatePaymentsCompatibility("dodo", "better-auth", "hono", ["native-bare"]);
    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.message : "").toContain("native-only");
  });

  it("rejects autumn without a React web frontend", () => {
    const result = validatePaymentsCompatibility("autumn", "better-auth", "hono", ["nuxt"]);
    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.message : "").toContain("React web frontend");
  });

  it("still accepts Polar with Convex and native-only stacks", () => {
    expect(validatePaymentsCompatibility("polar", "better-auth", "convex", ["next"]).isOk()).toBe(
      true,
    );
    expect(
      validatePaymentsCompatibility("polar", "better-auth", "hono", ["native-bare"]).isOk(),
    ).toBe(true);
  });

  it("accepts none regardless of stack", () => {
    expect(validatePaymentsCompatibility("none", "clerk", "convex", ["native-bare"]).isOk()).toBe(
      true,
    );
  });
});

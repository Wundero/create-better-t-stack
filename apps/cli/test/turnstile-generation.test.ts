import { describe, expect, it } from "bun:test";

import { createVirtual } from "../src/index";
import { collectFiles } from "./setup";

type CreateOptions = Parameters<typeof createVirtual>[0];

const baseConfig = {
  projectName: "turnstile-test",
  packageManager: "bun",
  install: false,
  git: false,
  payments: "none",
  examples: ["none"],
  addons: ["turnstile"],
  auth: "better-auth",
} satisfies Partial<CreateOptions>;

async function generate(overrides: Partial<CreateOptions>) {
  const result = await createVirtual({ ...baseConfig, ...overrides } as CreateOptions);
  if (result.isErr()) throw result.error;
  return collectFiles(result.value.root, result.value.root.path);
}

const selfCloudflare = {
  backend: "self",
  runtime: "none",
  webDeploy: "cloudflare",
  serverDeploy: "none",
  database: "none",
  orm: "none",
  dbSetup: "none",
} satisfies Partial<CreateOptions>;

const WEB_FRONTENDS = [
  { frontend: "next", form: "apps/web/src/components/sign-in-form.tsx", api: "trpc" },
  { frontend: "tanstack-router", form: "apps/web/src/components/sign-in-form.tsx", api: "trpc" },
  { frontend: "tanstack-start", form: "apps/web/src/components/sign-in-form.tsx", api: "trpc" },
  { frontend: "react-router", form: "apps/web/src/components/sign-in-form.tsx", api: "trpc" },
  { frontend: "svelte", form: "apps/web/src/components/SignInForm.svelte", api: "orpc" },
  { frontend: "solid", form: "apps/web/src/components/sign-in-form.tsx", api: "orpc" },
  { frontend: "astro", form: "apps/web/src/components/SignInForm.astro", api: "orpc" },
  { frontend: "nuxt", form: "apps/web/app/components/SignInForm.vue", api: "orpc" },
] as const satisfies ReadonlyArray<{
  frontend: NonNullable<CreateOptions["frontend"]>[number];
  form: string;
  api: CreateOptions["api"];
}>;

describe("Turnstile addon generation", () => {
  it("provisions the widget and binds the sitekey for self Cloudflare deployments", async () => {
    const files = await generate({
      projectName: "ts-self",
      frontend: ["next"],
      api: "trpc",
      ...selfCloudflare,
    });

    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const widgetIndex = infra.indexOf('Cloudflare.Turnstile.Widget("turnstile"');
    const webIndex = infra.indexOf("export const web");

    expect(widgetIndex).toBeGreaterThanOrEqual(0);
    expect(webIndex).toBeGreaterThan(widgetIndex);
    expect(infra).toContain("turnstileSecretBindings");
    expect(infra).toContain("turnstileSitekeyBindings");
    expect(infra).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    expect(infra).toContain('Config.String("TURNSTILE_DOMAINS")');

    const auth = files.get("packages/auth/src/index.ts") ?? "";
    expect(auth).toContain('import { captcha } from "better-auth/plugins";');
    expect(auth).toContain('provider: "cloudflare-turnstile"');
    expect(auth).toContain("TURNSTILE_SECRET_KEY");

    const form = files.get("apps/web/src/components/sign-in-form.tsx") ?? "";
    expect(form).toContain("x-captcha-response");
    expect(form).toContain("TurnstileWidget");
    // fetchOptions must live in the request payload (first argument), never after onError.
    expect(/onError[\s\S]{0,240}?\},\s*fetchOptions/.test(form)).toBe(false);
    expect(files.has("apps/web/src/components/turnstile-widget.tsx")).toBe(true);

    const webEnv = files.get("apps/web/.env") ?? "";
    expect(webEnv).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA");
    expect(webEnv).toContain("TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA");
    expect(webEnv).toContain("TURNSTILE_DOMAINS=localhost,127.0.0.1");
  });

  it("binds the secret to the server worker and prefixes the sitekey for split deployments", async () => {
    const files = await generate({
      projectName: "ts-split",
      frontend: ["svelte"],
      api: "orpc",
      backend: "hono",
      runtime: "workers",
      webDeploy: "cloudflare",
      serverDeploy: "cloudflare",
      database: "none",
      orm: "none",
      dbSetup: "none",
    });

    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    // Secret binding is present; the public sitekey uses the SvelteKit PUBLIC_ prefix.
    expect(infra).toContain("turnstileSecretBindings");
    expect(infra).toContain("PUBLIC_TURNSTILE_SITE_KEY");

    const serverWorkerBlock = infra.slice(
      infra.indexOf('Cloudflare.Worker("server"'),
      infra.indexOf("Cloudflare.Website."),
    );
    const webBlock = infra.slice(infra.indexOf("Cloudflare.Website."));
    expect(serverWorkerBlock).toContain("turnstileSecretBindings");
    expect(webBlock).toContain("turnstileSitekeyBindings");
    expect(webBlock).not.toContain("turnstileSecretBindings");

    const backend = files.get("apps/server/src/index.ts") ?? "";
    expect(backend).toContain("x-captcha-response");
    expect(backend).toContain("Content-Type");
  });

  it("wires the widget and captcha header across every supported web frontend", async () => {
    for (const { frontend, form, api } of WEB_FRONTENDS) {
      const isSelf = ["next", "tanstack-start", "nuxt", "svelte", "solid", "astro"].includes(
        frontend,
      );
      const files = await generate({
        projectName: `ts-${frontend}`,
        frontend: [frontend],
        api,
        ...(isSelf
          ? selfCloudflare
          : {
              backend: "hono",
              runtime: "workers",
              webDeploy: "cloudflare",
              serverDeploy: "cloudflare",
              database: "none",
              orm: "none",
              dbSetup: "none",
            }),
      });

      const formFile = files.get(form);
      expect(formFile, `${frontend} form missing`).toBeDefined();
      expect(formFile ?? "", `${frontend} form missing captcha header`).toContain(
        "x-captcha-response",
      );
      expect(/onError[\s\S]{0,240}?\},\s*fetchOptions/.test(formFile ?? "")).toBe(false);
    }
  });

  it("rejects configuration combinations that cannot be provisioned by Alchemy", async () => {
    const cases: Array<Partial<CreateOptions>> = [
      { frontend: ["next"], api: "trpc", ...selfCloudflare, webDeploy: "none" },
      {
        frontend: ["svelte"],
        api: "orpc",
        backend: "hono",
        runtime: "bun",
        webDeploy: "cloudflare",
        serverDeploy: "none",
        database: "none",
        orm: "none",
        dbSetup: "none",
      },
      { frontend: ["next"], api: "trpc", ...selfCloudflare, auth: "clerk" },
      {
        frontend: ["native-bare"],
        api: "orpc",
        backend: "hono",
        runtime: "workers",
        webDeploy: "cloudflare",
        serverDeploy: "cloudflare",
        database: "none",
        orm: "none",
        dbSetup: "none",
      },
    ];

    for (const overrides of cases) {
      const result = await createVirtual({ ...baseConfig, ...overrides } as CreateOptions);
      expect(result.isErr(), JSON.stringify(overrides)).toBe(true);
    }
  });

  it("emits no turnstile artifacts when the addon is not selected", async () => {
    const files = await generate({
      projectName: "ts-off",
      frontend: ["next"],
      api: "trpc",
      addons: ["none"],
      ...selfCloudflare,
    });

    const infra = files.get("packages/infra/alchemy.run.ts") ?? "";
    const form = files.get("apps/web/src/components/sign-in-form.tsx") ?? "";

    expect(infra).not.toContain("Turnstile.Widget");
    expect(form).not.toContain("x-captcha-response");
    expect(form).not.toContain("TurnstileWidget");
    expect(files.has("apps/web/src/components/turnstile-widget.tsx")).toBe(false);
  });
});

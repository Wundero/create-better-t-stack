import type { AlchemyDeploymentPlan } from "./plan";
import { writeObject, type AlchemyWriter } from "./writer";

function sitekeyPrefix(plan: AlchemyDeploymentPlan): string {
  if (plan.web.target === "none") return "VITE";
  switch (plan.web.framework) {
    case "next":
      return "NEXT_PUBLIC";
    case "nuxt":
      return "NUXT_PUBLIC";
    case "svelte":
    case "astro":
      return "PUBLIC";
    default:
      return "VITE";
  }
}

export function writeTurnstileResources(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (!plan.hasTurnstile) return;

  writer.writeLine("export const turnstileWidget = Effect.gen(function* () {");
  writer.indent(() => {
    writer.writeLine(
      'const domains = (yield* Config.String("TURNSTILE_DOMAINS")).split(",").map((domain) => domain.trim()).filter((domain) => domain.length > 0);',
    );
    writeObject(
      writer,
      'const widget = yield* Cloudflare.Turnstile.Widget("turnstile", {',
      () => {
        writer.writeLine('mode: "managed",');
        writer.writeLine("domains,");
      },
      "});",
    );
    writer.writeLine("return { secret: widget.secret, sitekey: widget.sitekey };");
  });
  writer.writeLine("});");

  if (plan.hasTurnstileServerRuntime) {
    writer.writeLine("export const turnstileSecretBindings = {");
    writer.indent(() => {
      writer.writeLine(
        "TURNSTILE_SECRET_KEY: turnstileWidget.pipe(Effect.map(({ secret }) => secret)),",
      );
    });
    writer.writeLine("};");
  }

  if (plan.hasTurnstileWebRuntime) {
    writer.writeLine("export const turnstileSitekeyBindings = {");
    writer.indent(() => {
      writer.writeLine(
        `${sitekeyPrefix(plan)}_TURNSTILE_SITE_KEY: turnstileWidget.pipe(Effect.map(({ sitekey }) => sitekey)),`,
      );
    });
    writer.writeLine("};");
  }
}

import type { AlchemyDeploymentPlan } from "./plan";
import { writeObject, type AlchemyWriter } from "./writer";

/**
 * Emits the Alchemy resources that back the configured email deploy target.
 *
 * Cloudflare exposes a Worker `send_email` binding (declared at module scope and
 * attached through the Worker env). SES provisions an identity and configuration
 * set, which must run inside an Effect — hence the exported `emailResources`.
 */
export function writeEmailResources(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (!plan.hasEmail) return;

  if (plan.emailCloudflare) {
    writer.writeLine('export const emailBinding = Cloudflare.Email.SendEmail("EMAIL");');
  }

  if (plan.emailSes) {
    writer.writeLine("export const emailResources = Effect.gen(function* () {");
    writer.indent(() => {
      writeObject(
        writer,
        'const emailIdentity = yield* SES.EmailIdentity("email-identity", {',
        () => writer.writeLine('emailIdentity: Config.String("EMAIL_FROM"),'),
        "});",
      );
      writer.writeLine(
        'const emailConfigurationSet = yield* SES.ConfigurationSet("email-configuration-set");',
      );
      writer.writeLine("return { emailIdentity, emailConfigurationSet };");
    });
    writer.writeLine("});");
  }
}

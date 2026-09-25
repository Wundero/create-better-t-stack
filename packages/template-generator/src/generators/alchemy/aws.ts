import type { AlchemyDeploymentPlan } from "./plan";
import { writeObject, type AlchemyWriter } from "./writer";

function auroraPort(plan: AlchemyDeploymentPlan): number {
  return plan.managedDatabase.kind === "aurora" && plan.managedDatabase.engine === "aurora-mysql"
    ? 3306
    : 5432;
}

export function writeAwsNetworkResources(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (!plan.hasAwsNetwork) return;

  const port = auroraPort(plan);

  writer.writeLine("export const awsNetwork = Effect.gen(function* () {");
  writer.indent(() => {
    writeObject(
      writer,
      'const network = yield* AWS.EC2.Network("network", {',
      () => {
        writer.writeLine('cidrBlock: "10.0.0.0/16",');
        writer.writeLine("availabilityZones: 2,");
        writer.writeLine('nat: "single",');
      },
      "});",
    );
    writer.blankLine();
    writeObject(
      writer,
      'const databaseSecurityGroup = yield* AWS.EC2.SecurityGroup("database-security-group", {',
      () => {
        writer.writeLine("vpcId: network.vpcId,");
        writer.writeLine('description: "Database access",');
        writer.writeLine("ingress: [");
        writer.indent(() => {
          writeObject(
            writer,
            "{",
            () => {
              writer.writeLine('ipProtocol: "tcp",');
              writer.writeLine(`fromPort: ${port},`);
              writer.writeLine(`toPort: ${port},`);
              writer.writeLine('cidrIpv4: "10.0.0.0/16",');
            },
            "},",
          );
        });
        writer.writeLine("],");
      },
      "});",
    );
    writer.blankLine();
    writer.writeLine("return { network, databaseSecurityGroup };");
  });
  writer.writeLine("});");
}

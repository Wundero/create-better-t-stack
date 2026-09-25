import {
  awsWebEnvEntries,
  prismaWebEnvEntries,
  selfAwsWebEnvEntries,
  selfCloudflareWebEnvEntries,
  splitCloudflareWebEnvEntries,
} from "./env";
import {
  getAwsWebsiteFramework,
  getPrismaWebsiteFramework,
  assertNever,
  type AlchemyDeploymentPlan,
  type DeployedWebFramework,
} from "./plan";
import { writeLines, writeObject, type AlchemyWriter } from "./writer";

function writeEnv(writer: AlchemyWriter, entries: readonly string[]): void {
  writeObject(writer, "env: {", () => writeLines(writer, entries), "},");
}

function webDevPort(framework: DeployedWebFramework): number {
  if (framework === "react-router" || framework === "svelte") return 5173;
  if (framework === "astro") return 4321;
  return 3001;
}

function writeStaticSite(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  framework: "next" | "svelte",
  declaration: string,
  entries: readonly string[],
): void {
  if (framework === "svelte") {
    writer.writeLine(
      "// _worker.js is a shim importing outside its directory, so it must be bundled",
    );
  }
  writeObject(
    writer,
    `${declaration} Cloudflare.Website.StaticSite("web", {`,
    () => {
      writer.writeLine('cwd: "../../apps/web",');
      writer.writeLine(
        `command: "${plan.config.packageManager} run ${framework === "next" ? "build:cloudflare" : "build"}",`,
      );
      writer.writeLine(
        "// Rebuild shared workspace dependencies until Alchemy has a workspace-aware default memo.",
      );
      writer.writeLine("memo: false,");
      if (framework === "next") {
        writer.writeLine('outdir: ".open-next/assets",');
        writer.writeLine('main: "../../apps/web/.open-next/worker.js",');
        writer.writeLine("bundle: true,");
        writeObject(
          writer,
          "compatibility: {",
          () => {
            writer.writeLine('flags: ["nodejs_compat", "global_fetch_strictly_public"],');
          },
          "},",
        );
      } else {
        writer.writeLine('outdir: ".svelte-kit/cloudflare",');
        writer.writeLine('main: "../../apps/web/.svelte-kit/cloudflare/_worker.js",');
        writeObject(
          writer,
          "compatibility: {",
          () => {
            writer.writeLine('flags: ["nodejs_compat"],');
          },
          "},",
        );
      }
      writeEnv(writer, entries);
      writeObject(
        writer,
        "dev: {",
        () => {
          writer.writeLine(`command: "${plan.config.packageManager} run dev:bare",`);
          writer.writeLine(`url: "http://localhost:${webDevPort(framework)}",`);
        },
        "},",
      );
    },
    "});",
  );
}

function writeNuxt(writer: AlchemyWriter, declaration: string, entries: readonly string[]): void {
  writeObject(
    writer,
    `${declaration} Cloudflare.Website.Nuxt("web", {`,
    () => {
      writer.writeLine('rootDir: "../../apps/web",');
      writeEnv(writer, entries);
      writeObject(writer, "dev: {", () => writer.writeLine(`port: ${webDevPort("nuxt")},`), "},");
    },
    "});",
  );
}

function writeAstro(writer: AlchemyWriter, declaration: string, entries: readonly string[]): void {
  writeObject(
    writer,
    `${declaration} Cloudflare.Website.Astro("web", {`,
    () => {
      writer.writeLine('rootDir: "../../apps/web",');
      writeEnv(writer, entries);
      writeObject(writer, "dev: {", () => writer.writeLine(`port: ${webDevPort("astro")},`), "},");
    },
    "});",
  );
}

function writeVite(
  writer: AlchemyWriter,
  declaration: string,
  framework: "tanstack-router" | "react-router" | "tanstack-start" | "solid",
  entries: readonly string[],
): void {
  writeObject(
    writer,
    `${declaration} Cloudflare.Website.Vite("web", {`,
    () => {
      writer.writeLine('rootDir: "../../apps/web",');
      if (framework !== "tanstack-router") {
        writeObject(
          writer,
          "compatibility: {",
          () => {
            writer.writeLine('flags: ["nodejs_compat"],');
          },
          "},",
        );
      }
      if (framework === "tanstack-router") {
        writeObject(
          writer,
          "assets: {",
          () => {
            writer.writeLine('htmlHandling: "auto-trailing-slash",');
            writer.writeLine('notFoundHandling: "single-page-application",');
          },
          "},",
        );
      }
      writeEnv(writer, entries);
      writeObject(
        writer,
        "dev: {",
        () => writer.writeLine(`port: ${webDevPort(framework)},`),
        "},",
      );
    },
    "});",
  );
}

function writeCloudflareWeb(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  framework: DeployedWebFramework,
  topology: "self" | "split",
): void {
  const declaration = topology === "self" ? "export const web =" : "const webWorker = yield*";
  const entries =
    topology === "self"
      ? selfCloudflareWebEnvEntries(plan, framework)
      : splitCloudflareWebEnvEntries(plan, framework);

  switch (framework) {
    case "next":
    case "svelte":
      writeStaticSite(writer, plan, framework, declaration, entries);
      break;
    case "nuxt":
      writeNuxt(writer, declaration, entries);
      break;
    case "astro":
      writeAstro(writer, declaration, entries);
      break;
    case "tanstack-router":
    case "react-router":
    case "tanstack-start":
    case "solid":
      writeVite(writer, declaration, framework, entries);
      break;
    default:
      assertNever(framework);
  }
}

function prismaFramework(framework: DeployedWebFramework): string | undefined {
  switch (framework) {
    case "next":
      return "nextjs";
    case "nuxt":
      return "nuxt";
    case "astro":
      return "astro";
    case "tanstack-start":
      return "tanstack-start";
    case "tanstack-router":
      return "vite";
    case "react-router":
    case "svelte":
    case "solid":
      return undefined;
    default:
      return assertNever(framework);
  }
}

interface PrismaCustomBuild {
  script: "build";
  outdir: ".output" | "build";
  entrypoint: "server/index.mjs" | "server/index.js" | "index.js";
}

function prismaCustomBuild(framework: DeployedWebFramework): PrismaCustomBuild {
  switch (framework) {
    case "solid":
      return {
        script: "build",
        outdir: ".output",
        entrypoint: "server/index.mjs",
      };
    case "react-router":
      return {
        script: "build",
        outdir: "build",
        entrypoint: "server/index.js",
      };
    case "svelte":
      return {
        script: "build",
        outdir: "build",
        entrypoint: "index.js",
      };
    case "tanstack-router":
    case "next":
    case "nuxt":
    case "astro":
    case "tanstack-start":
      throw new Error(`${framework} uses Prisma Compute's automatic framework build`);
    default:
      return assertNever(framework);
  }
}

function writePrismaWeb(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (plan.web.target !== "prisma") return;
  const { framework, topology } = plan.web;
  const websiteFramework = getPrismaWebsiteFramework(plan.config);

  writer.writeLine(
    websiteFramework
      ? "export const web = Effect.gen(function* () {"
      : 'export const web = Prisma.Compute("web", Effect.gen(function* () {',
  );
  writer.indent(() => {
    writer.writeLine("const project = yield* prismaProject;");
    if (topology === "self") {
      writer.writeLine("const resolvedDatabaseEnv = yield* databaseEnv;");
    } else if (plan.server.target !== "none") {
      writer.writeLine("const deployedServer = yield* server;");
    }
    if (plan.hasAxiomWebRuntime) {
      writer.writeLine("const resolvedObservabilityEnv = yield* observabilityEnv;");
    }
    writer.blankLine();
    writeObject(
      writer,
      "const webEnv = {",
      () => {
        writeLines(writer, prismaWebEnvEntries(plan, framework));
      },
      "};",
    );

    writer.blankLine();
    if (websiteFramework) {
      writer.writeLine(`return yield* Prisma.Website.${websiteFramework}("web", {`);
      writer.indent(() => {
        writer.writeLine("project,");
        writer.writeLine('rootDir: "../../apps/web",');
        writer.writeLine("env: webEnv,");
        writer.writeLine('compute: { healthCheck: { path: "/" }, destroyOldDeployment: true },');
        writer.writeLine(`dev: { port: ${webDevPort(framework)} },`);
      });
      writer.writeLine("});");
    } else {
      writer.writeLine("return {");
      writer.indent(() => {
        writer.writeLine("project,");
        writer.writeLine('path: "../../apps/web",');
        const frameworkName = prismaFramework(framework);
        if (frameworkName) {
          writer.writeLine(`build: { type: "auto", framework: "${frameworkName}", env: webEnv },`);
        } else {
          const customBuild = prismaCustomBuild(framework);
          writeObject(
            writer,
            "build: {",
            () => {
              writer.writeLine(
                `command: "${plan.config.packageManager} run ${customBuild.script}",`,
              );
              writer.writeLine(`outdir: "${customBuild.outdir}",`);
              writer.writeLine(`entrypoint: "${customBuild.entrypoint}",`);
              writer.writeLine("env: webEnv,");
            },
            "},",
          );
          writer.writeLine("port: 3000,");
        }
        writer.writeLine("env: webEnv,");
        writer.writeLine('healthCheck: { path: "/" },');
        writer.writeLine("destroyOldDeployment: true,");
        writeObject(
          writer,
          "dev: {",
          () => {
            writer.writeLine(`command: "${plan.config.packageManager} run dev:bare",`);
            writer.writeLine(`port: ${webDevPort(framework)},`);
            writer.writeLine("env: webEnv,");
          },
          "},",
        );
      });
      writer.writeLine("};");
    }
  });
  writer.writeLine(websiteFramework ? "});" : "}));");
}

interface AwsWebsiteOptions {
  declaration: string;
  entries: readonly string[];
  includeDatabaseEnv: boolean;
}

function writeAwsWebsite(
  writer: AlchemyWriter,
  awsFramework: string,
  options: AwsWebsiteOptions,
): void {
  writeObject(
    writer,
    `${options.declaration}AWS.Website.${awsFramework}("web", {`,
    () => {
      writer.writeLine('rootDir: "../../apps/web",');
      if (awsFramework === "Vite") {
        writer.writeLine("spa: true,");
        return;
      }
      writeObject(
        writer,
        "env: {",
        () => {
          if (options.includeDatabaseEnv) writer.writeLine("...resolvedDatabaseEnv,");
          writeLines(writer, options.entries);
        },
        "},",
      );
    },
    "});",
  );
}

function writeAwsSelfWeb(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  awsFramework: string,
  framework: DeployedWebFramework,
): void {
  const includeDatabaseEnv = plan.hasAlchemyManagedDatabase;
  const includeObservabilityEnv = plan.hasAxiomWebRuntime;
  const entries = selfAwsWebEnvEntries(plan, framework);

  if (!includeDatabaseEnv && !includeObservabilityEnv) {
    writeAwsWebsite(writer, awsFramework, {
      declaration: "export const web = ",
      entries,
      includeDatabaseEnv: false,
    });
    return;
  }

  writer.writeLine("export const web = Effect.gen(function* () {");
  writer.indent(() => {
    if (includeDatabaseEnv) writer.writeLine("const resolvedDatabaseEnv = yield* databaseEnv;");
    if (includeObservabilityEnv) {
      writer.writeLine("const resolvedObservabilityEnv = yield* observabilityEnv;");
    }
    writeAwsWebsite(writer, awsFramework, {
      declaration: "return yield* ",
      entries,
      includeDatabaseEnv,
    });
  });
  writer.writeLine("});");
}

interface AwsSolidWebOptions {
  includeDatabaseEnv: boolean;
  entries: readonly string[];
}

function writeAwsSolidBuildAndServer(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  options: AwsSolidWebOptions,
): void {
  const { includeDatabaseEnv, entries } = options;
  writeObject(
    writer,
    'const webBuild = yield* Command.Build("web-build", {',
    () => {
      writer.writeLine(`command: "${plan.config.packageManager} run build",`);
      writer.writeLine('cwd: "../../apps/web",');
      writer.writeLine('outdir: ".output",');
      writer.writeLine("memo: false,");
    },
    "});",
  );
  writer.blankLine();
  writeObject(
    writer,
    'const webServer = yield* AWS.Lambda.Function("web-server", {',
    () => {
      writer.writeLine("main: Output.interpolate`${webBuild.outdir}/server/index.mjs`,");
      writer.writeLine('handler: "handler",');
      writer.writeLine("bundle: false,");
      writer.writeLine('runtime: "nodejs24.x",');
      writer.writeLine("timeout: Duration.seconds(30),");
      writeObject(
        writer,
        "functionUrl: {",
        () => {
          writer.writeLine('authType: "NONE",');
          writer.writeLine('invokeMode: "RESPONSE_STREAM",');
        },
        "},",
      );
      if (includeDatabaseEnv || entries.length > 0) {
        writeObject(
          writer,
          "env: {",
          () => {
            if (includeDatabaseEnv) writer.writeLine("...resolvedDatabaseEnv,");
            writeLines(writer, entries);
          },
          "},",
        );
      }
    },
    "});",
  );
}

function writeAwsSolidSite(writer: AlchemyWriter): void {
  writer.writeLine("return yield* AWS.Website.makeKvSite(");
  writer.indent(() => {
    writer.writeLine('"web",');
    writeObject(
      writer,
      "{",
      () => writer.writeLine("path: Output.interpolate`${webBuild.outdir}/public`,"),
      "},",
    );
    writeObject(
      writer,
      "{",
      () => {
        writeObject(
          writer,
          "serverHost: Output.map((url) => {",
          () => {
            writer.writeLine(
              'if (!url) throw new Error("The Solid web server did not produce a Function URL.");',
            );
            writer.writeLine("return new URL(url).hostname;");
          },
          "})(webServer.functionUrl),",
        );
      },
      "},",
    );
  });
  writer.writeLine(");");
}

function writeAwsSolidWeb(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  topology: "self" | "split",
): void {
  const includeDatabaseEnv = topology === "self" && plan.hasAlchemyManagedDatabase;
  const includeObservabilityEnv = plan.hasAxiomWebRuntime;
  const entries =
    topology === "self" ? selfAwsWebEnvEntries(plan, "solid") : awsWebEnvEntries(plan, "solid");
  const declaration = topology === "self" ? "export const web = " : "const webWorker = yield* ";

  writer.writeLine(`${declaration}Effect.gen(function* () {`);
  writer.indent(() => {
    if (includeDatabaseEnv) writer.writeLine("const resolvedDatabaseEnv = yield* databaseEnv;");
    if (includeObservabilityEnv) {
      writer.writeLine("const resolvedObservabilityEnv = yield* observabilityEnv;");
    }
    writeAwsSolidBuildAndServer(writer, plan, { includeDatabaseEnv, entries });
    writer.blankLine();
    writeAwsSolidSite(writer);
  });
  writer.writeLine("});");
}

function writeAwsWeb(
  writer: AlchemyWriter,
  plan: AlchemyDeploymentPlan,
  topology: "self" | "split",
): void {
  if (plan.web.target !== "aws") return;
  const { framework } = plan.web;

  if (framework === "solid") {
    writeAwsSolidWeb(writer, plan, topology);
    return;
  }

  const awsFramework = getAwsWebsiteFramework(plan.config);

  if (!awsFramework) {
    throw new Error(`AWS web deployment does not support frontend: ${framework}`);
  }

  if (topology === "self") {
    writeAwsSelfWeb(writer, plan, awsFramework, framework);
    return;
  }

  if (plan.hasAxiomWebRuntime) {
    writer.writeLine("const resolvedObservabilityEnv = yield* observabilityEnv;");
  }
  writeAwsWebsite(writer, awsFramework, {
    declaration: "const webWorker = yield* ",
    entries: awsWebEnvEntries(plan, framework),
    includeDatabaseEnv: false,
  });
}

export function writeExportedWebResource(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (plan.web.target === "prisma") {
    writePrismaWeb(writer, plan);
    return;
  }
  if (plan.web.target === "cloudflare" && plan.web.topology === "self") {
    writeCloudflareWeb(writer, plan, plan.web.framework, "self");
    writer.blankLine();
    writer.writeLine("export type WebEnv = Cloudflare.InferEnv<typeof web>;");
  }
  if (plan.web.target === "aws" && plan.web.topology === "self") {
    writeAwsWeb(writer, plan, "self");
  }
}

export function writeStackWebResource(writer: AlchemyWriter, plan: AlchemyDeploymentPlan): void {
  if (plan.web.target === "none") return;
  if (plan.web.target === "cloudflare" && plan.web.topology === "split") {
    writeCloudflareWeb(writer, plan, plan.web.framework, "split");
  } else if (plan.web.target === "aws" && plan.web.topology === "split") {
    writeAwsWeb(writer, plan, "split");
  } else {
    writer.writeLine("const webWorker = yield* web;");
  }
}

import type {
  CloudflareBinding,
  CloudflareConfig,
  Database,
  DatabaseSetup,
  Runtime,
  ServerDeploy,
  WebDeploy,
} from "../types";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableMultiselect, navigableSelect, navigableText } from "./navigable";

type CloudflarePromptContext = {
  webDeploy: WebDeploy;
  serverDeploy: ServerDeploy;
  runtime: Runtime;
  database: Database;
  dbSetup: DatabaseSetup;
};

const POSTGRES_COMPATIBLE_DB_SETUPS: readonly DatabaseSetup[] = [
  "neon",
  "prisma-postgres",
  "supabase",
  "planetscale",
];

function canUseHyperdrive(context: CloudflarePromptContext) {
  return (
    context.database === "postgres" &&
    POSTGRES_COMPATIBLE_DB_SETUPS.includes(context.dbSetup) &&
    context.runtime === "workers" &&
    context.serverDeploy === "cloudflare"
  );
}

export async function getCloudflareConfigChoice(
  cloudflare: CloudflareConfig | undefined,
  context: CloudflarePromptContext,
): Promise<CloudflareConfig | undefined> {
  if (cloudflare !== undefined) return cloudflare;
  if (context.webDeploy !== "cloudflare" && context.serverDeploy !== "cloudflare") {
    return undefined;
  }

  const bindings = await navigableMultiselect<CloudflareBinding>({
    message: "Select Cloudflare bindings",
    required: false,
    options: [
      { value: "workers-ai", label: "Workers AI", hint: "AI binding as AI" },
      { value: "r2", label: "R2", hint: "Object storage binding as R2_BUCKET" },
      { value: "kv", label: "KV", hint: "KV namespace binding as KV" },
      { value: "queue", label: "Queue", hint: "Queue binding as QUEUE" },
      {
        value: "durable-object",
        label: "Durable Object",
        hint: "Durable Object namespace binding as APP_DO",
      },
    ],
    initialValues: [],
  });

  if (isCancel(bindings)) throw new UserCancelledError({ message: "Operation cancelled" });

  const next: CloudflareConfig = {};
  if (bindings.length > 0) {
    next.bindings = bindings;
  }

  if (canUseHyperdrive(context)) {
    const hyperdrive = await navigableSelect<NonNullable<CloudflareConfig["hyperdrive"]>>({
      message: "Use Cloudflare Hyperdrive for Postgres?",
      options: [
        { value: "none", label: "None", hint: "Use DATABASE_URL directly" },
        { value: "postgres", label: "Postgres", hint: "Bind HYPERDRIVE to the Worker" },
      ],
      initialValue: "none",
    });

    if (isCancel(hyperdrive)) throw new UserCancelledError({ message: "Operation cancelled" });
    if (hyperdrive !== "none") {
      next.hyperdrive = hyperdrive;
    }
  }

  const emailSender = await navigableSelect<NonNullable<CloudflareConfig["email"]>["sender"]>({
    message: "Use Cloudflare Email Workers?",
    options: [
      { value: "none", label: "None", hint: "Skip email sender binding" },
      { value: "cloudflare", label: "Cloudflare", hint: "Use Cloudflare email sender" },
    ],
    initialValue: "none",
  });

  if (isCancel(emailSender)) throw new UserCancelledError({ message: "Operation cancelled" });
  if (emailSender === "cloudflare") {
    next.email = { sender: "cloudflare" };
  }

  const domainMode = await navigableSelect<"none" | "todo" | "prompted">({
    message: "Configure Cloudflare custom domains?",
    options: [
      { value: "none", label: "None", hint: "Skip custom domains" },
      { value: "todo", label: "TODO placeholders", hint: "Generate domain TODO comments" },
      { value: "prompted", label: "Enter domains", hint: "Use concrete domain names" },
    ],
    initialValue: "none",
  });

  if (isCancel(domainMode)) throw new UserCancelledError({ message: "Operation cancelled" });
  if (domainMode === "todo") {
    next.domains = { mode: "todo" };
  } else if (domainMode === "prompted") {
    const domains: NonNullable<CloudflareConfig["domains"]> = { mode: "prompted" };

    if (context.webDeploy === "cloudflare") {
      const webDomain = await navigableText({
        message: "Cloudflare web domain",
        placeholder: "app.example.com",
      });

      if (isCancel(webDomain)) throw new UserCancelledError({ message: "Operation cancelled" });
      if (webDomain.trim()) {
        domains.web = webDomain.trim();
      }
    }

    if (context.serverDeploy === "cloudflare") {
      const serverDomain = await navigableText({
        message: "Cloudflare server domain",
        placeholder: "api.example.com",
      });

      if (isCancel(serverDomain)) {
        throw new UserCancelledError({ message: "Operation cancelled" });
      }
      if (serverDomain.trim()) {
        domains.server = serverDomain.trim();
      }
    }

    if (domains.web || domains.server) {
      next.domains = domains;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

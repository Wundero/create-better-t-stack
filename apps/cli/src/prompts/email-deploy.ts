import { supportsCloudflareEmailDeploy } from "@better-t-stack/types";

import { DEFAULT_CONFIG } from "../constants";
import type { Backend, EmailDeploy, ServerDeploy, WebDeploy } from "../types";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect, preferValidInitial } from "./navigable";

type EmailDeployOption = {
  value: EmailDeploy;
  label: string;
  hint: string;
};

export async function getEmailDeployChoice(
  deploy?: EmailDeploy,
  backend?: Backend,
  webDeploy?: WebDeploy,
  serverDeploy?: ServerDeploy,
  previousValue?: EmailDeploy,
) {
  if (deploy !== undefined) return deploy;

  const options: EmailDeployOption[] = [];

  if (supportsCloudflareEmailDeploy(backend, webDeploy, serverDeploy)) {
    options.push({
      value: "cloudflare",
      label: "Cloudflare Email Sending via Alchemy",
      hint: "Send emails through Cloudflare Workers using Alchemy",
    });
  }

  options.push(
    {
      value: "ses",
      label: "SES on AWS via Alchemy",
      hint: "Send emails through Amazon SES using Alchemy",
    },
    {
      value: "none",
      label: "None",
      hint: "Skip email deployment setup",
    },
  );

  const response = await navigableSelect<EmailDeploy>({
    message: "Email deploy",
    options,
    initialValue: preferValidInitial(options, previousValue, DEFAULT_CONFIG.emailDeploy),
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

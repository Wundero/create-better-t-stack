import { DEFAULT_CONFIG } from "../constants";
import type { Auth, Email, EmailProvider } from "../types";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect, navigableText } from "./navigable";

export async function getEmailChoice(email?: Email, auth?: Auth, _emailProvider?: EmailProvider) {
  if (email !== undefined) return email;

  const options = [
    {
      value: "react-email" as Email,
      label: "React Email",
      hint: "Transactional emails with React components",
    },
    {
      value: "none" as Email,
      label: "None",
      hint: "No email integration",
    },
  ];

  const response = await navigableSelect<Email>({
    message: "Select email integration",
    options,
    initialValue: DEFAULT_CONFIG.email,
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

export async function getEmailDomainChoice(
  email: Email,
  emailDomain?: string,
): Promise<string | undefined> {
  if (emailDomain !== undefined) return emailDomain || undefined;
  if (email !== "react-email") return undefined;

  const response = await navigableText({
    message: "Email domain (optional)",
    placeholder: "mail.example.com",
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response.trim() || undefined;
}

export async function getEmailProviderChoice(
  email: Email,
  emailProvider?: EmailProvider,
  serverDeploy?: string,
) {
  if (emailProvider !== undefined) return emailProvider;
  if (email === "none") return "none" as EmailProvider;

  const options = [
    {
      value: "cloudflare" as EmailProvider,
      label: "Cloudflare Email Sending",
      hint: "Send emails via Cloudflare Email Workers",
    },
    {
      value: "none" as EmailProvider,
      label: "None (TODO)",
      hint: "Skip provider setup for now",
    },
  ];

  const response = await navigableSelect<EmailProvider>({
    message: "Select email provider",
    options,
    initialValue: "none",
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  if (response === "cloudflare" && serverDeploy !== "cloudflare") {
    // Warn but allow - they may configure it later
    console.warn("Cloudflare Email Sending requires Cloudflare Workers deployment.");
  }

  return response;
}

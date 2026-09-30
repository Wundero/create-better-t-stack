import { DEFAULT_CONFIG } from "../constants";
import type { EmailRenderer } from "../types";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect, preferValidInitial } from "./navigable";

export async function getEmailsChoice(renderer?: EmailRenderer, previousValue?: EmailRenderer) {
  if (renderer !== undefined) return renderer;

  const options = [
    {
      value: "react-email" as EmailRenderer,
      label: "React Email",
      hint: "Build and send emails with React Email",
    },
    {
      value: "none" as EmailRenderer,
      label: "No emails",
      hint: "No email rendering setup",
    },
  ];

  const response = await navigableSelect<EmailRenderer>({
    message: "Email renderer",
    options,
    initialValue: preferValidInitial(options, previousValue, DEFAULT_CONFIG.emailRenderer),
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

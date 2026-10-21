import { DEFAULT_CONFIG } from "../constants";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableConfirm } from "./navigable";

export async function getPortlessChoice(portless?: boolean, previousValue?: boolean) {
  if (portless !== undefined) return portless;

  const response = await navigableConfirm({
    message: "Enable portless dev mode? (experimental)",
    initialValue: previousValue ?? DEFAULT_CONFIG.portless,
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

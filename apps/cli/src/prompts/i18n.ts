import { DEFAULT_CONFIG } from "../constants";
import type { I18n } from "../types";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect } from "./navigable";

export async function getI18nChoice(i18n?: I18n) {
  if (i18n !== undefined) return i18n;

  const options = [
    {
      value: "none" as I18n,
      label: "None",
      hint: "No internationalization",
    },
    {
      value: "lingui" as I18n,
      label: "Yes (Lingui)",
      hint: "Add Lingui internationalization",
    },
  ];

  const response = await navigableSelect<I18n>({
    message: "Add internationalization (i18n)?",
    options,
    initialValue: DEFAULT_CONFIG.i18n,
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

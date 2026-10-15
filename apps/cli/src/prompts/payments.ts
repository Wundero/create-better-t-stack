import {
  ALL_PAYMENT_IDS,
  getPaymentProvider,
  getPaymentsCapabilityIssue,
  isPaymentProvider,
  type PaymentProviderId,
} from "@better-t-stack/types";

import { DEFAULT_CONFIG } from "../constants";
import type { Auth, Backend, Frontend, Payments } from "../types";
import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect, preferValidInitial } from "./navigable";

type PaymentsOption = {
  value: Payments;
  label: string;
  hint: string;
};

/** Concrete providers the current auth/backend/frontend selection supports. */
export function getAvailablePaymentsProviders(
  auth?: Auth,
  backend?: Backend,
  frontend: readonly Frontend[] = [],
): PaymentProviderId[] {
  if (backend === "none") return [];

  return ALL_PAYMENT_IDS.filter(
    (id): id is PaymentProviderId =>
      isPaymentProvider(id) && getPaymentsCapabilityIssue(id, { auth, backend, frontend }) === null,
  );
}

export async function getPaymentsChoice(
  payments?: Payments,
  auth?: Auth,
  backend?: Backend,
  frontends: Frontend[] = [],
  previousValue?: Payments,
) {
  if (payments !== undefined) return payments;

  if (backend === "none") {
    return "none" as Payments;
  }

  const options: PaymentsOption[] = getAvailablePaymentsProviders(auth, backend, frontends).map(
    (id) => {
      const provider = getPaymentProvider(id);
      return { value: id, label: provider.label, hint: provider.description };
    },
  );

  if (options.length === 0) {
    return "none" as Payments;
  }

  options.push({ value: "none", label: "None", hint: "No payments integration" });

  const response = await navigableSelect<Payments>({
    message: "Add payments?",
    options,
    initialValue: preferValidInitial(options, previousValue, DEFAULT_CONFIG.payments),
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}

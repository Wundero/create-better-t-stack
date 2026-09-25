/**
 * Canonical registry of payments providers supported by the scaffolder.
 *
 * This module is intentionally dependency-free so it can be imported from the
 * shared schemas, the CLI, the web builder, and the template generator without
 * creating import cycles.
 *
 * Adding a provider means:
 *   1. adding its id to `PaymentProviderId`
 *   2. adding its metadata to `PAYMENT_PROVIDERS`
 *   3. adding its id to `PAYMENT_PROVIDER_IDS`
 *
 * The `PaymentsSchema` enum, CLI prompt, web builder options, capability
 * predicates, dependency injection, and env-var generation are all derived from
 * this registry.
 */

export type PaymentProviderId =
  | "polar"
  | "stripe"
  | "autumn"
  | "dodo"
  | "creem"
  | "chargebee"
  | "commet";

export type PaymentProviderEnvVar = {
  readonly key: string;
  readonly comment: string;
  readonly value: string;
};

export type PaymentProviderMeta = {
  readonly id: PaymentProviderId;
  readonly label: string;
  readonly description: string;
  /** slug for `${ICON_BASE_URL}/<slug>.svg`; empty means "no icon available yet". */
  readonly iconSlug: string;
  /** tailwind gradient used by the web builder card. */
  readonly color: string;
  /** provider's better-auth plugin requires the better-auth auth provider. */
  readonly requiresBetterAuth: boolean;
  /** provider has a first-class Convex integration (polar only). */
  readonly supportsConvex: boolean;
  /** provider has a first-class React Native integration (polar only). */
  readonly supportsNative: boolean;
  /** provider's client SDK is React-only (autumn). */
  readonly reactWebOnly: boolean;
  /** provider exposes a client-side checkout entrypoint. */
  readonly clientCheckout: boolean;
  /** provider's better-auth plugin extends the database schema (needs auth:generate + migrate). */
  readonly requiresMigration: boolean;
  /** npm packages injected into the auth/server workspace package.json. */
  readonly serverDeps: readonly string[];
  /** npm packages injected into the web workspace package.json. */
  readonly webDeps: readonly string[];
  /** server-side environment variables the provider expects. */
  readonly env: readonly PaymentProviderEnvVar[];
};

export const PAYMENT_PROVIDERS = {
  polar: {
    id: "polar",
    label: "Polar",
    description: "Turn your software into a business. 6 lines of code.",
    iconSlug: "polar",
    color: "from-purple-400 to-purple-600",
    requiresBetterAuth: true,
    supportsConvex: true,
    supportsNative: true,
    reactWebOnly: false,
    clientCheckout: true,
    requiresMigration: false,
    serverDeps: ["@polar-sh/better-auth", "@polar-sh/sdk"],
    webDeps: ["@polar-sh/better-auth", "@polar-sh/sdk"],
    env: [
      { key: "POLAR_ACCESS_TOKEN", comment: "Polar access token", value: "" },
      {
        key: "POLAR_SUCCESS_URL",
        comment: "URL to redirect to after checkout",
        value: "",
      },
    ],
  },
  stripe: {
    id: "stripe",
    label: "Stripe",
    description: "Online payment processing for internet businesses.",
    iconSlug: "",
    color: "from-indigo-400 to-indigo-600",
    requiresBetterAuth: true,
    supportsConvex: false,
    supportsNative: false,
    reactWebOnly: false,
    clientCheckout: true,
    requiresMigration: true,
    serverDeps: ["@better-auth/stripe", "stripe"],
    webDeps: ["@better-auth/stripe"],
    env: [
      { key: "STRIPE_SECRET_KEY", comment: "Stripe secret key", value: "" },
      {
        key: "STRIPE_WEBHOOK_SECRET",
        comment: "Stripe webhook signing secret",
        value: "",
      },
    ],
  },
  autumn: {
    id: "autumn",
    label: "Autumn",
    description: "Pricing and billing infrastructure for SaaS.",
    iconSlug: "",
    color: "from-emerald-400 to-emerald-600",
    requiresBetterAuth: true,
    supportsConvex: false,
    supportsNative: false,
    reactWebOnly: true,
    clientCheckout: true,
    requiresMigration: false,
    serverDeps: ["autumn-js"],
    webDeps: ["autumn-js"],
    env: [{ key: "AUTUMN_SECRET_KEY", comment: "Autumn secret key", value: "" }],
  },
  dodo: {
    id: "dodo",
    label: "Dodo Payments",
    description: "Merchant of record for global payments and billing.",
    iconSlug: "",
    color: "from-orange-400 to-orange-600",
    requiresBetterAuth: true,
    supportsConvex: false,
    supportsNative: false,
    reactWebOnly: false,
    clientCheckout: true,
    requiresMigration: true,
    serverDeps: ["@dodopayments/better-auth", "dodopayments", "zod"],
    webDeps: ["@dodopayments/better-auth"],
    env: [
      {
        key: "DODO_PAYMENTS_API_KEY",
        comment: "Dodo Payments API key",
        value: "",
      },
      {
        key: "DODO_PAYMENTS_WEBHOOK_SECRET",
        comment: "Dodo Payments webhook signing key",
        value: "",
      },
    ],
  },
  creem: {
    id: "creem",
    label: "Creem",
    description: "Merchant of record for SaaS and digital products.",
    iconSlug: "",
    color: "from-pink-400 to-pink-600",
    requiresBetterAuth: true,
    supportsConvex: false,
    supportsNative: false,
    reactWebOnly: false,
    clientCheckout: true,
    requiresMigration: true,
    serverDeps: ["@creem_io/better-auth"],
    webDeps: ["@creem_io/better-auth"],
    env: [
      { key: "CREEM_API_KEY", comment: "Creem API key", value: "" },
      {
        key: "CREEM_WEBHOOK_SECRET",
        comment: "Creem webhook signing secret",
        value: "",
      },
    ],
  },
  chargebee: {
    id: "chargebee",
    label: "Chargebee",
    description: "Subscription billing and revenue management.",
    iconSlug: "",
    color: "from-sky-400 to-sky-600",
    requiresBetterAuth: true,
    supportsConvex: false,
    supportsNative: false,
    reactWebOnly: false,
    clientCheckout: true,
    requiresMigration: true,
    serverDeps: ["@chargebee/better-auth", "chargebee"],
    webDeps: ["@chargebee/better-auth"],
    env: [
      { key: "CHARGEBEE_API_KEY", comment: "Chargebee API key", value: "" },
      { key: "CHARGEBEE_SITE", comment: "Chargebee site name", value: "" },
      {
        key: "CHARGEBEE_WEBHOOK_USERNAME",
        comment: "Chargebee webhook basic-auth username",
        value: "",
      },
      {
        key: "CHARGEBEE_WEBHOOK_PASSWORD",
        comment: "Chargebee webhook basic-auth password",
        value: "",
      },
    ],
  },
  commet: {
    id: "commet",
    label: "Commet",
    description: "Billing infrastructure for SaaS products.",
    iconSlug: "",
    color: "from-violet-400 to-violet-600",
    requiresBetterAuth: true,
    supportsConvex: false,
    supportsNative: false,
    reactWebOnly: false,
    clientCheckout: false,
    requiresMigration: false,
    serverDeps: ["@commet/better-auth", "@commet/node"],
    webDeps: ["@commet/better-auth"],
    env: [
      { key: "COMMET_API_KEY", comment: "Commet API key", value: "" },
      {
        key: "COMMET_WEBHOOK_SECRET",
        comment: "Commet webhook signing secret",
        value: "",
      },
    ],
  },
} as const satisfies Record<PaymentProviderId, PaymentProviderMeta>;

/** Provider ids that are new alongside the pre-existing `polar` integration. */
export const PAYMENT_PROVIDER_IDS = [
  "stripe",
  "autumn",
  "dodo",
  "creem",
  "chargebee",
  "commet",
] as const satisfies readonly PaymentProviderId[];

/** Every selectable payments value, in canonical order. */
export const ALL_PAYMENT_IDS = ["polar", ...PAYMENT_PROVIDER_IDS, "none"] as const;

export type AllPaymentId = (typeof ALL_PAYMENT_IDS)[number];

const PAYMENT_PROVIDER_KEY_SET: ReadonlySet<string> = new Set(Object.keys(PAYMENT_PROVIDERS));

export function isPaymentProviderId(value: string | undefined | null): value is PaymentProviderId {
  return value !== undefined && value !== null && PAYMENT_PROVIDER_KEY_SET.has(value);
}

/** True for any concrete provider selection (excludes `none`/undefined). */
export function isPaymentProvider(value: string | undefined | null): value is PaymentProviderId {
  return (
    value !== undefined && value !== null && value !== "none" && PAYMENT_PROVIDER_KEY_SET.has(value)
  );
}

export function getPaymentProvider(id: PaymentProviderId): PaymentProviderMeta {
  return PAYMENT_PROVIDERS[id];
}

/**
 * Requirement messages shared by the CLI validator, the web builder, and the
 * test compatibility oracle. Keep the wording stable: the matrix oracle matches
 * on these substrings.
 */
export function getPaymentsAuthRequirementMessage(id: PaymentProviderId): string {
  return `${getPaymentProvider(id).label} payments requires Better Auth. Please use '--auth better-auth' or choose a different payments provider.`;
}

export function getPaymentsConvexRequirementMessage(id: PaymentProviderId): string {
  return `${getPaymentProvider(id).label} payments are not supported with the Convex backend. Only Polar supports Convex.`;
}

export function getPaymentsNativeRequirementMessage(id: PaymentProviderId): string {
  return `${getPaymentProvider(id).label} payments are not supported for native-only stacks. Only Polar supports native-only stacks.`;
}

export function getPaymentsReactRequirementMessage(id: PaymentProviderId): string {
  return `${getPaymentProvider(id).label} payments require a React web frontend (Next.js, TanStack Router, React Router, or TanStack Start).`;
}

# Observability Addons Design

## Goal

Create a first-class Observability addon section containing `opentelemetry`, `posthog`, and `evlog`. `evlog` should remain usable on its own, but when `opentelemetry` or `posthog` are also selected, generated evlog hooks should forward compatible telemetry to the shared observability package.

---

## Background

`evlog` already exists and is grouped under `Observability`. It wires request logging, Better Auth context, and AI SDK telemetry for server and fullstack backends. There is no shared observability package yet. This design adds OpenTelemetry and PostHog as first-class addons.

---

## 1. Data Model

```ts
type ObservabilityAddon = "opentelemetry" | "posthog" | "evlog";

type ObservabilityConfig = {
  opentelemetry?: {
    traces?: boolean;
    logs?: boolean;
    metrics?: boolean;
    endpoint?: string;
    headers?: Record<string, string>;
    sampleRate?: number;
  };
  posthog?: {
    region?: "us" | "eu";
    productAnalytics?: boolean;
    sessionReplay?: boolean;
    logs?: boolean;
  };
  evlog?: {
    sinks?: Array<"console" | "opentelemetry" | "posthog">;
  };
};
```

---

## 2. Generated Package

Add `packages/observability` when any observability addon is selected:

```
packages/observability/
  package.json
  src/
    index.ts
    logger.ts
    otel.ts
    posthog.ts
    events.ts
```

**Responsibilities:**

- Normalize app events.
- Provide no-op defaults when env vars are missing.
- Export helpers for request lifecycle, auth events, AI events, and product events.

---

## 3. OpenTelemetry

### 3.1 Node/Bun Server Runtimes

- Add OpenTelemetry API and SDK dependencies.
- Generate a bootstrap module that configures traces, metrics, and logs.
- Use OTLP HTTP exporters when endpoint env vars are provided.

### 3.2 Cloudflare Workers

- Prefer Cloudflare's built-in Workers observability for traces and logs.
- Generate Alchemy/Wrangler observability config when deploying to Cloudflare.
- Do not promise OTel metrics export from Workers yet, because Cloudflare currently documents traces and logs export but not metrics export.

---

## 4. PostHog

### 4.1 Frontend

- Add `posthog-js` where a web frontend exists.
- Generate a provider for React-based frontends, framework plugin/config for Nuxt/Svelte/Astro where appropriate, and no-op helpers for unsupported surfaces.

### 4.2 Server

- Add a server-side PostHog helper in `packages/observability`.
- For Workers logs, generate Cloudflare observability log export TODOs or Alchemy config if supported.
- For product events, use PostHog capture APIs from server code where runtime support is solid.

---

## 5. evlog Integration

1. Keep existing evlog request logging.
2. Add an adapter layer:
   - `toOtelAttributes(event)`
   - `toPostHogEvent(event)`
3. When `evlog` and `opentelemetry` are selected, create spans or structured logs for request/auth/AI events.
4. When `evlog` and `posthog` are selected, capture product-style events for auth and AI interactions, with PII-safe defaults.

---

## 6. Prompt and UI Changes

- Update addon group order:
  - Observability: `opentelemetry`, `posthog`, `evlog`
- Add clear hints:
  - OpenTelemetry: "Vendor-neutral traces, logs, and metrics"
  - PostHog: "Product analytics, logs, and session replay"
  - evlog: "Structured request, auth, and AI event logging"

---

## 7. Tests

- Schema tests for addon options.
- Compatibility tests for Cloudflare limitations.
- Generation tests for:
  - `opentelemetry` alone
  - `posthog` alone
  - `evlog + opentelemetry`
  - `evlog + posthog`
  - All three together

---

## 8. References

- OpenTelemetry JS: https://opentelemetry.io/docs/languages/js/
- Cloudflare Workers OTel export: https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
- Cloudflare Workers traces: https://developers.cloudflare.com/workers/observability/traces/
- Cloudflare Workers PostHog logs export: https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/posthog/

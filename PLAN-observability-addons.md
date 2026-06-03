# Plan: Observability Addons For OpenTelemetry, PostHog, And evlog

## Goal

Create a first-class Observability addon section containing:

- `opentelemetry`
- `posthog`
- `evlog`

`evlog` should remain usable on its own, but when `opentelemetry` or `posthog` are also selected, generated evlog hooks should forward compatible telemetry to the shared observability package.

## Current State

- `evlog` already exists and is grouped under `Observability`.
- It wires request logging, Better Auth context, and AI SDK telemetry for server and fullstack backends.
- There is no shared observability package yet.

## Proposed Addon Options

```ts
addonOptions?: {
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
}
```

## Generated Package

Add `packages/observability` when any observability addon is selected:

```text
packages/observability/
  package.json
  src/
    index.ts
    logger.ts
    otel.ts
    posthog.ts
    events.ts
```

Responsibilities:

- Normalize app events.
- Provide no-op defaults when env vars are missing.
- Export helpers for request lifecycle, auth events, AI events, and product events.

## OpenTelemetry Plan

For Node/Bun server runtimes:

- Add OpenTelemetry API and SDK dependencies.
- Generate a bootstrap module that configures traces, metrics, and logs.
- Use OTLP HTTP exporters when endpoint env vars are provided.

For Cloudflare Workers:

- Prefer Cloudflare's built-in Workers observability for traces and logs.
- Generate Alchemy/Wrangler observability config when deploying to Cloudflare.
- Do not promise OTel metrics export from Workers yet, because Cloudflare currently documents traces and logs export but not metrics export.

## PostHog Plan

Frontend:

- Add `posthog-js` where a web frontend exists.
- Generate a provider for React-based frontends, framework plugin/config for Nuxt/Svelte/Astro where appropriate, and no-op helpers for unsupported surfaces.

Server:

- Add a server-side PostHog helper in `packages/observability`.
- For Workers logs, generate Cloudflare observability log export TODOs or Alchemy config if supported.
- For product events, use PostHog capture APIs from server code where runtime support is solid.

## evlog Integration

1. Keep existing evlog request logging.
2. Add an adapter layer:
   - `toOtelAttributes(event)`
   - `toPostHogEvent(event)`
3. When `evlog` and `opentelemetry` are selected, create spans or structured logs for request/auth/AI events.
4. When `evlog` and `posthog` are selected, capture product-style events for auth and AI interactions, with PII-safe defaults.

## Prompt And UI Changes

- Update addon group order:
  - Observability: `opentelemetry`, `posthog`, `evlog`
- Add clear hints:
  - OpenTelemetry: "Vendor-neutral traces, logs, and metrics"
  - PostHog: "Product analytics, logs, and session replay"
  - evlog: "Structured request, auth, and AI event logging"

## Tests

- Add schema tests for addon options.
- Add compatibility tests for Cloudflare limitations.
- Add generation tests for:
  - `opentelemetry` alone
  - `posthog` alone
  - `evlog + opentelemetry`
  - `evlog + posthog`
  - all three together

## References

- OpenTelemetry JavaScript docs: https://opentelemetry.io/docs/languages/js/
- Cloudflare Workers OTel export: https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
- Cloudflare Workers traces: https://developers.cloudflare.com/workers/observability/traces/
- Cloudflare Workers PostHog logs export: https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/posthog/

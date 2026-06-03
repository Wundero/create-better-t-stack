# Plan: Fix Better Auth Expo Immutable Headers On Cloudflare Workers

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/738

## Problem

When Better Auth is generated with the Expo plugin and the backend runs on Cloudflare Workers, native Expo auth requests can fail with:

```txt
TypeError: Can't modify immutable headers.
```

The issue report notes that web auth works and the failure appears only when requests come from the React Native/Expo client. The generated templates currently pass framework request objects directly into `auth.handler(...)` and often pass raw request headers directly into `auth.api.getSession(...)`. In Workers, these headers can be immutable.

## Current Repo Surface

Likely affected generated auth route templates:

- `packages/template-generator/templates/backend/server/hono/src/index.ts.hbs`
- `packages/template-generator/templates/backend/server/elysia/src/index.ts.hbs`
- `packages/template-generator/templates/backend/server/fastify/src/index.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/fullstack/next/src/app/api/auth/[...all]/route.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/fullstack/tanstack-start/src/routes/api/auth/$.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/fullstack/astro/src/pages/api/auth/[...all].ts.hbs`
- `packages/template-generator/templates/auth/better-auth/fullstack/nuxt/server/api/auth/[...all].ts.hbs`

Likely affected session/context templates:

- `packages/template-generator/templates/api/trpc/server/src/context.ts.hbs`
- `packages/template-generator/templates/api/orpc/server/src/context.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/web/react/next/src/app/dashboard/page.tsx.hbs`
- `packages/template-generator/templates/auth/better-auth/web/react/tanstack-start/src/middleware/auth.ts.hbs`
- Other Better Auth dashboard/middleware templates that pass `headers` into `auth.api.getSession`.

The current auth plugin insertion logic is in:

- `packages/template-generator/src/processors/auth-plugins.ts`

## Proposed Fix

Add a small generated helper that safely clones request and response headers before Better Auth touches them in Cloudflare-compatible runtime paths.

Recommended helper location:

- `packages/template-generator/templates/auth/better-auth/server/base/src/lib/cloudflare-auth.ts.hbs`

Generated shape:

```ts
export function cloneRequestForAuth(request: Request) {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  };

  if (init.body) {
    init.duplex = "half";
  }

  return new Request(request.url, init);
}

export function cloneResponseForAuth(response: Response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

export function cloneHeadersForAuth(headers: HeadersInit) {
  return new Headers(headers);
}
```

Use this helper only when the generated backend can execute as Cloudflare Workers:

- `runtime === "workers"`
- `serverDeploy === "cloudflare"`
- `backend === "self" && webDeploy === "cloudflare"`

## Implementation Steps

1. Generate the helper when `auth === "better-auth"` and any Cloudflare runtime/deploy condition is true.
2. Update Hono auth routes to clone before and after Better Auth:
   - `const request = cloneRequestForAuth(c.req.raw);`
   - `const response = await createAuth().handler(request);`
   - `return cloneResponseForAuth(response);`
3. Update Elysia/Fastify/fullstack route templates with the same pattern, using each framework's raw `Request`.
4. Update `getSession` calls in tRPC/oRPC context templates to pass cloned headers:
   - `headers: cloneHeadersForAuth(context.req.raw.headers)`
   - `headers: cloneHeadersForAuth(headers)`
5. Keep Node/Bun templates unchanged unless they share the same file and need conditional Handlebars blocks.
6. Regenerate `packages/template-generator/src/templates.generated.ts`.
7. Add regression coverage for generated Cloudflare + Better Auth + native frontend output.

## Tests

Add or extend CLI/template tests to assert:

- Cloudflare Workers + Hono + Better Auth + native frontend auth route imports the helper.
- Generated auth route does not pass `c.req.raw` directly to `auth.handler`.
- Generated auth route wraps `Response` headers in `new Headers(...)`.
- tRPC and oRPC Cloudflare contexts call `auth.api.getSession` with cloned headers.
- Non-Cloudflare Node/Bun output remains unchanged.

Likely test file:

- `apps/cli/test/cloudflare-db-clients.test.ts`

If that file becomes too broad, add:

- `apps/cli/test/better-auth-cloudflare.test.ts`

## Risk Notes

- Request body streams can only be consumed once. The helper must not read the body before passing it to Better Auth.
- `duplex: "half"` is needed for streamed request bodies in Node-compatible fetch implementations, but TypeScript requires a cast.
- Do not clone `GET` or `HEAD` bodies.
- If Better Auth later fixes this internally, the generated clone remains harmless for Workers.

## References

- Issue #738: https://github.com/AmanVarshney01/create-better-t-stack/issues/738
- Better Auth Expo integration: https://better-auth.com/docs/integrations/expo
- Cloudflare Workers bindings and runtime env model: https://developers.cloudflare.com/workers/configuration/bindings/

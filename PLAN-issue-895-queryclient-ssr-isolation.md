# Plan: Replace QueryClient Singletons With SSR-Safe Factories

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/895

## Problem

Several templates export a module-level `QueryClient` singleton:

```ts
export const queryClient = new QueryClient(...)
```

This is safe enough for browser-only SPAs, but it is unsafe in SSR contexts because server requests can share query cache state. TanStack Query's SSR guidance recommends a fresh `QueryClient` per request on the server and a stable instance per browser lifecycle on the client.

## Current Repo Surface

QueryClient singletons appear in:

- `packages/template-generator/templates/api/trpc/web/react/base/src/utils/trpc.ts.hbs`
- `packages/template-generator/templates/api/orpc/web/react/base/src/utils/orpc.ts.hbs`
- `packages/template-generator/templates/api/trpc/native/utils/trpc.ts.hbs`
- `packages/template-generator/templates/api/orpc/native/utils/orpc.ts.hbs`
- `packages/template-generator/templates/api/orpc/web/solid/src/utils/orpc.ts.hbs`
- `packages/template-generator/templates/api/orpc/web/svelte/src/lib/orpc.ts.hbs`
- `packages/template-generator/templates/frontend/react/next/src/components/providers.tsx.hbs`
- `packages/template-generator/templates/frontend/react/tanstack-start/src/router.tsx.hbs`
- `packages/template-generator/templates/frontend/react/tanstack-router/src/main.tsx.hbs`
- `packages/template-generator/templates/frontend/react/react-router/src/root.tsx.hbs`
- `packages/template-generator/templates/frontend/native/*/app/_layout.tsx.hbs`

Many auth example components import `queryClient` directly to invalidate or refetch queries.

## Proposed Fix

Use factories universally, but instantiate them at the correct lifecycle boundary:

- Server request: create a new `QueryClient`.
- Browser app/root provider: create once with `useState`, `useMemo`, or framework equivalent.
- Router context: pass the instance through router context.
- Components: use `useQueryClient()` or framework equivalent instead of importing a singleton.

Recommended naming:

```ts
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // existing toast behavior
      },
    }),
  });
}
```

For tRPC/oRPC, avoid binding utilities to a singleton:

```ts
export function createTRPCUtils(queryClient: QueryClient) {
  const client = createTRPCClient<AppRouter>({ links: [...] });

  return createTRPCOptionsProxy<AppRouter>({
    client,
    queryClient,
  });
}
```

## React/Next Plan

1. Change tRPC/oRPC utility templates to export `createQueryClient` and `createTRPCUtils`/`createORPCUtils`.
2. In `Providers`, create a stable client:

```tsx
const [queryClient] = useState(() => createQueryClient());
```

3. Create tRPC/oRPC utils with that client and pass them through context/provider as needed.
4. Replace direct component imports of `queryClient` with `useQueryClient()`.

## TanStack Start Plan

TanStack Start already has a router factory area where per-request objects can be created.

1. Keep `createRouter()` responsible for creating request-local query clients on the server.
2. Remove exported module-level `queryClient`.
3. Ensure router context receives the per-router `queryClient`.
4. Update route contexts/types to expect the context-provided instance.

## React Router/TanStack Router SPA Plan

Even though these may be SPA-only in many outputs, use the same factory pattern:

1. Instantiate `const queryClient = createQueryClient()` in `main.tsx` or root bootstrap.
2. Pass the instance into `QueryClientProvider`.
3. Pass it into router context where needed.
4. Keep mutation components using `useQueryClient()`.

## Native Plan

Native apps are not SSR, but use the same factory for consistency:

1. Export `createQueryClient`.
2. Instantiate once in `_layout.tsx` with `useState`.
3. Replace direct imports in sign-in/sign-up/dashboard components with `useQueryClient()`.

## Svelte/Solid/Nuxt Plan

- Nuxt's plugin already creates a client inside plugin scope and hydrates/dehydrates; audit it but likely leave the lifecycle pattern intact.
- Solid/Svelte utility modules currently export singletons; replace with factory and instantiate at app provider/plugin boundaries.
- Components should use framework query-client hooks/utilities instead of direct singleton imports.

## Implementation Steps

1. Add shared query-client factory patterns to tRPC and oRPC templates.
2. Update providers/root layouts to create the instance at runtime boundaries.
3. Replace direct `queryClient` imports in auth and example templates.
4. Update router context types and setup files.
5. Regenerate `templates.generated.ts`.
6. Add generated-output tests that assert no SSR-capable web template exports `new QueryClient` at module scope.

## Tests

Add tests for generated output:

- Next + tRPC has `useState(() => createQueryClient())`.
- Next + oRPC has no `export const queryClient = new QueryClient`.
- TanStack Start creates a QueryClient inside router creation, not as a module-level singleton.
- Native components use `useQueryClient()` for invalidation/refetch.
- Existing auth examples still invalidate/refetch after sign-in/sign-up.

Useful broad assertion:

```sh
rg "export const queryClient = new QueryClient" generated-output
```

This should be empty for web SSR-capable outputs after the fix.

## Risk Notes

- Calling `createQueryClient()` directly inside a React render would reset cache on every render. Use lazy state.
- tRPC/oRPC helper APIs may need small wrapper functions so they do not require a singleton query client.
- Some SPA generated code may get slightly more verbose, but a universal pattern prevents future SSR regressions.

## References

- Issue #895: https://github.com/AmanVarshney01/create-better-t-stack/issues/895
- TanStack Query SSR guide: https://tanstack.com/query/latest/docs/framework/react/guides/ssr

# Plan: Add Better Auth Organizations Support

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/839

## Problem

Better Auth has an organization plugin for SaaS-style multi-tenant access control. The issue asks for create-better-t-stack to scaffold it, including compatibility with payment providers like Polar.

The repo currently generates Better Auth, Better Auth client plugins, and Polar payments, but there is no user-facing option for the Better Auth organization plugin.

## Current Repo Surface

Auth/plugin generation:

- `packages/template-generator/templates/auth/better-auth/server/base/src/index.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/web/react/base/src/lib/auth-client.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/web/nuxt/app/plugins/auth-client.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/web/svelte/src/lib/auth-client.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/web/solid/src/lib/auth-client.ts.hbs`
- `packages/template-generator/src/processors/auth-plugins.ts`

Auth schema templates:

- `packages/template-generator/templates/auth/better-auth/server/db/drizzle/*/src/schema/auth.ts.hbs`
- `packages/template-generator/templates/auth/better-auth/server/db/prisma/*/prisma/schema/auth.prisma.hbs`

CLI/type config:

- `packages/types/src/schemas.ts`
- `packages/types/src/json-schema.ts`
- `apps/cli/src/prompts/config-prompts.ts`
- `apps/cli/src/utils/config-validation.ts`
- `apps/cli/src/index.ts`

Payments integration:

- `packages/template-generator/templates/payments/polar/*`
- `packages/template-generator/src/processors/payments-deps.ts`

## Proposed Product Shape

Add an auth-feature option rather than overloading generic addons:

```ts
authFeatures: ["organization"];
```

CLI examples:

```sh
bun create better-t-stack my-app --auth better-auth --auth-features organization
```

Config examples:

```json
{
  "auth": "better-auth",
  "authFeatures": ["organization"]
}
```

Validation:

- `organization` requires `auth === "better-auth"`.
- `organization` requires a persistent database.
- `organization` should support Polar but not require Polar.
- If `payments === "polar"`, generated organization settings can include TODO hooks for plan/member limits.

## Server Implementation

When `authFeatures` includes `organization`:

1. Import `organization` from `better-auth/plugins`.
2. Add `organization(...)` to the Better Auth server plugins array.
3. Generate an optional permissions file:
   - `packages/auth/src/permissions.ts`
4. Keep defaults simple at first:
   - allow org creation by default.
   - scaffold TODO hooks for plan-aware limits when Polar is selected.

Example generated plugin:

```ts
organization({
  // TODO: Restrict organization creation or member limits by plan.
});
```

For Polar-selected projects, add commented or minimal hooks:

```ts
organization({
  organizationLimit: async (user) => {
    // TODO: Look up the user's active Polar subscription.
    return false;
  },
});
```

Only enable paid-plan behavior once a reliable customer/subscription lookup is available in generated code.

## Client Implementation

When `authFeatures` includes `organization`:

1. Import `organizationClient` from `better-auth/client/plugins`.
2. Add `organizationClient()` to auth client plugin arrays.
3. Merge with existing `polarClient()` plugin when `payments === "polar"`.
4. Add a small dashboard section for organization basics:
   - create organization form or button.
   - list organizations.
   - show active organization.

Keep the first implementation lightweight. Avoid generating a full SaaS admin UI until core schema/client/server support is stable.

## Schema And Migrations

Better Auth organization support needs additional tables. Options:

1. Prefer Better Auth CLI-generated schema if the current Better Auth integration already has a generation path.
2. Otherwise add explicit templates for Drizzle and Prisma organization tables.

For Drizzle, add organization plugin tables alongside existing auth schema:

- `organization`
- `member`
- `invitation`
- optional team tables if Better Auth's selected plugin config requires them.

For Prisma, add models to the auth schema templates for every supported database.

## Implementation Steps

1. Add `AuthFeatureSchema = z.enum(["organization"])` and `authFeatures` to shared config types.
2. Add CLI flag and prompt for Better Auth feature selection.
3. Update compatibility rules.
4. Update Better Auth server templates/processors to include `organization`.
5. Update web auth client templates to include `organizationClient`.
6. Add Drizzle and Prisma schema templates for organization tables.
7. Add optional dashboard UI snippets for supported frontend families.
8. Add package deps if Better Auth exposes organization through existing `better-auth` package only; otherwise add the needed package.
9. Regenerate `templates.generated.ts`.
10. Update README/docs snippets and post-install guidance.

## Tests

Add generation tests for:

- Better Auth + organization + Drizzle/Postgres.
- Better Auth + organization + Prisma/Postgres.
- Better Auth + organization + Polar.
- Better Auth + organization + no payments.
- Invalid config: organization without Better Auth.
- Auth client plugin arrays merge `organizationClient()` with `polarClient()`.

## Risk Notes

- Better Auth's organization schema may change across versions. Keep generated schema aligned with the installed Better Auth version.
- Combining organization limits with Polar requires a clear source of truth for subscriptions.
- Avoid generating access-control code that looks production-complete but has placeholder authorization.

## References

- Issue #839: https://github.com/AmanVarshney01/create-better-t-stack/issues/839
- Better Auth organization plugin: https://better-auth.com/docs/plugins/organization
- Better Auth plugin concepts: https://better-auth.com/docs/concepts/plugins

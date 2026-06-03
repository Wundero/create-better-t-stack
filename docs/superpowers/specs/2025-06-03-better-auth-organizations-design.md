# Better Auth Organizations Support Design

## Goal

Add a first-class `organization` option for Better Auth that scaffolds the organization plugin, client-side integration, schema additions, and optional Polar payment hooks.

---

## Background

Better Auth has an organization plugin for SaaS-style multi-tenant access control. Currently, `create-better-t-stack` generates Better Auth, Better Auth client plugins, and Polar payments, but there is no user-facing option for the organization plugin.

GitHub issue: https://github.com/AmanVarshney01/create-better-t-stack/issues/839

---

## 1. Data Model

```ts
type AuthFeature = "organization";

type AuthConfig = {
  auth: "better-auth"; // organization requires better-auth
  authFeatures?: AuthFeature[];
};
```

### 1.1 Constraints

- `organization` requires `auth === "better-auth"`.
- `organization` requires a persistent database.
- `organization` supports Polar but does not require Polar.

---

## 2. CLI API

```sh
bun create better-t-stack my-app --auth better-auth --auth-features organization
```

Config:

```json
{
  "auth": "better-auth",
  "authFeatures": ["organization"]
}
```

---

## 3. Server Implementation

When `authFeatures` includes `organization`:

1. Import `organization` from `better-auth/plugins`.
2. Add `organization(...)` to the Better Auth server plugins array.
3. Generate an optional permissions file:
   - `packages/auth/src/permissions.ts`
4. Keep defaults simple:
   - Allow org creation by default.
   - Scaffold TODO hooks for plan-aware limits when Polar is selected.

### 3.1 Generated Plugin

```ts
organization({
  // TODO: Restrict organization creation or member limits by plan.
});
```

### 3.2 Polar Integration

```ts
organization({
  organizationLimit: async (user) => {
    // TODO: Look up the user's active Polar subscription.
    return false;
  },
});
```

Only enable paid-plan behavior once a reliable customer/subscription lookup is available in generated code.

---

## 4. Client Implementation

When `authFeatures` includes `organization`:

1. Import `organizationClient` from `better-auth/client/plugins`.
2. Add `organizationClient()` to auth client plugin arrays.
3. Merge with existing `polarClient()` plugin when `payments === "polar"`.
4. Add a small dashboard section for organization basics:
   - Create organization form or button.
   - List organizations.
   - Show active organization.

Keep the first implementation lightweight. Avoid generating a full SaaS admin UI until core schema/client/server support is stable.

---

## 5. Schema and Migrations

Better Auth organization support needs additional tables.

### 5.1 Preferred Path

Use Better Auth CLI-generated schema if the current Better Auth integration already has a generation path.

### 5.2 Fallback Path

Add explicit templates for Drizzle and Prisma organization tables.

**Drizzle tables:**

- `organization`
- `member`
- `invitation`
- Optional team tables if Better Auth's selected plugin config requires them.

**Prisma:**
Add models to the auth schema templates for every supported database.

---

## 6. Implementation

1. Add `AuthFeatureSchema = z.enum(["organization"])` and `authFeatures` to shared config types.
2. Add CLI flag and prompt for Better Auth feature selection.
3. Update compatibility rules.
4. Update Better Auth server templates/processors to include `organization`.
5. Update web auth client templates to include `organizationClient`.
6. Add Drizzle and Prisma schema templates for organization tables.
7. Add optional dashboard UI snippets for supported frontend families.
8. Add package deps if Better Auth exposes organization through existing `better-auth` package only; otherwise add the needed package.
9. Regenerate `packages/template-generator/src/templates.generated.ts`.
10. Update README/docs snippets and post-install guidance.

---

## 7. Tests

- Better Auth + organization + Drizzle/Postgres.
- Better Auth + organization + Prisma/Postgres.
- Better Auth + organization + Polar.
- Better Auth + organization + no payments.
- Invalid config: organization without Better Auth.
- Auth client plugin arrays merge `organizationClient()` with `polarClient()`.

---

## 8. Risk Notes

- Better Auth's organization schema may change across versions. Keep generated schema aligned with the installed Better Auth version.
- Combining organization limits with Polar requires a clear source of truth for subscriptions.
- Avoid generating access-control code that looks production-complete but has placeholder authorization.

---

## 9. References

- Issue #839: https://github.com/AmanVarshney01/create-better-t-stack/issues/839
- Better Auth organization plugin: https://better-auth.com/docs/plugins/organization
- Better Auth plugin concepts: https://better-auth.com/docs/concepts/plugins

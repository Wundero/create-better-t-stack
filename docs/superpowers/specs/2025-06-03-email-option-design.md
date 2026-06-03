# Email Option Design

## Goal

Add a first-class `email` option that generates a reusable email package, supports React Email templates styled with Tailwind/shadcn-compatible tokens, and wires Better Auth transactional emails through the selected provider.

---

## Background

Currently, `create-better-t-stack` does not scaffold any email infrastructure. Projects that need transactional emails must set up React Email and providers manually. This design adds email as a configurable option that integrates with the existing auth and deployment stack.

---

## 1. Data Model

### 1.1 Schema

```ts
type EmailOption = "none" | "react-email";

type EmailProvider = "none" | "cloudflare";

type EmailConfig = {
  email: EmailOption;
  emailProvider?: EmailProvider;
  emailOptions?: {
    from?: string;
    replyTo?: string;
  };
};
```

### 1.2 Defaults

- `email`: `"none"`
- `emailProvider`: `"none"`
- `emailOptions`: `{}`

### 1.3 Constraints

- `emailProvider === "cloudflare"` is the only supported provider for now.
- Cloudflare Email Sending requires Cloudflare deployment or a TODO-only setup.

---

## 2. Generated Package Structure

When `email !== "none"`, scaffold `packages/email/`:

```
packages/email/
  package.json
  tsconfig.json
  src/
    index.ts
    send.ts
    templates/
      verify-email.tsx
      reset-password.tsx
      change-email.tsx
      magic-link.tsx
      invite-user.tsx
    theme.ts
```

### 2.1 Dependencies

- `react`
- `react-email`
- `@react-email/render` (if rendering is split from CLI)
- `tailwindcss` (if needed by React Email setup)
- Local `@<scope>/ui` when the generated stack includes the UI package

---

## 3. Styling Strategy

- Use React Email's `Tailwind` component with a generated email-safe theme.
- Reuse shadcn-style tokens from the UI package where possible, but do not import browser-only UI components directly into emails.
- Generate email-specific primitives if needed:
  - `EmailButton`
  - `EmailCard`
  - `EmailText`

---

## 4. Cloudflare Provider

Generated `packages/email/src/send.ts` accepts a provider env object:

```ts
type SendEmailBinding = {
  send(input: {
    to: string | Array<{ email: string }>;
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
  }): Promise<unknown>;
};
```

For Workers, bind Cloudflare Email Sending as `EMAIL`.

### 4.1 Alchemy Integration

- Add Email Sending binding support to `packages/infra/alchemy.run.ts.hbs`.
- If Alchemy does not expose a dedicated Email Sending resource yet, generate a clear TODO and Worker binding shape.

---

## 5. Better Auth Wiring

When `auth === "better-auth"` and `email !== "none"`:

1. Import email helpers into `packages/auth/src/index.ts`.
2. Configure:
   - `emailVerification.sendVerificationEmail`
   - `emailAndPassword.sendResetPassword`
   - `user.changeEmail.sendChangeEmailConfirmation` (when change-email support is enabled)
3. Use `request` or Cloudflare execution context where available to send without blocking the auth response.
4. Generate env vars:
   - `EMAIL_FROM`
   - `EMAIL_REPLY_TO`
   - Cloudflare binding `EMAIL`

---

## 6. CLI Prompt Flow

After auth/provider prompts, add an email selection step:

- If the user picks `"none"`, skip.
- If the user picks `"react-email"`, show provider options (currently only Cloudflare).
- If provider is Cloudflare but deployment is not Cloudflare, show a warning with a TODO-only setup option.

---

## 7. Tests

- Schema tests for `email` and provider combinations.
- Virtual generation test for `packages/email`.
- Better Auth template test asserting `sendVerificationEmail` is wired.
- Cloudflare infra test asserting `EMAIL` binding or TODO is emitted.

---

## 8. References

- React Email Tailwind: https://react.email/docs/components/tailwind
- Better Auth email verification: https://better-auth.com/docs/reference/options
- Better Auth email concepts: https://better-auth.com/docs/concepts/email
- Cloudflare Email Sending: https://developers.cloudflare.com/email-service/get-started/send-emails/
- Cloudflare Email Routing Workers binding: https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/
- Alchemy Email Routing: https://alchemy.run/providers/cloudflare/email-routing/

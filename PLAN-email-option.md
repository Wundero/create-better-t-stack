# Plan: Add An `email` Option

## Goal

Add a first-class `email` option that generates a reusable email package, supports React Email templates styled with Tailwind/shadcn-compatible tokens, and wires Better Auth transactional emails through the selected provider.

## Proposed Options

```ts
email: "none" | "react-email";

emailProvider?: "none" | "cloudflare";

emailOptions?: {
  from?: string;
  replyTo?: string;
}
```

For now, only provider support is Cloudflare Email Sending through Alchemy/Cloudflare Workers bindings.

## Generated Package

```text
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

Dependencies:

- `react`
- `react-email`
- `@react-email/render` if rendering is split from the CLI package
- `tailwindcss` only if needed by React Email setup
- local `@<scope>/ui` when the generated stack includes the UI package

## Styling Strategy

- Use React Email's `Tailwind` component with a small generated email-safe theme.
- Reuse shadcn-style tokens from the UI package where possible, but do not import browser-only UI components directly into emails.
- Generate email-specific primitives if needed:
  - `EmailButton`
  - `EmailCard`
  - `EmailText`

## Cloudflare Provider Plan

Generated `packages/email/src/send.ts` should accept a provider env object:

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

Alchemy work:

- Add Email Sending binding support to `packages/infra/alchemy.run.ts.hbs`.
- If Alchemy does not expose a dedicated Email Sending resource yet, generate a clear TODO and Worker binding shape.

## Better Auth Wiring

When `auth` is `better-auth` and `email` is enabled:

1. Import email helpers into `packages/auth/src/index.ts`.
2. Configure:
   - `emailVerification.sendVerificationEmail`
   - `emailAndPassword.sendResetPassword`
   - `user.changeEmail.sendChangeEmailConfirmation` when change-email support is enabled
3. Use `request` or Cloudflare execution context where available to send without blocking the auth response.
4. Generate env vars:
   - `EMAIL_FROM`
   - `EMAIL_REPLY_TO`
   - Cloudflare binding `EMAIL`

## CLI And Schema Changes

- Add `EmailSchema`.
- Add prompt after auth/provider prompts.
- If user picks Cloudflare Email, require Cloudflare deployment or allow a TODO-only generated setup.
- Add config to MCP schema and reproducible command generation.

## Tests

- Schema tests for `email` and provider combinations.
- Virtual generation test for `packages/email`.
- Better Auth template test asserting `sendVerificationEmail` is wired.
- Cloudflare infra test asserting `EMAIL` binding or TODO is emitted.

## References

- React Email Tailwind component: https://react.email/docs/components/tailwind
- Better Auth email verification options: https://better-auth.com/docs/reference/options
- Better Auth email concept guide: https://better-auth.com/docs/concepts/email
- Cloudflare Email Sending from Workers: https://developers.cloudflare.com/email-service/get-started/send-emails/
- Cloudflare Email Routing send-email Workers binding: https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/
- Alchemy Email Routing: https://alchemy.run/providers/cloudflare/email-routing/

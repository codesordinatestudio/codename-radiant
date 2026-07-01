# Email

Radiant includes a built-in email system with templated emails for common flows (welcome, password reset, email verification). You supply a transport plugin — Nodemailer for SMTP, or Resend for API-based sending.

## Configuration

Pass an email transport when creating the app:

```typescript
import { createRadiant } from "../radiant/runtime";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";
import { nodemailerEmail } from "@codesordinatestudio/radiant-plugin-nodemailer";

export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
  email: {
    from: "no-reply@myapp.com",
    appName: "My App",
    resetTokenExpiryMinutes: 30,
    resetPasswordUrl: "https://myapp.com/reset-password",
    verifyEmailUrl: "https://myapp.com/verify-email",
    transport: nodemailerEmail({
      host: "smtp.mailgun.org",
      port: 587,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    }),
  },
});
```

## Transport Plugins

### Nodemailer (SMTP)

Install: `bun add @codesordinatestudio/radiant-plugin-nodemailer`

```typescript
import { nodemailerEmail } from "@codesordinatestudio/radiant-plugin-nodemailer";

transport: nodemailerEmail({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})
```

Also supports environment-variable fallbacks: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.

### Resend (API)

Install: `bun add @codesordinatestudio/radiant-plugin-resend`

```typescript
import { resendEmail } from "@codesordinatestudio/radiant-plugin-resend";

transport: resendEmail({
  apiKey: process.env.RESEND_API_KEY,
})
```

## Sending Emails

Use `app.mailer` to send emails programmatically:

```typescript
// Low-level send
await app.mailer.send({
  to: "user@example.com",
  subject: "Your invoice",
  html: "<h1>Invoice #123</h1>",
  text: "Invoice #123",
});
```

## Built-in Templates

Radiant provides four built-in email templates. These are used automatically by the auth system and can be called manually:

### Welcome Email

```typescript
await app.mailer.sendWelcome("user@example.com");
```

Sends a welcome email with the app name. Used automatically after registration if `email` is configured.

### Forgot Password

```typescript
await app.mailer.sendForgotPassword("user@example.com", "https://myapp.com/reset-password?token=abc123");
```

Sends a password reset link. Used automatically by the `POST /api/<auth-collection>/forgot-password` endpoint.

### Password Reset Success

```typescript
await app.mailer.sendPasswordResetSuccess("user@example.com");
```

Confirmation email after a successful password reset. Sent automatically by the reset-password endpoint.

### Email Verification

```typescript
await app.mailer.sendVerificationEmail("user@example.com", "https://myapp.com/verify-email?token=abc123");
```

Sends a verification link. Call this manually from a hook or custom route.

## Custom Templates

Override any built-in template by providing a `templates` object. Each template is a function that receives data and returns `{ subject, html, text }`:

```typescript
email: {
  transport: nodemailerEmail({ /* ... */ }),
  from: "no-reply@myapp.com",
  appName: "My App",
  templates: {
    welcome: ({ to, appName }) => ({
      subject: `Welcome to ${appName}!`,
      html: `<h1>Hey ${to}!</h1><p>Thanks for joining ${appName}.</p>`,
      text: `Hey ${to}! Thanks for joining ${appName}.`,
    }),
    forgotPassword: ({ to, resetUrl, appName }) => ({
      subject: `Reset your password`,
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
      text: `Reset your password: ${resetUrl}`,
    }),
  },
}
```

## Using Email in Hooks

A common pattern is sending emails from `afterCreate` hooks:

```typescript
import { app } from "./app";

app.hooks("users", {
  afterCreate: async (ctx) => {
    if (app.mailer) {
      await app.mailer.sendWelcome(ctx.data.email);
    }
  },
});
```

## Auth Endpoints That Use Email

When email is configured and a collection has `auth: true`, these endpoints send emails automatically:

| Endpoint | Email sent |
|---|---|
| `POST /api/<slug>/forgot-password` | `sendForgotPassword` with a reset token link |
| `POST /api/<slug>/reset-password` | `sendPasswordResetSuccess` after successful reset |

The `forgot-password` endpoint always returns `200` with a generic message, regardless of whether the email exists — this prevents email enumeration attacks.

## Related

- [Plugins](./plugins) — Nodemailer and Resend plugin details
- [Hooks](./hooks) — Sending emails from lifecycle hooks
- [Environment Variables](./environment-variables) — SMTP env vars
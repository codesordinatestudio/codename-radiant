// Radiant - Email Module
// Version: 0.0.4
//
// Provides a unified email API with externally supplied transports.

import type { EmailConfig, RadiantEmailSendOptions, RadiantEmailTransport } from "./types";

export type { RadiantEmailSendOptions, RadiantEmailTransport };

// ============================================================================
// RadiantMailer
// ============================================================================

export class RadiantMailer {
  private transport: RadiantEmailTransport;
  private appName: string;
  private resetTokenExpiryMinutes: number;
  private from: string;

  constructor(config?: EmailConfig, transport?: RadiantEmailTransport) {
    this.appName = config?.appName ?? Bun.env.SMTP_APP_NAME ?? "Radiant App";
    this.resetTokenExpiryMinutes = config?.resetTokenExpiryMinutes ?? 60;
    this.from = config?.from ?? Bun.env.SMTP_FROM ?? `"Radiant App" <no-reply@radiant.dev>`;

    const resolvedTransport = transport ?? config?.transport;
    if (!resolvedTransport) {
      throw new Error("Email transport is required. Install an email provider plugin and pass email.transport.");
    }
    this.transport = resolvedTransport;
  }

  // --------------------------------------------------------------------------
  // Low-level send
  // --------------------------------------------------------------------------

  async send(options: RadiantEmailSendOptions): Promise<{ messageId: string }> {
    if (!options.to) {
      throw new Error("Email 'to' address is required");
    }
    return this.transport.send({ from: this.from, ...options });
  }

  // --------------------------------------------------------------------------
  // Verify SMTP connection (useful at startup)
  // --------------------------------------------------------------------------

  async verify(): Promise<boolean> {
    return this.transport.verify();
  }

  // --------------------------------------------------------------------------
  // Built-in templates
  // --------------------------------------------------------------------------

  /**
   * Sends a welcome / registration confirmation email.
   */
  async sendWelcome(to: string, opts: { appName?: string } = {}): Promise<void> {
    const appName = opts.appName ?? this.appName;

    await this.send({
      to,
      subject: `Welcome to ${appName}`,
      html: welcomeTemplate({ to, appName }),
      text: `Welcome to ${appName}! Your account has been created successfully.`,
    });
  }

  /**
   * Sends a password-reset email containing a one-time token link.
   *
   * @param to        - Recipient email address
   * @param resetUrl  - Full reset URL including the token,
   *                    e.g. https://myapp.com/reset-password?token=abc123
   * @param opts      - Optional overrides
   */
  async sendForgotPassword(
    to: string,
    resetUrl: string,
    opts: { appName?: string; expiresInMinutes?: number } = {},
  ): Promise<void> {
    const appName = opts.appName ?? this.appName;
    const expiresInMinutes = opts.expiresInMinutes ?? this.resetTokenExpiryMinutes;

    await this.send({
      to,
      subject: `Reset your ${appName} password`,
      html: forgotPasswordTemplate({ to, resetUrl, appName, expiresInMinutes }),
      text: `You requested a password reset for ${appName}.\n\nClick the link below to reset your password (valid for ${expiresInMinutes} minutes):\n\n${resetUrl}\n\nIf you didn't request a reset, you can safely ignore this email.`,
    });
  }

  /**
   * Sends a confirmation email after a password has been successfully reset.
   */
  async sendPasswordResetSuccess(to: string, opts: { appName?: string } = {}): Promise<void> {
    const appName = opts.appName ?? this.appName;

    await this.send({
      to,
      subject: `Your ${appName} password has been reset`,
      html: passwordResetSuccessTemplate({ to, appName }),
      text: `Your ${appName} password has been successfully reset. If you did not perform this action, contact support immediately.`,
    });
  }

  /**
   * Sends a verification email with a one-time link.
   *
   * @param to        - Recipient email address
   * @param verifyUrl - Full verification URL including the token,
   *                    e.g. https://myapp.com/verify-email?token=abc123
   * @param opts      - Optional overrides
   */
  async sendVerificationEmail(to: string, verifyUrl: string, opts: { appName?: string } = {}): Promise<void> {
    const appName = opts.appName ?? this.appName;

    await this.send({
      to,
      subject: `Verify your ${appName} email`,
      html: verifyEmailTemplate({ to, verifyUrl, appName }),
      text: `Welcome to ${appName}! Please verify your email address by clicking the link below:\n\n${verifyUrl}\n\nIf you didn't create an account, you can safely ignore this email.`,
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a RadiantMailer instance from optional config + env vars.
 */
export function createMailer(config?: EmailConfig): RadiantMailer | undefined {
  const transport = config?.transport;
  if (!transport) return undefined;
  return new RadiantMailer(config, transport);
}

// ============================================================================
// HTML Templates
// ============================================================================

function baseTemplate(content: string, appName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f7; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #6d28d9; padding: 32px 40px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; }
    .body { padding: 32px 40px; color: #374151; line-height: 1.6; }
    .body p { margin: 0 0 16px; }
    .btn { display: inline-block; padding: 12px 28px; background: #6d28d9; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; margin: 8px 0 20px; }
    .footer { padding: 20px 40px; background: #f9fafb; color: #9ca3af; font-size: 12px; line-height: 1.5; border-top: 1px solid #e5e7eb; }
    .muted { color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header"><h1>${appName}</h1></div>
    <div class="body">${content}</div>
    <div class="footer">You received this email because an action was performed on your ${appName} account.<br/>If you didn't initiate this, please ignore this email or contact support.</div>
  </div>
</body>
</html>`;
}

function welcomeTemplate({ to, appName }: { to: string; appName: string }): string {
  return baseTemplate(
    `<p>Hi <strong>${to}</strong>,</p>
     <p>Welcome to <strong>${appName}</strong>! Your account has been created successfully.</p>
     <p>You can now log in and start using the platform.</p>`,
    appName,
  );
}

function forgotPasswordTemplate({
  to,
  resetUrl,
  appName,
  expiresInMinutes,
}: {
  to: string;
  resetUrl: string;
  appName: string;
  expiresInMinutes: number;
}): string {
  return baseTemplate(
    `<p>Hi,</p>
     <p>We received a request to reset the password for the account associated with <strong>${to}</strong>.</p>
     <p>Click the button below to reset your password. This link will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
     <a href="${resetUrl}" class="btn">Reset Password</a>
     <p class="muted">Or copy this link into your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
     <p class="muted">If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>`,
    appName,
  );
}

function passwordResetSuccessTemplate({ appName }: { to: string; appName: string }): string {
  return baseTemplate(
    `<p>Your password for <strong>${appName}</strong> has been successfully reset.</p>
     <p>If you performed this action, no further steps are needed.</p>
     <p class="muted">If you did not reset your password, please contact support immediately and secure your account.</p>`,
    appName,
  );
}

function verifyEmailTemplate({ to, verifyUrl, appName }: { to: string; verifyUrl: string; appName: string }): string {
  return baseTemplate(
    `<p>Hi <strong>${to}</strong>,</p>
     <p>Welcome to <strong>${appName}</strong>! Please verify your email address by clicking the button below.</p>
     <a href="${verifyUrl}" class="btn">Verify Email</a>
     <p class="muted">Or copy this link into your browser:<br/><a href="${verifyUrl}">${verifyUrl}</a></p>
     <p class="muted">If you didn't create an account, you can safely ignore this email.</p>`,
    appName,
  );
}

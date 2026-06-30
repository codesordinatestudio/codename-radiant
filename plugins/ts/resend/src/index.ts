import type { RadiantEmailSendOptions, RadiantEmailTransport } from "@codesordinatestudio/radiant-bun";
import { createLogger } from "@codesordinatestudio/radiant-bun";

const log = createLogger("email:resend");

export type ResendTransportOptions = {
  apiKey?: string;
  from?: string;
};

export class ResendTransport implements RadiantEmailTransport {
  private client: any = null;
  private from: string;

  constructor(private options: ResendTransportOptions = {}) {
    this.from = options.from ?? Bun.env.SMTP_FROM ?? `"Lucent App" <no-reply@lucent.dev>`;

    const apiKey = options.apiKey ?? Bun.env.RESEND_API_KEY ?? "";
    if (!apiKey) {
      log.warn("Resend API key is missing (RESEND_API_KEY). Emails will not be sent.");
    }
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    const { Resend } = await import("resend");
    this.client = new Resend(this.options.apiKey ?? Bun.env.RESEND_API_KEY ?? "");
    return this.client;
  }

  async send(options: RadiantEmailSendOptions): Promise<{ messageId: string }> {
    if (!options.to) {
      throw new Error("Email 'to' address is required");
    }

    try {
      const client = await this.getClient();
      const { data, error } = await client.emails.send({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
      });

      if (error) {
        log.error({ error, to: options.to, subject: options.subject }, "Failed to send email via Resend");
        throw new Error(error.message);
      }

      const messageId = data?.id ?? "unknown";
      log.info({ messageId, to: options.to }, "Email sent via Resend");
      return { messageId };
    } catch (err) {
      log.error({ err, to: options.to, subject: options.subject }, "Failed to send email via Resend");
      throw err;
    }
  }

  async verify(): Promise<boolean> {
    return true;
  }
}

export function resendTransport(options: ResendTransportOptions = {}): RadiantEmailTransport {
  return new ResendTransport(options);
}

export function resendEmail(options: ResendTransportOptions = {}): RadiantEmailTransport {
  return resendTransport(options);
}

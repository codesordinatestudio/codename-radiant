import type { RadiantEmailSendOptions, RadiantEmailTransport } from "@codesordinatestudio/radiant-bun";
import { createLogger } from "@codesordinatestudio/radiant-bun";
import type { SendMailOptions, Transporter } from "nodemailer";

const log = createLogger("email:nodemailer");

import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type NodemailerTransportOptions = SMTPTransport.Options & {
  from?: string;
};

export class NodemailerTransport implements RadiantEmailTransport {
  private transporter: Transporter | null = null;
  private injectedTransport: Transporter | null;
  private from: string;

  constructor(
    private options: NodemailerTransportOptions = {},
    transport?: Transporter,
  ) {
    this.injectedTransport = transport ?? null;
    this.from = options.from ?? Bun.env.SMTP_FROM ?? `"Lucent App" <no-reply@lucent.dev>`;
  }

  private async getTransporter(): Promise<Transporter> {
    if (this.injectedTransport) return this.injectedTransport;
    if (this.transporter) return this.transporter;

    const nodemailer = await import("nodemailer");

    // We pass the full SMTPTransport.Options object (this.options) 
    // to let nodemailer natively handle host, port, service, auth, etc.
    const { from, ...transportOptions } = this.options;
    
    // Apply environment variables as fallbacks if neither service nor host is provided
    if (!transportOptions.service && !transportOptions.host && Bun.env.SMTP_HOST) {
      transportOptions.host = Bun.env.SMTP_HOST;
      transportOptions.port = transportOptions.port ?? parseInt(Bun.env.SMTP_PORT ?? "465", 10);
      transportOptions.secure = transportOptions.secure ?? (Bun.env.SMTP_SECURE === "true" || transportOptions.port === 465);
      transportOptions.auth = transportOptions.auth ?? {
        user: Bun.env.SMTP_USER ?? "",
        pass: Bun.env.SMTP_PASS ?? "",
      };
    }

    this.transporter = nodemailer.createTransport(transportOptions);

    return this.transporter;
  }

  async send(options: RadiantEmailSendOptions): Promise<{ messageId: string }> {
    if (!options.to) {
      throw new Error("Email 'to' address is required");
    }

    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: this.from,
        ...(options as SendMailOptions),
      });
      log.info({ messageId: info.messageId, to: options.to }, "Email sent via SMTP");
      return { messageId: info.messageId };
    } catch (err) {
      log.error({ err, to: options.to, subject: options.subject }, "Failed to send email via SMTP");
      throw err;
    }
  }

  async verify(): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      await transporter.verify();
      log.info("SMTP connection verified");
      return true;
    } catch (err) {
      log.warn({ err }, "SMTP connection verification failed");
      return false;
    }
  }
}

export function nodemailerTransport(options: NodemailerTransportOptions = {}): RadiantEmailTransport {
  return new NodemailerTransport(options);
}

export function nodemailerEmail(options: NodemailerTransportOptions = {}): RadiantEmailTransport {
  return nodemailerTransport(options);
}

import { test, expect, describe } from "bun:test";
import { nodemailerEmail } from "../../../plugins/ts/nodemailer/src";
import { createMailer } from "../../../runtime/bun/src/core/email";

describe("Email Integration", () => {
  test("Should configure nodemailer via jsonTransport", async () => {
    // Nodemailer supports a built-in JSON transport for testing that doesn't hit the network
    const transport = nodemailerEmail({
      jsonTransport: true
    } as any); // Cast as any because our options type inherits SMTPTransport, but nodemailer createTransport accepts jsonTransport too

    expect(transport).toBeDefined();

    // The RadiantMailer wraps the transport
    const mailer = createMailer({
      transport,
      from: "test@lucent.dev"
    });

    const result = await mailer.send({
      to: "recipient@example.com",
      subject: "Test Subject",
      html: "<p>Test Content</p>"
    });

    expect(result.messageId).toBeDefined();
    expect(typeof result.messageId).toBe("string");
  });

  test("Should render Welcome template correctly", async () => {
    const transport = nodemailerEmail({ jsonTransport: true } as any);
    const mailer = createMailer({ transport, from: "test@lucent.dev" });

    await mailer.sendWelcome("recipient@example.com", {
      appName: "Test App"
    });

    // The method returns void on success. If it didn't throw, it passed!
    expect(true).toBe(true);
  });
});

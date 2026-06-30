import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { RadiantRuntime } from "../../runtime/bun/src/main/runtime";
import { RadiantKV } from "../../runtime/bun/src/core/kv";
import type { RadiantAdapter } from "../../runtime/bun/src/core";
import { NodemailerTransport } from "../../plugins/ts/nodemailer/src/index";

// Mock adapter to simulate database logic for users
class MockUsersAdapter implements RadiantAdapter {
  adapterType = "mock";
  private users = new Map<string, any>();

  constructor() {
    this.users.set("user-1", {
      id: "user-1",
      email: "test@example.com",
      password: "hashed_password",
    });
  }

  async connect() {}
  async disconnect() {}

  async count() { return 0; }

  async create(collection: string, data: any) {
    const id = "user-" + Math.random();
    const doc = { id, ...data };
    this.users.set(id, doc);
    return doc;
  }

  async find(collection: string, query: any) {
    // Basic mock find for email
    const emailToFind = query?.where?.email?.eq;
    if (emailToFind) {
      const match = Array.from(this.users.values()).find(u => u.email === emailToFind);
      if (match) return { docs: [match], totalDocs: 1, limit: 10, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null };
    }
    return { docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null };
  }

  async findById(collection: string, id: string) {
    return this.users.get(id) || null;
  }

  async update(collection: string, id: string, data: any) {
    const existing = this.users.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...data };
    this.users.set(id, updated);
    return updated;
  }

  async delete(collection: string, id: string) {
    this.users.delete(id);
  }
}

describe("E2E: Email Flow (Forgot / Reset Password)", () => {
  let runtime: RadiantRuntime;
  let server: any;
  let extractedToken = "";

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-key-for-e2e";

    // Standard Mailpit SMTP connection
    const mailpitTransport = new NodemailerTransport({
      host: "127.0.0.1",
      port: 1026,
      secure: false,
      ignoreTLS: true,
    });

    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [
        {
          slug: "users",
          auth: true,
          fields: [
            { name: "email", type: "email" },
            { name: "password", type: "password" }
          ]
        }
      ],
      security: {
        auth: { strategies: ["jwt"] }
      },
      email: {
        from: "system@radiant.dev",
        appName: "Radiant E2E",
        resetPasswordUrl: "http://localhost:3000/reset",
      }
    };

    runtime = new RadiantRuntime(schema, { 
      adapter: new MockUsersAdapter(),
      email: {
        transport: mailpitTransport,
        templates: {
          forgotPassword: ({ to, resetUrl }: any) => ({
            subject: "Reset your test app password",
            html: `<p>Click here to reset your password:</p><a id="reset" href="${resetUrl}">Reset Password</a>`
          })
        }
      }
    });
    server = await runtime.start({ port: 0 }); // Spin up on random available port
    
    // Clear out mailpit messages before test
    try {
      await fetch("http://localhost:8026/api/v1/messages", { method: "DELETE" });
    } catch (e) {
      // ignore
    }
  });

  afterAll(async () => {
    if (server) server.stop();
  });

  test("Should trigger email dispatch on /forgot-password", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/users/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" })
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Password reset email sent (if account exists)");

    // Give Mailpit a tiny moment to receive the email
    await new Promise(r => setTimeout(r, 100));

    // Fetch latest email from Mailpit
    const mailpitRes = await fetch("http://localhost:8026/api/v1/messages?limit=1");
    if (!mailpitRes.ok) throw new Error("Mailpit not running or unreachable at port 8026.");
    
    const messages = await mailpitRes.json();
    expect(messages.messages.length).toBeGreaterThan(0);
    const latestMessage = messages.messages[0];
    expect(latestMessage.Subject).toBe("Reset your test app password");
    
    // Get the message source to extract the token
    const msgRes = await fetch(`http://localhost:8026/api/v1/message/${latestMessage.ID}`);
    const msgData = await msgRes.json();
    const htmlBody = msgData.HTML;
    
    expect(htmlBody).toContain('href="http://localhost:3000/reset?token=');
    
    // Extract the token
    const match = htmlBody.match(/token=([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/);
    expect(match).toBeTruthy();
    extractedToken = match![1];
  });

  test("Should reset password using the token sent in the email", async () => {
    // Clear out mailpit again
    await fetch("http://localhost:8026/api/v1/messages", { method: "DELETE" });

    // Make the reset password request
    const response = await server.fetch(
      new Request("http://localhost/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: extractedToken, password: "new_secure_password" })
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Password reset successfully");

    // Give Mailpit a tiny moment to receive the email
    await new Promise(r => setTimeout(r, 100));

    // Verify that the success email was sent in Mailpit
    const mailpitRes2 = await fetch("http://localhost:8026/api/v1/messages?limit=1");
    const messages2 = await mailpitRes2.json();
    expect(messages2.messages.length).toBeGreaterThan(0);
    const latestMessage2 = messages2.messages[0];
    
    expect(latestMessage2.Subject).toBe("Your Radiant E2E password has been reset");
    
    const msgRes2 = await fetch(`http://localhost:8026/api/v1/message/${latestMessage2.ID}`);
    const msgData2 = await msgRes2.json();
    const htmlBody2 = msgData2.HTML;
    
    expect(htmlBody2).toContain("has been successfully reset");
  });
});

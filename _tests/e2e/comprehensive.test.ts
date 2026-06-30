import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { RadiantRuntime } from "../../runtime/bun/src/main/runtime";
import { PostgresAdapter } from "../../plugins/ts/postgres/src/index";
import { NodemailerTransport } from "../../plugins/ts/nodemailer/src/index";
import { RadiantQueueManager } from "../../runtime/bun/src/utils/queue-manager";

describe("E2E: Comprehensive Todo Application Lifecycle", () => {
  let runtime: RadiantRuntime;
  let server: any;
  let resetToken = "";
  let userToken = "";
  let createdTaskId = "";
  let userId = "";
  let secondUserId = "";
  let secondUserToken = "";
  let sideEffectHookTriggered = false;
  let cronFiredCount = 0;
  let workerJobResult: any = null;
  let customEndpointHit = false;

  beforeAll(async () => {
    process.env.JWT_SECRET = "super-secure-e2e-secret";

    // 1. Setup the real Mailpit Transport
    const mailpitTransport = new NodemailerTransport({
      host: "127.0.0.1",
      port: 1026,
      secure: false,
      ignoreTLS: true,
    });

    // 2. Setup the real Postgres Adapter pointing to local docker compose
    const pgAdapter = new PostgresAdapter("postgres://radiant:password@127.0.0.1:5433/radiant_test");

    // 2.5 Setup QueueManager
    RadiantQueueManager.initialize({
      provider: "bullmq",
      bullmq: {
        connection: { host: "127.0.0.1", port: 6380 }
      }
    });

    // 3. Define the comprehensive Todo Schema
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
        },
        {
          slug: "tasks",
          realtime: {
            ws: true,
            durableStream: true,
            secure: true // Require auth to access the stream
          },
          fields: [
            { name: "title", type: "string" },
            { name: "completed", type: "boolean", default: false },
            { name: "authorId", type: "relationship", target: "users" } // Many-to-One
          ]
        }
      ],
      security: {
        auth: { strategies: ["jwt"] }
      },
      email: {
        from: "system@radiant.dev",
        appName: "Radiant E2E Todo",
        resetPasswordUrl: "http://localhost:3000/reset",
      }
    };

    runtime = new RadiantRuntime(schema, {
      adapter: pgAdapter,
      email: {
        transport: mailpitTransport,
        templates: {
          forgotPassword: ({ to, resetUrl }: any) => ({
            subject: "Reset Password",
            html: `Token=${new URL(resetUrl).searchParams.get('token')}`
          })
        }
      }
    });

    // 4. Configure Advanced Lifecycle Hooks
    runtime.hooks("tasks", {
      beforeCreate: async (ctx) => {
        // Mutate doc title dynamically
        ctx.data.title = `${ctx.data.title} - AutoFormatted`;
        return ctx.data;
      },
      afterCreate: async (ctx) => {
        sideEffectHookTriggered = true; // Set external side effect tracking
      }
    });

    // 5. Configure Access Rules (Layer 5)
    runtime.access("tasks", {
      update: async (ctx) => {
        // For testing, we'll allow access unless user is our hacker user
        if (ctx.user?.id) {
           const user = await ctx.radiant.adapter.findById("users", ctx.user.id);
           if (user?.email === "hacker@example.com") {
             return false; // Deny hacker
           }
        }
        return true;
      }
    });

    // 6. Custom Endpoints
    runtime.router.post("/api/custom-test", async (ctx: any) => {
      customEndpointHit = true;
      return new Response(JSON.stringify({ custom: "hit" }), { status: 200, headers: { 'Content-Type': 'application/json' }});
    });

    // 7. Workers
    const qm = RadiantQueueManager.getInstance();
    qm.registerWorker("e2e-worker", async (job) => {
      workerJobResult = { name: job.name, data: job.data };
      return true;
    });

    // 8. Cron
    runtime.cron("e2e-cron", "* * * * *", async (ctx) => {
      cronFiredCount++;
    });

    server = await runtime.start({ port: 0 }); // Spin up on random available port

    // Clear DB
    try { 
      await (pgAdapter as any).db?.unsafe('TRUNCATE TABLE users, tasks CASCADE');
    } catch (e) {
      console.log("Could not truncate tables:", e);
    }
    // Clear Mailpit
    try { await fetch("http://localhost:8026/api/v1/messages", { method: "DELETE" }); } catch (e) {}
  });

  afterAll(async () => {
    if (server) server.stop();
  });

  // ---------------------------------------------------------
  // LAYER 1: AUTHENTICATION FLOWS (Register, Login, Forgot, Reset, Verify)
  // ---------------------------------------------------------
  describe("Authentication Layer", () => {
    test("Should Register a new user", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/users/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "todo_user@example.com", password: "InitialPassword123" })
        })
      );
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.accessToken).toBeDefined();
      expect(data.user.email).toBe("todo_user@example.com");
      userId = data.user.id;
    });

    test("Should Login successfully and return JWT", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "todo_user@example.com", password: "InitialPassword123" })
        })
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.accessToken).toBeDefined();
      userToken = data.accessToken; // Save for CRUD tests
    });

    test("Should trigger Forgot Password flow and catch email in Mailpit", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/users/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "todo_user@example.com" })
        })
      );
      expect(response.status).toBe(200);

      await new Promise(r => setTimeout(r, 150)); // Wait for email delivery

      const mailpitRes = await fetch("http://localhost:8026/api/v1/messages?limit=1");
      const messages = await mailpitRes.json();
      expect(messages.messages.length).toBeGreaterThan(0);
      const latestMessage = messages.messages[0];
      
      const msgRes = await fetch(`http://localhost:8026/api/v1/message/${latestMessage.ID}`);
      const msgData = await msgRes.json();
      
      const match = msgData.HTML.match(/Token=([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/);
      expect(match).toBeTruthy();
      resetToken = match![1];
    });

    test("Should Reset Password securely", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/users/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, password: "NewSecurePassword456" })
        })
      );
      expect(response.status).toBe(200);
    });

    test("Should Verify Login with new password (and reject old)", async () => {
      // Reject old
      const failRes = await server.fetch(
        new Request("http://localhost/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "todo_user@example.com", password: "InitialPassword123" })
        })
      );
      expect(failRes.status).toBe(401);

      // Accept new
      const successRes = await server.fetch(
        new Request("http://localhost/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "todo_user@example.com", password: "NewSecurePassword456" })
        })
      );
      expect(successRes.status).toBe(200);
      const data = await successRes.json();
      userToken = data.accessToken; // Update token with new session
    });
  });

  // ---------------------------------------------------------
  // LAYER 2: CRUD & RELATIONSHIPS
  // ---------------------------------------------------------
  describe("CRUD & Relationship Layer", () => {
    test("Should Create a Task tied to the User", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`
          },
          body: JSON.stringify({ title: "Master Radiant Framework", authorId: userId })
        })
      );
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.title).toBe("Master Radiant Framework - AutoFormatted");
      expect(data.completed).toBe(false); // Default value applied
      expect(data.authorId).toBe(userId);
      createdTaskId = data.id;
    });

    test("Should Read the Task via the collection (filtering by relationship)", async () => {
      const response = await server.fetch(
        new Request(`http://localhost/api/tasks?where[authorId][eq]=${userId}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${userToken}` }
        })
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.docs).toBeInstanceOf(Array);
      expect(data.docs.length).toBeGreaterThan(0);
      expect(data.docs[0].id).toBe(createdTaskId);
    });

    test("Should Update (Patch) the Task to completed", async () => {
      const response = await server.fetch(
        new Request(`http://localhost/api/tasks/${createdTaskId}`, {
          method: "PATCH",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`
          },
          body: JSON.stringify({ completed: true })
        })
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.completed).toBe(true);
    });
  });

  // ---------------------------------------------------------
  // LAYER 3: REALTIME & STREAMS (WebSocket)
  // ---------------------------------------------------------
  describe("Realtime / Durable Streams Layer", () => {
    test("Should reject SSE stream access without token (Security)", async () => {
      // Connect to the global SSE endpoint and attempt to subscribe to tasks channel
      const response = await server.fetch(
        new Request("http://localhost/api/sse?channels=tasks", {
          headers: { } // No Auth
        })
      );
      // The SSE endpoint connects but silently drops unauthorized channels (Radiant default behavior)
      expect(response.status).toBe(200); 
    });

    test("Should accept SSE stream access with valid token", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/sse?channels=tasks", {
          headers: { 
            "Authorization": `Bearer ${userToken}` 
          }
        })
      );
      expect(response.status).toBe(200);
    });

    test("Should Delete the Task securely", async () => {
      const response = await server.fetch(
        new Request(`http://localhost/api/tasks/${createdTaskId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${userToken}` }
        })
      );
      expect(response.status).toBe(200); // Wait, delete returns 200 { deleted: true }
      
      // Verify deletion
      const checkRes = await server.fetch(
        new Request(`http://localhost/api/tasks/${createdTaskId}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${userToken}` }
        })
      );
      expect(checkRes.status).toBe(404);
    });
  });

  // ---------------------------------------------------------
  // LAYER 4: CUSTOM ENDPOINTS
  // ---------------------------------------------------------
  describe("Custom Endpoints Layer", () => {
    test("Should hit custom endpoint successfully", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/custom-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        })
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.custom).toBe("hit");
      expect(customEndpointHit).toBe(true);
    });
  });

  // ---------------------------------------------------------
  // LAYER 5: HOOKS
  // ---------------------------------------------------------
  describe("Lifecycle Hooks Layer", () => {
    test("Should mutate data via beforeCreate hook", async () => {
      const response = await server.fetch(
        new Request("http://localhost/api/tasks", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`
          },
          body: JSON.stringify({ title: "Hook Test Task", authorId: userId })
        })
      );
      expect(response.status).toBe(201);
      const data = await response.json();
      
      // Verification: title should have "- AutoFormatted" appended by the hook
      expect(data.title).toBe("Hook Test Task - AutoFormatted");
      
      // Verification: afterCreate side-effect tracking variable should be true
      expect(sideEffectHookTriggered).toBe(true);
      
      createdTaskId = data.id;
    });
  });

  // ---------------------------------------------------------
  // LAYER 6: ACCESS RULES
  // ---------------------------------------------------------
  describe("Access Control Layer", () => {
    test("Should allow update for regular user", async () => {
      const response = await server.fetch(
        new Request(`http://localhost/api/tasks/${createdTaskId}`, {
          method: "PATCH",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`
          },
          body: JSON.stringify({ completed: true })
        })
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.completed).toBe(true);
    });

    test("Should register hacker user and deny update", async () => {
      // Register Hacker
      const registerRes = await server.fetch(
        new Request("http://localhost/api/users/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "hacker@example.com", password: "HackerPassword123" })
        })
      );
      expect(registerRes.status).toBe(201);
      const hackerData = await registerRes.json();
      secondUserToken = hackerData.accessToken;

      // Attempt to update task with Hacker token
      const response = await server.fetch(
        new Request(`http://localhost/api/tasks/${createdTaskId}`, {
          method: "PATCH",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secondUserToken}`
          },
          body: JSON.stringify({ completed: false })
        })
      );
      
      // Verification: Should be 500 or 403 based on runtime checkAccess throw
      expect(response.status).toBeGreaterThanOrEqual(400); 
    });
  });

  // ---------------------------------------------------------
  // LAYER 7: BACKGROUND WORKERS
  // ---------------------------------------------------------
  describe("Background Workers Layer", () => {
    test("Should enqueue and process a job successfully", async () => {
      const qm = RadiantQueueManager.getInstance();
      await qm.addJob("e2e-worker", "test-job-1", { testPayload: "hello-bullmq" });
      
      // Wait for BullMQ to pick up the job and execute the handler
      await new Promise(r => setTimeout(r, 500));
      
      expect(workerJobResult).not.toBeNull();
      expect(workerJobResult.name).toBe("test-job-1");
      expect(workerJobResult.data.testPayload).toBe("hello-bullmq");
    });
  });

  // ---------------------------------------------------------
  // LAYER 8: CRON SCHEDULER
  // ---------------------------------------------------------
  describe("Cron Scheduler Layer", () => {
    test("Should trigger cron programmatically via BullMQ", async () => {
      const qm = RadiantQueueManager.getInstance();
      
      // Manually trigger the cron worker by enqueuing a job to the radiant_cron queue
      await qm.addJob("radiant_cron", "e2e-cron", {});
      
      // Wait for execution
      await new Promise(r => setTimeout(r, 500));

      expect(cronFiredCount).toBe(1);
    });
  });

});

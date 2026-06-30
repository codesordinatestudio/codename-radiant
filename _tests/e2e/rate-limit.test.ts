import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { RadiantRuntime } from "../../runtime/bun/src/main/runtime";
import { PostgresAdapter } from "../../plugins/ts/postgres/src/index";

describe("E2E: Rate Limiting with RadiantKV", () => {
  let runtime: RadiantRuntime;
  let server: any;
  const PORT = 8089;

  beforeAll(async () => {
    // Setup the DB adapter
    const pgAdapter = new PostgresAdapter("postgres://radiant:password@127.0.0.1:5433/radiant_test");

    // Define schema with strict rate limiting
    const schema: any = {
      core: { api: { prefix: "/api" } },
      security: {
        rateLimit: {
          write: {
            max: 3,
            window: "5s"
          }
        }
      },
      collections: [
        {
          slug: "test_items",
          fields: [
            { name: "title", type: "text", required: true }
          ]
        }
      ]
    };

    runtime = new RadiantRuntime(schema, {
      adapter: pgAdapter,
    });

    server = await runtime.start({ port: PORT });
    // Add a slight delay to ensure server is ready
    await Bun.sleep(100);
  });

  afterAll(async () => {
    if (server) await server.stop(true);
    await Bun.sleep(100); // Give port time to release
  });

  test("should allow requests up to the maximum limit, then block with 429", async () => {
    // Request 1: Should pass
    const res1 = await fetch(`http://127.0.0.1:${PORT}/api/test_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Item 1" })
    });
    if (res1.status >= 400) {
      console.log(await res1.text());
    }
    expect(res1.status).toBe(201);

    // Request 2: Should pass
    const res2 = await fetch(`http://127.0.0.1:${PORT}/api/test_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Item 2" })
    });
    expect(res2.status).toBe(201);

    // Request 3: Should pass
    const res3 = await fetch(`http://127.0.0.1:${PORT}/api/test_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Item 3" })
    });
    expect(res3.status).toBe(201);

    // Request 4: Limit is 3, so this should trigger a 429 Too Many Requests
    const res4 = await fetch(`http://127.0.0.1:${PORT}/api/test_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Item 4" })
    });
    const body4 = await res4.json() as any;
    expect(res4.status).toBe(429);
    expect(body4.message).toContain("Too Many Requests");
  });
  
  test("GET requests should not be rate-limited by default state-changing rules", async () => {
    // We already hit our write limit, but GET should work fine since it's a separate bucket or not rate-limited
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/test_items`, {
        method: "GET",
      });
      expect(res.status).toBe(200);
    }
  });
});

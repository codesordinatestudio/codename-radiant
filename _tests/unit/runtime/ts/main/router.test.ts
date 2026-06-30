import { describe, test, expect } from "bun:test";
import { RadiantRouter } from "../../../../../runtime/bun/src/main/router";
import { Type } from "@sinclair/typebox";

describe("main/router", () => {
  test("initializes successfully", () => {
    const router = new RadiantRouter();
    expect(router).toBeDefined();
  });

  test("injects CORS headers when configured via toNativeRoutes parameters", async () => {
    const router = new RadiantRouter();

    router.add("GET", "/test", () => ({ success: true }));

    const routes = router.toNativeRoutes({
      cors: {
        origin: "https://example.com",
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
      },
    });

    const req = new Request("http://localhost/test", { method: "GET", headers: { origin: "https://example.com" } });
    const res = await (routes["/test"] as any).GET(req, null as any);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("validates schemas and rejects invalid query params", async () => {
    const router = new RadiantRouter();

    router.add("GET", "/api/items", () => ({ success: true }), {
      query: Type.Object({
        limit: Type.Number(),
      }),
    });

    const routes = router.toNativeRoutes();

    // Request missing 'limit'
    const req = new Request("http://localhost/api/items", { method: "GET" });
    const res = await (routes["/api/items"] as any).GET(req, null as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  test("validates body schema and rejects invalid JSON", async () => {
    const router = new RadiantRouter();

    router.add("POST", "/api/create", () => ({ success: true }), {
      body: Type.Object({
        title: Type.String(),
      }),
    });

    const routes = router.toNativeRoutes();

    // Missing body
    const req1 = new Request("http://localhost/api/create", { method: "POST" });
    const res1 = await (routes["/api/create"] as any).POST(req1, null as any);
    expect(res1.status).toBe(400);

    // Wrong type in body
    const req2 = new Request("http://localhost/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res2 = await (routes["/api/create"] as any).POST(req2, null as any);
    expect(res2.status).toBe(400);

    // Correct body
    const req3 = new Request("http://localhost/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid" }),
    });
    const res3 = await (routes["/api/create"] as any).POST(req3, null as any);
    expect(res3.status).toBe(200);
  });
});

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { RadiantRuntime } from "../../../../../runtime/bun/src/main/runtime";
import type { RadiantAdapter } from "../../../../../runtime/bun/src/core";

describe("Plugin System", () => {
  let mockAdapter: RadiantAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    mockAdapter = {
      adapterType: "mock",
      connect: async () => {},
      disconnect: async () => {},
      count: async () => 0,
      create: async () => ({}),
      find: async () => ({
        docs: [],
        totalDocs: 0,
        limit: 10,
        page: 1,
        totalPages: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      }),
      findById: async () => null,
      update: async () => ({}),
      delete: async () => {},
    };
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("Initializes plugins during start() and allows overriding core components", async () => {
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [],
    };

    let pluginExecuted = false;

    const testPlugin = {
      name: "test-plugin",
      onInit: async (app: any) => {
        pluginExecuted = true;
        app.storage = {
          saveFile: async () => ({
            url: "intercepted-url",
            filename: "test.txt",
            mimetype: "text/plain",
            size: 0,
            originalName: "test.txt",
          }),
          deleteFile: async () => {},
        };
      },
    };

    const runtime = new RadiantRuntime(schema, {
      adapter: mockAdapter,
      plugins: [testPlugin],
    });

    // We can spy on start to prevent the actual HTTP server from binding a port,
    // or just run it with port: 0 to let it bind a random port. Let's use port 0.
    await runtime.start({ port: 0 });

    expect(pluginExecuted).toBe(true);

    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const result = await runtime.storage.saveFile(file);

    expect(result.url).toBe("intercepted-url");
  });
  test("Executes beforeRequest, afterRequest, and onError global hooks correctly", async () => {
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [],
    };

    let hooksTriggered = {
      before: false,
      after: false,
      error: false,
    };

    const myGlobalMiddleware = {
      name: "my-middleware",
      beforeRequest: async (ctx: any) => {
        hooksTriggered.before = true;
        if (ctx.request.headers.get("X-Ban-List")) throw new Error("Banned");
      },
      afterRequest: async (ctx: any, response: Response) => {
        hooksTriggered.after = true;
        response.headers.set("X-Powered-By", "Radiant");
      },
      onError: async (ctx: any, err: any) => {
        hooksTriggered.error = true;
        if (err.message === "Banned") {
          return new Response(JSON.stringify({ customError: "You are banned" }), { status: 403 });
        }
      },
    };

    const runtime = new RadiantRuntime(schema, {
      adapter: mockAdapter,
      plugins: [myGlobalMiddleware],
    });

    runtime.router.get("/api/test", () => new Response("Hello World"));

    // 1. Normal Request
    let req = new Request("http://localhost:3000/api/test");
    let res = await runtime.fetch(req);

    expect(hooksTriggered.before).toBe(true);
    expect(hooksTriggered.after).toBe(true);
    expect(hooksTriggered.error).toBe(false); // No error

    expect(await res.text()).toBe("Hello World");
    expect(res.headers.get("X-Powered-By")).toBe("Radiant");

    // Reset
    hooksTriggered = { before: false, after: false, error: false };

    // 2. Request triggering error in beforeRequest
    req = new Request("http://localhost:3000/api/test", { headers: { "X-Ban-List": "true" } });
    res = await runtime.fetch(req);

    expect(hooksTriggered.before).toBe(true);
    expect(hooksTriggered.after).toBe(false); // afterRequest shouldn't run if beforeRequest threw
    expect(hooksTriggered.error).toBe(true); // onError should run

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ customError: "You are banned" });
  });
});

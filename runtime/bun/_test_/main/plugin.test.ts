import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { RadiantRuntime } from '../../src/main/runtime';
import type { RadiantAdapter } from '../../src/core';

describe('Plugin System', () => {
  let mockAdapter: RadiantAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    mockAdapter = {
      adapterType: "mock",
      connect: async () => {},
      disconnect: async () => {},
      count: async () => 0,
      create: async () => ({}),
      find: async () => ({ docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null }),
      findById: async () => null,
      update: async () => ({}),
      delete: async () => {}
    };
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('Initializes plugins during start() and allows overriding core components', async () => {
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: []
    };

    let pluginExecuted = false;

    const testPlugin = {
      name: "test-plugin",
      onInit: async (app: any) => {
        pluginExecuted = true;
        app.storage = {
          saveFile: async () => ({ url: "intercepted-url", filename: "test.txt", mimetype: "text/plain", size: 0, originalName: "test.txt" }),
          deleteFile: async () => {}
        };
      }
    };

    const runtime = new RadiantRuntime(schema, { 
      adapter: mockAdapter,
      plugins: [testPlugin]
    });

    // We can spy on start to prevent the actual HTTP server from binding a port, 
    // or just run it with port: 0 to let it bind a random port. Let's use port 0.
    await runtime.start({ port: 0 });

    expect(pluginExecuted).toBe(true);
    
    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const result = await runtime.storage.saveFile(file);
    
    expect(result.url).toBe("intercepted-url");
  });
});

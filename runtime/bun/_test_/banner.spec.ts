import { describe, test, expect, spyOn, afterEach, beforeEach } from 'bun:test';
import { RadiantRuntime } from '../src/main/runtime';

describe('RadiantRuntime Banner', () => {
  let mockAdapter: any;

  beforeEach(() => {
    mockAdapter = {
      adapterType: "mock",
      connect: async () => {},
      disconnect: async () => {},
      count: async () => 0,
      create: async () => ({}),
      find: async () => ({ docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 1 }),
      findById: async () => null,
      update: async () => ({}),
      delete: async () => {}
    };
  });

  afterEach(() => {
    // Restore mocks
  });

  test('prints the custom ASCII banner on app.start()', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: []
    };

    const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
    
    // Start the server on port 0 to let the OS assign an open port
    const server = await runtime.start({ port: 0 });

    try {
      expect(logSpy).toHaveBeenCalled();
      
      // Grab the last log call
      const lastCallArg = logSpy.mock.calls[logSpy.mock.calls.length - 1][0];
      
      // Verify it contains the ASCII art "Radiant Engine Online"
      expect(lastCallArg).toContain('Radiant Engine Online');
      expect(lastCallArg).toContain('http://localhost:');
      
      // Verify the Radiant logo pattern is printed
      expect(lastCallArg).toContain('|  __ \\');
      expect(lastCallArg).toContain('| |__) |__ _  __| |_  __ _ _ __ | |_');
    } finally {
      // Clean up the running server
      server.stop(true);
      logSpy.mockRestore();
    }
  });
});

import { describe, test, expect } from "bun:test";
import { RadiantRuntime } from "../../../../../runtime/bun/src/main/runtime";
import type { RadiantAdapter } from "../../../../../runtime/bun/src/core";

// Minimal mock adapter
class MockAdapter implements RadiantAdapter {
  adapterType = "mock";
  async connect() {}
  async disconnect() {}
  async count() { return 0; }
  async create() { return {}; }
  async find() { return { docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null }; }
  async findById() { return null; }
  async update() { return {}; }
  async delete() {}
}

describe("Cron Jobs & Task Scheduling", () => {
  const schema: any = { collections: [] };

  test("Should register and manage a cron job", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    
    // Register a cron job
    await app.cron("cleanup-job", "* * * * *", (runtime: any) => {
      // do something
    });

    const activeJobs = await app.cronManager.list();
    expect(activeJobs).toContain("cleanup-job");
    expect(activeJobs.length).toBe(1);

    // Stop it explicitly
    const stopped = await app.cronManager.stop("cleanup-job");
    expect(stopped).toBe(true);
    expect((await app.cronManager.list()).length).toBe(0);
  });

  test("Should prevent duplicate cron job names", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    
    await app.cron("unique-job", "* * * * *", () => {});
    
    await expect(app.cron("unique-job", "* * * * *", () => {})).rejects.toThrow(/already registered/);

    await app.cronManager.stopAll();
  });

  test("Should stop all cron jobs when server stops", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    
    await app.cron("job-1", "* * * * *", () => {});
    await app.cron("job-2", "* * * * *", () => {});
    
    const list = await app.cronManager.list();
    expect(list.length).toBe(2);

    const server = await app.start({ port: 0 }); // start on random port
    
    // When the server is stopped, jobs should be cleared
    server.stop();
    
    const cL = await app.cronManager.list(); expect(cL.length).toBe(0);
  });
});

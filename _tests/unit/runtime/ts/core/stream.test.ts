import { describe, it, expect, beforeEach, mock } from "bun:test";
import { RadiantRuntime } from '../../../../../runtime/bun/src/main/runtime';
import { MemoryStreamStore } from '../../../../../runtime/bun/src/core/stream';
import type { RadiantAST, RadiantAdapter } from '../../../../../runtime/bun/src/core';

// Mock minimal adapter
class MockAdapter implements RadiantAdapter {
  adapterType = "mock";
  async connect() {}
  async disconnect() {}
  async ping() {}
  configureCollections() {}
  async getCurrentSchema() { return { tables: [], columns: {} }; }
  getSystemTableStatements() { return []; }
  createTableDDL() { return ""; }
  async recordMigration() {}
  async find() { return { docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }; }
  async findById() { return null; }
  async findByIds() { return []; }
  async count() { return 0; }
  async raw() { return []; }

  async create(collection: string, data: Record<string, any>) { return { id: "123", ...data }; }
  async createMany(collection: string, docs: Record<string, any>[]) { return docs.map(d => ({ id: "123", ...d })); }
  async update(collection: string, id: string, data: Record<string, any>) { return { id, ...data }; }
  async delete() {}
  async deleteMany() {}
}

describe("Realtime Durable Streams", () => {
  const schema: RadiantAST = {
    collections: [
      {
        slug: "users",
        realtime: {
          durableStream: true,
          secure: true,
          ws: ["update"], // Only WS on update
        },
        fields: []
      },
      {
        slug: "posts",
        realtime: {
          durableStream: ["created"] // Only streams on create
        },
        fields: []
      }
    ]
  };

  it("should initialize with default MemoryStreamStore", () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    expect(app.streamStore).toBeInstanceOf(MemoryStreamStore);
  });

  it("should emit to DurableStream on creation", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    const req = new Request("http://localhost/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" }
    });
    
    await app.buildRoutes();
    const res = await app.router.handle(req, undefined, null, app) || new Response();
    expect(res.status).toBe(201); // Assuming 201 or 200 for successful create

    // Read stream
    const events = await app.streamStore.read("users");
    expect(events.length).toBe(1);
    expect(events[0]!.action).toBe("created"); // Our hooks capitalize the action
    expect(events[0]!.data.name).toBe("Alice");
    expect(events[0]!.data.id).toBe("123");
  });

  it("should respect granular stream configuration", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    
    // Create a post
    const req1 = new Request("http://localhost/api/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Hello" }),
      headers: { "Content-Type": "application/json" }
    });
    await app.buildRoutes();
    await app.router.handle(req1, undefined, null, app);

    // Update a post
    const req2 = new Request("http://localhost/api/posts/123", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
      headers: { "Content-Type": "application/json" }
    });
    await app.router.handle(req2, undefined, null, app);

    // Posts only tracks "create" based on schema above
    const events = await app.streamStore.read("posts");
    expect(events.length).toBe(1);
    expect(events[0]!.action).toBe("created");
    expect(events[0]!.data.title).toBe("Hello");
  });

  it("should enforce capacity on MemoryStreamStore", async () => {
    const store = new MemoryStreamStore(5); // max 5
    for (let i = 0; i < 10; i++) {
      await store.publish("users", "Create", { i });
    }
    const events = await store.read("users");
    expect(events.length).toBe(5);
    expect(events[0]!.data.i).toBe(5); // First element should be the 6th inserted (i=5)
    expect(events[4]!.data.i).toBe(9); // Last element should be the 10th inserted (i=9)
  });

  it("should return history from REST API", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    // Fake access
    app.access("users", { read: () => true });

    await app.streamStore.publish("users", "created", { name: "Alice" });
    const id = await app.streamStore.publish("users", "created", { name: "Bob" });
    await app.streamStore.publish("users", "updated", { name: "Charlie" });

    // Fetch without lastEventId
    const req1 = new Request("http://localhost/api/users/stream");
    await app.buildRoutes();
    const res1 = await app.router.handle(req1, undefined, null, app) || new Response();
    const data1 = await res1.json() as any[];
    expect(data1.length).toBe(3);

    // Fetch with lastEventId
    const req2 = new Request(`http://localhost/api/users/stream?lastEventId=${id}`);
    const res2 = await app.router.handle(req2, undefined, null, app) || new Response();
    const data2 = await res2.json() as any[];
    expect(data2.length).toBe(1);
    expect(data2[0].data.name).toBe("Charlie");
  });

  it("should enforce secure access on /stream REST API", async () => {
    const app = new RadiantRuntime(schema, { adapter: new MockAdapter() });
    app.access("users", { read: () => false }); // Deny read

    const req = new Request("http://localhost/api/users/stream");
    await app.buildRoutes();
    await expect(app.router.handle(req, undefined, null, app)).rejects.toThrow("Unauthorized to read on users");
  });
});

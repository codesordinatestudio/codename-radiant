import { describe, test, expect, mock } from "bun:test";

// Mock the bun RedisClient before importing the adapter
mock.module("bun", () => {
  return {
    RedisClient: class MockRedis {
      store = new Map<string, string | Set<string>>();
      
      async set(key: string, value: string) {
        this.store.set(key, value);
      }
      
      async get(key: string) {
        return this.store.get(key) || null;
      }
      
      async del(key: string) {
        this.store.delete(key);
      }
      
      async sadd(key: string, value: string) {
        if (!this.store.has(key)) this.store.set(key, new Set());
        (this.store.get(key) as Set<string>).add(value);
      }
      
      async smembers(key: string) {
        const s = this.store.get(key) as Set<string> | undefined;
        return s ? Array.from(s) : [];
      }
      
      async srem(key: string, value: string) {
        const s = this.store.get(key) as Set<string> | undefined;
        if (s) s.delete(value);
      }
      
      close() {}
      async ping() {}
    }
  };
});

import { RedisAdapter } from "../src/adapter";

describe("RedisAdapter", () => {
  test("creates and retrieves documents", async () => {
    const adapter = new RedisAdapter("redis://localhost");
    
    const doc = await adapter.create("users", { name: "Alice", age: 30 });
    expect(doc.id).toBeDefined();
    expect(doc.name).toBe("Alice");
    
    const retrieved = await adapter.findById("users", doc.id as string);
    expect(retrieved).toEqual(doc);
  });

  test("filters documents with where clauses", async () => {
    const adapter = new RedisAdapter("redis://localhost");
    
    await adapter.create("products", { id: "1", price: 100, tag: "A" });
    await adapter.create("products", { id: "2", price: 200, tag: "B" });
    await adapter.create("products", { id: "3", price: 300, tag: "A" });
    
    const res = await adapter.find("products", {
      where: {
        tag: "A",
        price: { gt: 150 }
      }
    });
    
    expect(res.docs.length).toBe(1);
    expect(res.docs[0].id).toBe("3");
  });
  
  test("sorts documents", async () => {
    const adapter = new RedisAdapter("redis://localhost", "prefix");
    
    await adapter.create("items", { id: "1", value: 10 });
    await adapter.create("items", { id: "2", value: 30 });
    await adapter.create("items", { id: "3", value: 20 });
    
    const resAsc = await adapter.find("items", { sort: "value" });
    expect(resAsc.docs.map(d => d.value)).toEqual([10, 20, 30]);
    
    const resDesc = await adapter.find("items", { sort: "-value" });
    expect(resDesc.docs.map(d => d.value)).toEqual([30, 20, 10]);
  });
});

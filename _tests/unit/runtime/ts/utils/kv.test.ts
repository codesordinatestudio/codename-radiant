import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { RadiantKV } from "../../../../../runtime/bun/src/utils/kv";
import { MemoryAdapter } from "../../../../../runtime/bun/src/utils/kv/adapters/memory";
import { SQLiteAdapter } from "../../../../../runtime/bun/src/utils/kv/adapters/sqlite";
import { RedisAdapter } from "../../../../../runtime/bun/src/utils/kv/adapters/redis";

describe("RadiantKV Modular Adapters", () => {
  describe("Facade", () => {
    test("initializes memory driver correctly", () => {
      const kv = new RadiantKV({ driver: "memory" });
      // @ts-expect-error accessing private adapter for testing
      expect(kv.adapter).toBeInstanceOf(MemoryAdapter);
    });

    test("initializes sqlite driver correctly", () => {
      const kv = new RadiantKV({ driver: "sqlite", sqlite: { path: ":memory:" } });
      // @ts-expect-error accessing private adapter for testing
      expect(kv.adapter).toBeInstanceOf(SQLiteAdapter);
    });
  });

  describe("MemoryAdapter", () => {
    let adapter: MemoryAdapter;

    beforeAll(() => {
      adapter = new MemoryAdapter();
    });

    afterAll(() => {
      adapter.close();
    });

    test("set and get basic values", async () => {
      adapter.set("test1", "hello");
      const val = adapter.get("test1");
      expect(val).toBe("hello");
    });

    test("set and get objects", async () => {
      adapter.set("obj1", { a: 1 });
      const val = adapter.get<{ a: number }>("obj1");
      expect(val).toEqual({ a: 1 });
    });

    test("respects TTL expiration", async () => {
      adapter.set("ttl_test", "expire_me", 0.1); // 100ms
      expect(adapter.get<string>("ttl_test")).toBe("expire_me");
      
      await Bun.sleep(150);
      
      expect(adapter.get("ttl_test")).toBeNull();
    });

    test("delete removes key", async () => {
      adapter.set("delete_me", "gone");
      expect(adapter.delete("delete_me")).toBe(true);
      expect(adapter.get("delete_me")).toBeNull();
      expect(adapter.delete("does_not_exist")).toBe(false);
    });

    test("has checks existence", async () => {
      adapter.set("exists", "yes");
      expect(adapter.has("exists")).toBe(true);
      expect(adapter.has("not_exists")).toBe(false);
    });
    
    test("keys and prefix filtering", async () => {
      adapter.clear();
      adapter.set("user:1", "alice");
      adapter.set("user:2", "bob");
      adapter.set("session:1", "data");
      
      expect(adapter.keys().length).toBe(3);
      expect(adapter.keys("user:").length).toBe(2);
      expect(adapter.keys("session:")).toEqual(["session:1"]);
    });

    test("cleanup removes expired entries", async () => {
      adapter.set("clean_me", "temp", 0.05); // 50ms
      await Bun.sleep(100);
      const removed = adapter.cleanup();
      expect(removed).toBeGreaterThan(0);
      expect(adapter.keys().includes("clean_me")).toBe(false);
    });
  });

  describe("SQLiteAdapter", () => {
    let adapter: SQLiteAdapter;

    beforeAll(() => {
      adapter = new SQLiteAdapter({ path: ":memory:" });
    });

    afterAll(() => {
      adapter.close();
    });

    test("set and get basic values", async () => {
      await adapter.set("test1", "hello");
      const val = await adapter.get("test1");
      expect(val).toBe("hello");
    });

    test("set and get objects", async () => {
      await adapter.set("obj1", { a: 1 });
      const val = await adapter.get<{ a: number }>("obj1");
      expect(val).toEqual({ a: 1 });
    });

    test("respects TTL expiration", async () => {
      await adapter.set("ttl_test", "expire_me", 0.1); // 100ms
      expect(await adapter.get<string>("ttl_test")).toBe("expire_me");
      
      await Bun.sleep(150);
      
      expect(await adapter.get("ttl_test")).toBeNull();
    });

    test("delete removes key", async () => {
      await adapter.set("delete_me", "gone");
      expect(await adapter.delete("delete_me")).toBe(true);
      expect(await adapter.get("delete_me")).toBeNull();
      expect(await adapter.delete("does_not_exist")).toBe(false);
    });

    test("has checks existence", async () => {
      await adapter.set("exists", "yes");
      expect(await adapter.has("exists")).toBe(true);
      expect(await adapter.has("not_exists")).toBe(false);
    });
    
    test("keys and prefix filtering", async () => {
      await adapter.clear();
      await adapter.set("user:1", "alice");
      await adapter.set("user:2", "bob");
      await adapter.set("session:1", "data");
      
      const allKeys = await adapter.keys();
      expect(allKeys.length).toBe(3);
      
      const userKeys = await adapter.keys("user:");
      expect(userKeys.length).toBe(2);
      
      const sessionKeys = await adapter.keys("session:");
      expect(sessionKeys).toEqual(["session:1"]);
    });
  });
});

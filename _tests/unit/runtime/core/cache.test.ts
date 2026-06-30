import { describe, test, expect, beforeEach, afterEach, setSystemTime } from "bun:test";
import { MemoryCacheStore } from "../../../../runtime/bun/src/core/cache";

describe("core/cache", () => {
  let cache: MemoryCacheStore;

  beforeEach(() => {
    cache = new MemoryCacheStore();
  });

  afterEach(() => {
    cache.close();
    setSystemTime(); // reset system time
  });

  test("returns null for non-existent keys", async () => {
    const value = await cache.get("missing");
    expect(value).toBeNull();
  });

  test("stores and retrieves values without TTL", async () => {
    await cache.set("user:1", { name: "Alice" });
    const value = await cache.get("user:1");
    expect(value).toEqual({ name: "Alice" });
  });

  test("respects TTL and expires items correctly", async () => {
    // Lock time to a specific date
    const now = new Date("2026-01-01T00:00:00Z");
    setSystemTime(now);

    await cache.set("token:123", "secret", 60); // 60 seconds TTL

    // Immediately after, it should exist
    let value = await cache.get("token:123");
    expect(value).toBe("secret");

    // Advance time by 30 seconds
    setSystemTime(new Date(now.getTime() + 30 * 1000));
    value = await cache.get("token:123");
    expect(value).toBe("secret");

    // Advance time past 60 seconds (70 seconds total)
    setSystemTime(new Date(now.getTime() + 70 * 1000));
    value = await cache.get("token:123");
    
    // Should return null and evict the item
    expect(value).toBeNull();
  });

  test("deletes multiple keys and returns count of deleted items", async () => {
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);

    const deletedCount = await cache.del("a", "b", "missing");
    expect(deletedCount).toBe(2);

    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
    expect(await cache.get("c")).toBe(3); // untouched
  });

  test("close clears all cache entries", async () => {
    await cache.set("k1", "v1");
    await cache.set("k2", "v2");

    cache.close();

    expect(await cache.get("k1")).toBeNull();
    expect(await cache.get("k2")).toBeNull();
  });
});

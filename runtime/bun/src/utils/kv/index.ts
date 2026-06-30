// Radiant Async Key-Value Storage
// Modular Adapter Architecture
// Version: 1.0.0

import type { KVAdapter, KVOptions, KVDriverType } from "./types";
import { MemoryAdapter } from "./adapters/memory";
import { SQLiteAdapter } from "./adapters/sqlite";
import { RedisAdapter } from "./adapters/redis";

export * from "./types";

/**
 * A lightweight async key-value store facade that proxies to various drivers
 * (Memory, SQLite, Redis) based on configuration.
 *
 * @example
 * ```ts
 * import { RadiantKV } from "@codesordinatestudio/radiant";
 *
 * const kv = new RadiantKV({ driver: "memory" });
 * await kv.set("user:1", { name: "Alice" }, 3600); // TTL 1 hour
 * const user = await kv.get<{ name: string }>("user:1");
 * ```
 */
export class RadiantKV implements KVAdapter {
  private adapter: KVAdapter;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private isCleanupNative: boolean = false;

  constructor(options: KVOptions = {}) {
    const driver: KVDriverType = options.driver ?? "sqlite";

    if (driver === "memory") {
      this.adapter = new MemoryAdapter();
      this.isCleanupNative = false;
    } else if (driver === "redis") {
      this.adapter = new RedisAdapter(options.redis);
      this.isCleanupNative = true; // Redis handles its own TTL natively
    } else {
      this.adapter = new SQLiteAdapter(options.sqlite);
      this.isCleanupNative = false;
    }

    // Start periodic cleanup for adapters that need manual sweeping
    if (!this.isCleanupNative) {
      const interval = options.cleanupInterval ?? 60_000;
      if (interval > 0) {
        this.cleanupTimer = setInterval(() => this.cleanup(), interval);
        // Allow the process to exit even if the timer is active
        if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
          (this.cleanupTimer as NodeJS.Timeout).unref();
        }
      }
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.adapter.get<T>(key);
  }

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    return this.adapter.getMany<T>(keys);
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    return this.adapter.set(key, value, ttl);
  }

  async setMany(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    return this.adapter.setMany(entries);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(key: string): Promise<boolean> {
    return this.adapter.delete(key);
  }

  async deleteMany(keys: string[]): Promise<number> {
    return this.adapter.deleteMany(keys);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async has(key: string): Promise<boolean> {
    return this.adapter.has(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    return this.adapter.keys(prefix);
  }

  async count(): Promise<number> {
    return this.adapter.count();
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  async clear(): Promise<void> {
    return this.adapter.clear();
  }

  async cleanup(): Promise<number> {
    return this.adapter.cleanup();
  }

  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    return this.adapter.close();
  }
}

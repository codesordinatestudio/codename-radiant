import type { KVAdapter } from "../types";
import { logger } from "../../logger";

let log: ReturnType<typeof logger.child> | null = null;
function getLog() {
  if (!log) log = logger.child({ component: "kv-redis" });
  return log;
}

export class RedisAdapter implements KVAdapter {
  private redis: any;

  constructor(options?: { url?: string }) {
    try {
      // Dynamically require ioredis so we don't have a hard runtime dependency
      // on it for users who only use memory or sqlite.
      const Redis = require("ioredis");
      this.redis = new Redis(options?.url || "redis://localhost:6379");
      getLog().debug({ url: options?.url || "redis://localhost:6379" }, "Redis KV adapter initialized");
    } catch (error) {
      throw new Error(
        "Failed to initialize Redis KV adapter. Please ensure 'ioredis' is installed: bun add ioredis"
      );
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (keys.length === 0) return result;
    
    const values = await this.redis.mget(...keys);
    for (let i = 0; i < keys.length; i++) {
      const value = values[i];
      if (value) {
        try {
          result.set(keys[i], JSON.parse(value) as T);
        } catch {
          result.set(keys[i], value as T);
        }
      }
    }
    return result;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl != null) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async setMany(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const { key, value, ttl } of entries) {
      const serialized = JSON.stringify(value);
      if (ttl != null) {
        pipeline.setex(key, ttl, serialized);
      } else {
        pipeline.set(key, serialized);
      }
    }
    await pipeline.exec();
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.redis.del(key);
    return deleted > 0;
  }

  async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.redis.del(...keys);
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.redis.exists(key);
    return exists > 0;
  }

  async keys(prefix?: string): Promise<string[]> {
    if (!prefix) {
      return await this.redis.keys("*");
    }
    return await this.redis.keys(`${prefix}*`);
  }

  async count(): Promise<number> {
    // Note: DBSIZE returns all keys in the database. 
    // If sharing a redis instance, this might not be fully accurate for just KV keys.
    return await this.redis.dbsize();
  }

  async clear(): Promise<void> {
    await this.redis.flushdb();
  }

  cleanup(): number {
    // Redis handles its own TTL expiration natively
    return 0;
  }

  close(): void {
    this.redis.disconnect();
    getLog().debug("Redis KV adapter closed");
  }
}

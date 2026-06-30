import type { KVAdapter } from "../types";
import { logger } from "../../logger";

let log: ReturnType<typeof logger.child> | null = null;
function getLog() {
  if (!log) log = logger.child({ component: "kv-memory" });
  return log;
}

export class MemoryAdapter implements KVAdapter {
  private store = new Map<string, { value: any; expiresAt: number | null }>();

  get<T = unknown>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  getMany<T = unknown>(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    const now = Date.now();
    for (const key of keys) {
      const entry = this.store.get(key);
      if (entry) {
        if (entry.expiresAt !== null && entry.expiresAt <= now) {
          this.store.delete(key);
        } else {
          result.set(key, entry.value as T);
        }
      }
    }
    return result;
  }

  set(key: string, value: unknown, ttl?: number): void {
    const expiresAt = ttl != null ? Date.now() + ttl * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  setMany(entries: Array<{ key: string; value: unknown; ttl?: number }>): void {
    const now = Date.now();
    for (const { key, value, ttl } of entries) {
      const expiresAt = ttl != null ? now + ttl * 1000 : null;
      this.store.set(key, { value, expiresAt });
    }
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  deleteMany(keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  keys(prefix?: string): string[] {
    const now = Date.now();
    const result: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt === null || entry.expiresAt > now) {
        if (!prefix || key.startsWith(prefix)) {
          result.push(key);
        }
      }
    }
    return result;
  }

  count(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.store.values()) {
      if (entry.expiresAt === null || entry.expiresAt > now) {
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      getLog().debug({ removed }, "KV expired entries cleaned up (Memory)");
    }
    return removed;
  }

  close(): void {
    this.store.clear();
    getLog().debug("Memory KV store closed");
  }
}

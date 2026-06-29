// Radiant Async Key-Value Storage
// Standalone utility — not wired into the Radiant plugin.
// Backed by bun:sqlite for zero-dependency persistent storage.
// Version: 0.0.4

import { Database } from "bun:sqlite";
import { logger } from "./logger";

// Lazy logger to avoid circular dependency issues
let log: ReturnType<typeof logger.child> | null = null;
function getLog() {
  if (!log) log = logger.child({ component: "kv" });
  return log;
}

// ============================================================================
// Types
// ============================================================================

export interface KVOptions {
  /** Path to the SQLite database file. Default: "./data/radiant-kv.sqlite" */
  path?: string;
  /** Use in-memory storage (no persistence). Default: false */
  inMemory?: boolean;
  /**
   * Interval in milliseconds for automatic cleanup of expired entries.
   * Set to 0 to disable periodic cleanup. Default: 60_000 (1 minute)
   */
  cleanupInterval?: number;
}

// ============================================================================
// RadiantKV Class
// ============================================================================

/**
 * A lightweight async key-value store backed by bun:sqlite.
 *
 * @example
 * ```ts
 * import { RadiantKV } from "@codesordinatestudio/radiant";
 *
 * const kv = new RadiantKV();
 * await kv.set("user:1", { name: "Alice" }, 3600); // TTL 1 hour
 * const user = await kv.get<{ name: string }>("user:1");
 * ```
 */
export class RadiantKV {
  private db: Database;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Pre-compiled statements for performance
  private stmtGet: ReturnType<Database["prepare"]>;
  private stmtSet: ReturnType<Database["prepare"]>;
  private stmtDel: ReturnType<Database["prepare"]>;
  private stmtHas: ReturnType<Database["prepare"]>;
  private stmtKeys: ReturnType<Database["prepare"]>;
  private stmtKeysPrefix: ReturnType<Database["prepare"]>;
  private stmtClear: ReturnType<Database["prepare"]>;
  private stmtCleanup: ReturnType<Database["prepare"]>;
  private stmtCount: ReturnType<Database["prepare"]>;

  constructor(options: KVOptions = {}) {
    const dbPath = options.inMemory ? ":memory:" : (options.path ?? "./data/radiant-kv.sqlite");

    // Ensure directory exists for file-based storage
    if (!options.inMemory && dbPath !== ":memory:") {
      const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
      if (dir) {
        try {
          const { mkdirSync } = require("node:fs");
          mkdirSync(dir, { recursive: true });
        } catch {
          // directory may already exist
        }
      }
    }

    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");

    // Create table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    `);

    // Create index for expiry cleanup
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv(expires_at) WHERE expires_at IS NOT NULL`);

    // Prepare statements
    this.stmtGet = this.db.prepare("SELECT value FROM kv WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)");
    this.stmtSet = this.db.prepare("INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)");
    this.stmtDel = this.db.prepare("DELETE FROM kv WHERE key = ?");
    this.stmtHas = this.db.prepare("SELECT 1 FROM kv WHERE key = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1");
    this.stmtKeys = this.db.prepare("SELECT key FROM kv WHERE expires_at IS NULL OR expires_at > ?");
    this.stmtKeysPrefix = this.db.prepare(
      "SELECT key FROM kv WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)",
    );
    this.stmtClear = this.db.prepare("DELETE FROM kv");
    this.stmtCleanup = this.db.prepare("DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= ?");
    this.stmtCount = this.db.prepare("SELECT COUNT(*) as count FROM kv WHERE expires_at IS NULL OR expires_at > ?");

    // Start periodic cleanup
    const interval = options.cleanupInterval ?? 60_000;
    if (interval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), interval);
      // Allow the process to exit even if the timer is active
      if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
        (this.cleanupTimer as NodeJS.Timeout).unref();
      }
    }

    getLog().debug({ path: dbPath }, "KV store opened");
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Retrieve a value by key. Returns `null` if the key doesn't exist or is expired.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const now = Date.now();
    const row = this.stmtGet.get(key, now) as { value: string } | null;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as T;
    }
  }

  /**
   * Retrieve multiple values by keys. Returns a Map of key → value (missing/expired keys omitted).
   */
  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const val = await this.get<T>(key);
      if (val !== null) result.set(key, val);
    }
    return result;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Set a key-value pair. Values are JSON-serialized.
   * @param key   The key string.
   * @param value Any JSON-serializable value.
   * @param ttl   Time-to-live in seconds. Omit for no expiry.
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const expiresAt = ttl != null ? Date.now() + ttl * 1000 : null;
    this.stmtSet.run(key, serialized, expiresAt);
  }

  /**
   * Set multiple key-value pairs in a single transaction.
   */
  async setMany(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    const tx = this.db.transaction(() => {
      for (const { key, value, ttl } of entries) {
        const serialized = JSON.stringify(value);
        const expiresAt = ttl != null ? Date.now() + ttl * 1000 : null;
        this.stmtSet.run(key, serialized, expiresAt);
      }
    });
    tx();
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * Delete a key. No-op if the key doesn't exist.
   */
  async delete(key: string): Promise<boolean> {
    const result = this.stmtDel.run(key);
    return result.changes > 0;
  }

  /**
   * Delete multiple keys in a single transaction.
   */
  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;
    const tx = this.db.transaction(() => {
      for (const key of keys) {
        const result = this.stmtDel.run(key);
        deleted += result.changes;
      }
    });
    tx();
    return deleted;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /**
   * Check whether a key exists and is not expired.
   */
  async has(key: string): Promise<boolean> {
    const now = Date.now();
    return this.stmtHas.get(key, now) !== null;
  }

  /**
   * List all non-expired keys, optionally filtered by prefix.
   */
  async keys(prefix?: string): Promise<string[]> {
    const now = Date.now();
    const rows = prefix
      ? (this.stmtKeysPrefix.all(`${prefix}%`, now) as { key: string }[])
      : (this.stmtKeys.all(now) as { key: string }[]);
    return rows.map((r) => r.key);
  }

  /**
   * Count all non-expired entries.
   */
  async count(): Promise<number> {
    const now = Date.now();
    const row = this.stmtCount.get(now) as { count: number };
    return row.count;
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  /**
   * Delete all entries.
   */
  async clear(): Promise<void> {
    this.stmtClear.run();
  }

  /**
   * Remove all expired entries. Called automatically by the periodic cleanup timer.
   */
  cleanup(): number {
    const now = Date.now();
    const result = this.stmtCleanup.run(now);
    if (result.changes > 0) {
      getLog().debug({ removed: result.changes }, "KV expired entries cleaned up");
    }
    return result.changes;
  }

  /**
   * Close the database connection and stop the cleanup timer.
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.db.close();
    getLog().debug("KV store closed");
  }
}

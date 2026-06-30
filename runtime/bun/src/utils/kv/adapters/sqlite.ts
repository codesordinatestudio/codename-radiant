import { Database } from "bun:sqlite";
import type { KVAdapter } from "../types";
import { logger } from "../../logger";

let log: ReturnType<typeof logger.child> | null = null;
function getLog() {
  if (!log) log = logger.child({ component: "kv-sqlite" });
  return log;
}

export class SQLiteAdapter implements KVAdapter {
  private db: Database;
  
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

  constructor(options?: { path?: string }) {
    const dbPath = options?.path ?? "./data/radiant-kv.sqlite";
    
    // Ensure directory exists for file-based storage
    if (dbPath !== ":memory:") {
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
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv(expires_at) WHERE expires_at IS NOT NULL`);

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

    getLog().debug({ path: dbPath }, "SQLite KV adapter initialized");
  }

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

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const val = await this.get<T>(key);
      if (val !== null) result.set(key, val);
    }
    return result;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const expiresAt = ttl != null ? Date.now() + ttl * 1000 : null;
    this.stmtSet.run(key, serialized, expiresAt);
  }

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

  async delete(key: string): Promise<boolean> {
    const result = this.stmtDel.run(key);
    return result.changes > 0;
  }

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

  async has(key: string): Promise<boolean> {
    const now = Date.now();
    return this.stmtHas.get(key, now) !== null;
  }

  async keys(prefix?: string): Promise<string[]> {
    const now = Date.now();
    const rows = prefix
      ? (this.stmtKeysPrefix.all(`${prefix}%`, now) as { key: string }[])
      : (this.stmtKeys.all(now) as { key: string }[]);
    return rows.map((r) => r.key);
  }

  async count(): Promise<number> {
    const now = Date.now();
    const row = this.stmtCount.get(now) as { count: number };
    return row.count;
  }

  async clear(): Promise<void> {
    this.stmtClear.run();
  }

  cleanup(): number {
    const now = Date.now();
    const result = this.stmtCleanup.run(now);
    if (result.changes > 0) {
      getLog().debug({ removed: result.changes }, "KV expired entries cleaned up (SQLite)");
    }
    return result.changes;
  }

  close(): void {
    this.db.close();
    getLog().debug("SQLite KV adapter closed");
  }
}

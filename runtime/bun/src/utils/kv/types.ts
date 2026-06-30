export type KVDriverType = "memory" | "sqlite" | "redis";

export interface KVOptions {
  /** The storage driver to use. Default: "sqlite" */
  driver?: KVDriverType;
  /**
   * Interval in milliseconds for automatic cleanup of expired entries (Memory/SQLite).
   * Set to 0 to disable periodic cleanup. Default: 60_000 (1 minute)
   */
  cleanupInterval?: number;
  /** Configuration for the SQLite driver */
  sqlite?: {
    /** Path to the SQLite database file. Default: "./data/radiant-kv.sqlite" */
    path?: string;
  };
  /** Configuration for the Redis driver */
  redis?: {
    /** Redis connection URL. Default: "redis://localhost:6379" */
    url?: string;
  };
}

export interface KVAdapter {
  get<T>(key: string): Promise<T | null> | T | null;
  getMany<T>(keys: string[]): Promise<Map<string, T>> | Map<string, T>;
  set(key: string, value: unknown, ttl?: number): Promise<void> | void;
  setMany(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> | void;
  delete(key: string): Promise<boolean> | boolean;
  deleteMany(keys: string[]): Promise<number> | number;
  has(key: string): Promise<boolean> | boolean;
  keys(prefix?: string): Promise<string[]> | string[];
  count(): Promise<number> | number;
  clear(): Promise<void> | void;
  cleanup(): Promise<number> | number;
  close(): Promise<void> | void;
}

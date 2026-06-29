// Radiant Logger - Pino-based structured logging
// Version: 0.0.4

import pino from "pino";
import pretty from "pino-pretty";
import { RadiantKV } from "./kv";

// ============================================================================
// Logger Configuration
// ============================================================================

const LOG_LEVEL = Bun.env.LUCENT_LOG_LEVEL || Bun.env.LOG_LEVEL || (Bun.env.NODE_ENV === "test" ? "silent" : "info");
const ERROR_LOG_KV = Bun.env.LUCENT_ERROR_LOG_KV === "true";

/**
 * Radiant's shared Pino logger instance.
 *
 * Log levels (ascending severity): trace, debug, info, warn, error, fatal
 *
 * Control via environment variables:
 *   LUCENT_LOG_LEVEL=debug  (or LOG_LEVEL)
 *   LUCENT_ERROR_LOG_KV=true  (error logs stored in RadiantKV)
 */

let kvStore: RadiantKV | null = null;

// Create error KV store on demand
function getErrorKV(): RadiantKV {
  if (!kvStore) {
    kvStore = new RadiantKV({ path: "./data/radiant-error-kv.sqlite" });
  }
  return kvStore;
}

// Custom write stream for RadiantKV
function createKVStream() {
  let buffer: string[] = [];
  const flushInterval = setInterval(() => {
    if (buffer.length > 0 && kvStore) {
      const errorsToStore = buffer.splice(0);
      for (const errorLog of errorsToStore) {
        const timestamp = Date.now();
        const key = `error:${timestamp}:${Math.random().toString(36).slice(2)}`;
        kvStore!.set(key, errorLog).catch(() => {});
      }
    }
  }, 1000);

  return {
    write(msg: string) {
      buffer.push(msg);
    },
    flush() {
      clearInterval(flushInterval);
      if (buffer.length > 0 && kvStore) {
        const errorsToStore = buffer.splice(0);
        for (const errorLog of errorsToStore) {
          const timestamp = Date.now();
          const key = `error:${timestamp}:${Math.random().toString(36).slice(2)}`;
          kvStore!.set(key, errorLog).catch(() => {});
        }
      }
    },
    destroy() {
      clearInterval(flushInterval);
    },
  };
}

// Determine stream destination
function createStream(): ReturnType<typeof pretty> | undefined {
  // Default: pretty stdout in dev, silent in test
  if (Bun.env.NODE_ENV !== "production" && Bun.env.NODE_ENV !== "test") {
    return pretty({
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss.l",
      ignore: "pid,hostname,component,count,output,url",
      customColors: "info:bgBlue,error:bgRed,warn:bgYellow",
    });
  }
  return undefined;
}

const consoleStream = createStream();

// Mixin to store errors to KV
const errorStorageMixin = () => ({
  // This runs for every log, but we filter by level inside
});

// Store errors to KV (side effect)
function storeErrorToKV(obj: unknown, msg: string) {
  if (ERROR_LOG_KV) {
    const err = obj && typeof obj === "object" && "err" in obj ? (obj as { err?: unknown }).err : obj;
    const logData = {
      level: 50,
      time: Date.now(),
      msg,
      err,
    };
    const key = `error:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    getErrorKV()
      .set(key, JSON.stringify(logData))
      .catch(() => {});
  }
}

// Base logger - always created first so child() is available
export const logger = consoleStream
  ? pino({ name: "radiant", level: LOG_LEVEL }, consoleStream)
  : pino({ name: "radiant", level: LOG_LEVEL });

type WritableErrorLogger = Omit<typeof logger, "error"> & {
  error: (objOrMsg: unknown, msgOrFn?: unknown, ...args: unknown[]) => void;
};

// Add error storage as a write intercept
if (ERROR_LOG_KV) {
  const loggerWithErrorStorage = logger as WritableErrorLogger;
  const originalError = loggerWithErrorStorage.error.bind(logger);
  loggerWithErrorStorage.error = (objOrMsg: unknown, msgOrFn?: unknown, ...args: unknown[]) => {
    const msg = typeof msgOrFn === "string" ? msgOrFn : typeof objOrMsg === "string" ? objOrMsg : String(objOrMsg);
    storeErrorToKV(objOrMsg, msg);
    return originalError(objOrMsg, msgOrFn, ...args);
  };
}

// ============================================================================
// Error Log Retrieval
// ============================================================================

export interface ErrorLogEntry {
  key: string;
  timestamp: number;
  level: string;
  message: string;
  error?: string;
  stack?: string;
}

/**
 * RadiantErrorLogs - Store and retrieve error logs using RadiantKV
 */
export class RadiantErrorLogs {
  /**
   * Get error logs from KV store.
   *
   * @param options.limit Max number of logs to return. Default: 100
   * @param options.since Return logs after this timestamp (ms). Default: all
   */
  static async get(options: { limit?: number; since?: number } = {}): Promise<ErrorLogEntry[]> {
    const { limit = 100, since } = options;
    const kv = getErrorKV();
    const allKeys = await kv.keys("error:");
    const errors: ErrorLogEntry[] = [];

    for (const key of allKeys.slice(-limit)) {
      const timestamp = parseInt(key.split(":")[1]);
      if (since && timestamp < since) continue;

      const log = await kv.get<string>(key);
      if (log) {
        try {
          const parsed = JSON.parse(log);
          errors.push({
            key,
            timestamp,
            level: parsed.level === 50 ? "error" : parsed.level === 60 ? "fatal" : "error",
            message: parsed.msg || parsed.message || "",
            error: parsed.err?.message,
            stack: parsed.err?.stack,
          });
        } catch {
          errors.push({ key, timestamp, level: "error", message: log });
        }
      }
    }

    return errors.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get error log count.
   */
  static async count(): Promise<number> {
    const kv = getErrorKV();
    const keys = await kv.keys("error:");
    return keys.length;
  }

  /**
   * Clear all error logs.
   */
  static async clear(): Promise<void> {
    const kv = getErrorKV();
    const keys = await kv.keys("error:");
    await kv.deleteMany(keys);
  }
}

// Keep backward-compatible aliases
const getErrorLogs = (opts: { limit?: number; since?: number } = {}) => RadiantErrorLogs.get(opts);
const getErrorLogCount = () => RadiantErrorLogs.count();
const clearErrorLogs = () => RadiantErrorLogs.clear();

/**
 * Creates a child logger scoped to a specific module / component.
 *
 * ```ts
 * const log = createLogger("rest");
 * log.info({ collection: "posts" }, "Route registered");
 * ```
 */
export function createLogger(component: string) {
  return logger.child({ component });
}

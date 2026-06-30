import type { RadiantAdapter, CacheStore } from "../core";

export interface HealthCheckResult {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: "ok" | "error"; latencyMs?: number; error?: string };
    cache?: { status: "ok" | "error" | "not_configured"; latencyMs?: number; error?: string };
  };
}

export async function runHealthCheck(
  adapter: RadiantAdapter,
  cache?: CacheStore,
): Promise<HealthCheckResult> {
  const startTime = process.uptime();
  const checks: HealthCheckResult["checks"] = {
    database: { status: "ok" },
  };

  // Database ping
  try {
    const dbStart = performance.now();
    // In Radiant, adapter doesn't expose ping() natively in types. We can try to run a simple count or raw query.
    // We will do a generic table count or rely on a ping if it exists.
    if ((adapter as any).ping) {
      await (adapter as any).ping();
    } else {
      // Fallback: simple query to test connection
      await adapter.count("radiant_globals", {});
    }
    checks.database = { status: "ok", latencyMs: Math.round(performance.now() - dbStart) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.database = { status: "error", error: msg };
  }

  // Cache ping (Since Radiant uses MemoryCacheStore or external plugin, check if it exists and has ping)
  if (cache) {
    try {
      const cacheStart = performance.now();
      if ((cache as any).ping) {
        await (cache as any).ping();
        checks.cache = { status: "ok", latencyMs: Math.round(performance.now() - cacheStart) };
      } else {
         // If memory cache, it's always ok
         checks.cache = { status: "ok", latencyMs: 0 };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.cache = { status: "error", error: msg };
    }
  } else {
    checks.cache = { status: "not_configured" };
  }

  const dbOk = checks.database.status === "ok";
  const cacheOk = !cache || checks.cache?.status === "ok";

  let status: HealthCheckResult["status"] = "ok";
  if (!dbOk) status = "error";
  else if (!cacheOk) status = "degraded";

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.round(startTime),
    checks,
  };
}

import type { RadiantRuntime } from "../main/runtime";
import { RadiantMonitoringBuffer } from "./buffer";
import { RadiantMonitoringExporterDispatcher } from "./dispatcher";
import type { RadiantMonitoringEvent, RadiantMonitoringExporter, RadiantMonitoringQuery } from "./types";
import { createMonitoringEvent, matchesMonitoringQuery } from "./types";
import { runHealthCheck } from "./health";

export interface RadiantMonitoringAPI {
  /** Add an exporter to receive batched events. */
  addExporter(exporter: RadiantMonitoringExporter): void;
  /** Emit an event into the buffer and dispatcher. Returns void (fire-and-forget). */
  emit(event: Omit<RadiantMonitoringEvent, "id" | "timestamp"> & Partial<Pick<RadiantMonitoringEvent, "id" | "timestamp">>): void;
  /** Whether monitoring is active and the router should instrument requests. */
  hasHandlers(): boolean;
  /** Generate or extract a request ID from the incoming request. */
  requestId(request: Request): string;
  /** Gracefully shut down: flush pending exporter batches and clear timers. */
  stop(): Promise<void>;
  buffer: RadiantMonitoringBuffer;
  dispatcher: RadiantMonitoringExporterDispatcher;
}

/** Constant-time string comparison to prevent timing attacks on API keys. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare b against itself to keep timing consistent
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff |= b.charCodeAt(i) ^ b.charCodeAt(i);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function setupMonitoring(app: RadiantRuntime<any>): RadiantMonitoringAPI | undefined {
  const monitoringConfig = app.schema.monitoring;

  // Disabled by default
  if (monitoringConfig?.enabled !== true) {
    return undefined;
  }

  const apiKey = monitoringConfig.apiKey;
  if (!apiKey) {
    console.warn("[Radiant Monitoring] Warning: Monitoring is enabled but no apiKey is set in config.radiant. Monitoring endpoints will be insecure.");
  }

  const buffer = new RadiantMonitoringBuffer();
  const dispatcher = new RadiantMonitoringExporterDispatcher();

  // Wire buffer → dispatcher: every event pushed to the buffer is also
  // enqueued for export.
  buffer.subscribe((event) => {
    dispatcher.enqueue(event).catch(() => {});
  });

  // Expose API
  const api: RadiantMonitoringAPI = {
    addExporter: (exporter) => dispatcher.addExporter(exporter),
    emit: (event) => {
      buffer.push(createMonitoringEvent(event));
    },
    hasHandlers: () => true,
    requestId: (request: Request): string => {
      // Honour an incoming X-Request-ID header, otherwise generate one.
      const incoming = request.headers.get("X-Request-ID");
      if (incoming) return incoming;
      return crypto.randomUUID();
    },
    stop: () => dispatcher.stop(),
    buffer,
    dispatcher,
  };

  const prefix = app.schema.core?.api?.prefix || "/api";
  const basePath = `${prefix}/monitor`;

  // Auth Middleware — returns a 401 Response on failure, null on success.
  const authMiddleware = (req: Request): Response | null => {
    if (!apiKey) return null; // Insecure if no key configured
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${apiKey}`)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  };

  // Events
  app.router.get(`${basePath}/events`, async (ctx) => {
    const authError = authMiddleware(ctx.request);
    if (authError) return authError;

    const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
    return new Response(JSON.stringify({ events: buffer.query(query as any) }), {
      headers: { "Content-Type": "application/json" }
    });
  });

  // Metrics
  app.router.get(`${basePath}/metrics`, async (ctx) => {
    const authError = authMiddleware(ctx.request);
    if (authError) return authError;

    const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
    return new Response(JSON.stringify(buffer.summary(query as any)), {
      headers: { "Content-Type": "application/json" }
    });
  });

  // Health — respects healthCheck.enabled and healthCheck.requiresAuth
  const healthCheckConfig = monitoringConfig.healthCheck;
  if (healthCheckConfig?.enabled !== false) {
    const healthPath = healthCheckConfig?.path || `${basePath}/health`;
    const healthRequiresAuth = healthCheckConfig?.requiresAuth === true;
    app.router.get(healthPath, async (ctx) => {
      if (healthRequiresAuth) {
        const authError = authMiddleware(ctx.request);
        if (authError) return authError;
      }

      const result = await runHealthCheck(app.adapter, app.cache);
      const httpStatus = result.status === "error" ? 503 : 200;
      
      // Emit health event to buffer
      api.emit({
        type: "health.checked",
        severity: (result.status === "error" ? "error" : result.status === "degraded" ? "warn" : "info") as "error" | "warn" | "info",
        source: "health",
        metadata: result as unknown as Record<string, unknown>,
      });

      return new Response(JSON.stringify(result), {
        status: httpStatus,
        headers: { "Content-Type": "application/json" },
      });
    });
  }

  // Stream (SSE)
  app.router.get(`${basePath}/stream`, async (ctx) => {
    const authError = authMiddleware(ctx.request);
    if (authError) return authError;

    const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries()) as RadiantMonitoringQuery;
    
    let unsubscribe: (() => void) | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const sse = (event: RadiantMonitoringEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

        // Replay filtered backlog
        for (const event of buffer.query(query)) {
          controller.enqueue(encoder.encode(sse(event)));
        }

        // Stream filtered live events
        unsubscribe = buffer.subscribe((event) => {
          if (!matchesMonitoringQuery(event, query)) return;
          controller.enqueue(encoder.encode(sse(event)));
        });

        // Keepalive heartbeat every 30s — prevents proxy/LB timeout
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            // controller already closed
          }
        }, 30_000);
      },
      cancel() {
        unsubscribe?.();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  // Start the dispatcher timers
  dispatcher.start();

  return api;
}

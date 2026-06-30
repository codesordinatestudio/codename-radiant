import type { RadiantRuntime } from "../main/runtime";
import { RadiantMonitoringBuffer } from "./buffer";
import { RadiantMonitoringExporterDispatcher } from "./dispatcher";
import type { RadiantMonitoringExporter } from "./types";
import { runHealthCheck } from "./health"; // We will create this

export interface RadiantMonitoringAPI {
  addExporter(exporter: RadiantMonitoringExporter): void;
  buffer: RadiantMonitoringBuffer;
  dispatcher: RadiantMonitoringExporterDispatcher;
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

  // Expose API
  const api: RadiantMonitoringAPI = {
    addExporter: (exporter) => dispatcher.addExporter(exporter),
    buffer,
    dispatcher,
  };

  const prefix = app.schema.core?.api?.prefix || "/api";
  const basePath = `${prefix}/monitor`;

  // Auth Middleware
  const authMiddleware = async (req: Request) => {
    if (!apiKey) return null; // Insecure if no key configured
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${apiKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { "Content-Type": "application/json" } 
      });
    }
    return null;
  };

  // Events
  app.router.get(`${basePath}/events`, async (ctx) => {
    const authError = await authMiddleware(ctx.request);
    if (authError) return authError;

    const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
    return new Response(JSON.stringify({ events: buffer.query(query as any) }), {
      headers: { "Content-Type": "application/json" }
    });
  });

  // Metrics
  app.router.get(`${basePath}/metrics`, async (ctx) => {
    const authError = await authMiddleware(ctx.request);
    if (authError) return authError;

    const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
    return new Response(JSON.stringify(buffer.summary(query as any)), {
      headers: { "Content-Type": "application/json" }
    });
  });

  // Health
  const healthPath = monitoringConfig.healthCheck?.path || `${basePath}/health`;
  app.router.get(healthPath, async (ctx) => {
    const result = await runHealthCheck(app.adapter, app.cache);
    const httpStatus = result.status === "error" ? 503 : 200;
    
    // Emit health event to buffer
    const event = {
      type: "health.checked" as const,
      severity: (result.status === "error" ? "error" : result.status === "degraded" ? "warn" : "info") as "error" | "warn" | "info",
      source: "health",
      metadata: result as unknown as Record<string, unknown>,
    };
    buffer.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    });

    return new Response(JSON.stringify(result), {
      status: httpStatus,
      headers: { "Content-Type": "application/json" },
    });
  });

  // Stream
  app.router.get(`${basePath}/stream`, async (ctx) => {
    const authError = await authMiddleware(ctx.request);
    if (authError) return authError;

    const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
    
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const sse = (event: any) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

        for (const event of buffer.query(query as any)) {
          controller.enqueue(encoder.encode(sse(event)));
        }

        // We could filter here based on query, but for now we stream everything pushed
        unsubscribe = buffer.subscribe((event) => {
          controller.enqueue(encoder.encode(sse(event)));
        });
      },
      cancel() {
        unsubscribe?.();
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

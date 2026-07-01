# Monitoring

Radiant's monitoring system captures runtime events — request lifecycle, errors, health checks, traces — and exposes them through HTTP endpoints for external tools and Radiant Desktop to observe live backends.

## Enabling Monitoring

Monitoring is disabled by default. Enable it in `config.radiant`:

```radiant
config {
  monitoring: {
    enabled: true
    apiKey: env("MONITORING_API_KEY")
    healthCheck: {
      enabled: true
      path: "/health"
      requiresAuth: false
    }
    requestId: { enabled: true }
  }
}
```

The `apiKey` secures the monitoring endpoints with Bearer token authentication. If unset, the runtime logs a warning and endpoints are accessible without authentication.

## Endpoints

When enabled, four endpoints are available under `{apiPrefix}/monitor` (default: `/api/monitor`):

### `GET /api/monitor/events`

Query buffered monitoring events. Supports query filters:

| Parameter | Type | Description |
|---|---|---|
| `type` | String or String[] | Filter by event type (e.g., `request.completed`, `request.error`). |
| `severity` | String or String[] | Filter by severity (`debug`, `info`, `warn`, `error`, `fatal`). |
| `since` | String (ISO timestamp) | Only events after this timestamp. |
| `limit` | Number | Max events to return (default: 100, max: 1000). |
| `requestId` | String | Filter by request ID. |
| `collection` | String | Filter by collection slug. |
| `source` | String | Filter by event source. |
| `status` | Number | Filter by HTTP status code. |

```bash
curl -H "Authorization: Bearer $MONITORING_API_KEY" \
  "http://localhost:3000/api/monitor/events?type=request.error&limit=50"
```

### `GET /api/monitor/metrics`

Aggregate summary of buffered events:

```bash
curl -H "Authorization: Bearer $MONITORING_API_KEY" \
  http://localhost:3000/api/monitor/metrics
```

```json
{
  "total": 1523,
  "byType": {
    "request.completed": 1400,
    "request.error": 23,
    "trace": 100,
    "health.checked": 5
  },
  "bySeverity": {
    "info": 1405,
    "error": 23,
    "warn": 5
  },
  "requests": {
    "total": 1400,
    "errors": 23,
    "averageDurationMs": 12.4
  },
  "lastEvent": { "type": "request.completed", "status": 200, "durationMs": 8 }
}
```

### `GET /api/monitor/health`

Database and cache health check. Returns `200` for `ok`/`degraded`, `503` for `error`:

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-07-01T12:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencyMs": 2 },
    "cache": { "status": "ok", "latencyMs": 0 }
  }
}
```

The health endpoint does not require authentication by default. Set `healthCheck.requiresAuth: true` to require the monitoring API key.

### `GET /api/monitor/stream`

Server-Sent Events (SSE) live stream. Replays filtered backlog, then streams new events as they occur. Supports the same query filters as `/events`. A `: heartbeat` comment frame is sent every 30 seconds to keep the connection alive through proxies and load balancers.

```bash
curl -N -H "Authorization: Bearer $MONITORING_API_KEY" \
  "http://localhost:3000/api/monitor/stream?type=request.error"
```

```
event: request.error
data: {"id":"...","type":"request.error","status":500,"durationMs":45,"severity":"error",...}

: heartbeat

event: request.error
data: {"id":"...","type":"request.error","status":503,"durationMs":12,"severity":"error",...}
```

## Event Types

| Type | When emitted | Key fields |
|---|---|---|
| `request.completed` | After every successful request | `method`, `path`, `status`, `durationMs`, `userId` |
| `request.error` | After a request that returned 5xx, or threw | `method`, `path`, `status`, `durationMs`, `severity`, `message` |
| `runtime.error` | Uncaught error in the request pipeline | `method`, `path`, `status`, `severity`, `message`, `metadata.route` |
| `trace` | After every request (regardless of status) | `method`, `path`, `status`, `durationMs`, `metadata.route` |
| `health.checked` | After each health check execution | `severity`, `metadata` (full health result) |
| `request.id` | When request ID tracking is enabled | `requestId` |

## Exporters

Exporters batch events and forward them to external destinations — log aggregators, observability platforms, webhooks, or Radiant Desktop. Add them programmatically:

```typescript
// src/app.ts
import { app } from "./app";

app.monitoring?.addExporter({
  name: "log-console",
  kind: "log",
  batchSize: 50,
  flushIntervalMs: 5000,
  export(batch) {
    for (const event of batch.events) {
      console.log(`[${event.severity}] ${event.type}: ${event.method} ${event.path} ${event.status} ${event.durationMs}ms`);
    }
  },
  onError({ error, exporterName }) {
    console.error(`Exporter ${exporterName} failed:`, error);
  },
});
```

### Exporter Properties

| Property | Type | Description |
|---|---|---|
| `name` | String | Unique identifier for the exporter. |
| `kind` | String | Exporter type: `log`, `opentelemetry`, `webhook`, `dashboard`, `codesordinate-pro`, `custom`. |
| `batchSize` | Number | Events per batch before auto-flush (default: 25). |
| `flushIntervalMs` | Number | Auto-flush interval in milliseconds. |
| `filter` | Query object or function | Filter which events this exporter receives. |
| `export(batch)` | Function | Called with a batch of events. Can be async. |
| `onError(error)` | Function | Called when `export()` throws. |

### Filtering

Exporters accept either a query filter object or a predicate function:

```typescript
// Query filter — only errors
app.monitoring?.addExporter({
  name: "error-webhook",
  kind: "webhook",
  filter: { type: "request.error", severity: "error" },
  batchSize: 10,
  async export(batch) {
    await fetch("https://my-webhook.example.com/radiant-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch.events),
    });
  },
});

// Function filter — only slow requests
app.monitoring?.addExporter({
  name: "slow-requests",
  kind: "log",
  filter: (event) => event.type === "request.completed" && (event.durationMs ?? 0) > 1000,
  batchSize: 20,
  export(batch) {
    console.warn(`${batch.events.length} slow requests detected`);
  },
});
```

## Event Buffer

Events are stored in an in-memory ring buffer (default capacity: 1000 events). The buffer is not persisted — it's intended for live observation, not long-term storage. Use exporters to forward events to persistent stores.

## Request ID Tracking

When `requestId.enabled` is `true`, every request gets a unique ID. The runtime:

1. Checks for an incoming `X-Request-ID` header and reuses it if present.
2. Otherwise generates a UUID.
3. Adds `X-Request-ID` to the response headers.
4. Includes the `requestId` in all monitoring events for that request.

This lets you trace a single request across logs, metrics, and external systems.

## External Tool Integration

### Radiant Desktop

Radiant Desktop can connect to any running Radiant backend that has monitoring enabled. Point it at the `/api/monitor/stream` endpoint to get a live event feed, or poll `/api/monitor/metrics` for periodic summaries.

### OpenTelemetry

Write an exporter that converts Radiant events to OTLP spans/logs:

```typescript
app.monitoring?.addExporter({
  name: "otlp",
  kind: "opentelemetry",
  batchSize: 100,
  flushIntervalMs: 10000,
  async export(batch) {
    // Convert to OTLP format and send to collector
  },
});
```

### Webhook

Forward events to any HTTP endpoint:

```typescript
app.monitoring?.addExporter({
  name: "slack-alerts",
  kind: "webhook",
  filter: { severity: ["error", "fatal"] },
  batchSize: 1,
  async export(batch) {
    for (const event of batch.events) {
      await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Radiant alert: ${event.type} — ${event.message}` }),
      });
    }
  },
});
```

## Related

- [Config Block](./config-block) — `monitoring` config reference
- [Deployment](./deployment) — Health check endpoint for load balancers
- [Access Control](./access) — Authentication and authorization
# Plugins

Plugins extend the Radiant runtime with custom lifecycle hooks. They can override core behaviour (like storage), add global middleware (like request logging), or integrate external services.

## The Plugin Interface

```typescript
interface RadiantPlugin {
  name: string;
  onInit?: (app: RadiantRuntime) => void | Promise<void>;
  beforeRequest?: (ctx: RadiantRequestContext) => void | Promise<void>;
  afterRequest?: (ctx: RadiantRequestContext, response: Response) => void | Promise<void>;
  onError?: (ctx: RadiantRequestContext, error: any) => Response | void | Promise<Response | void>;
}
```

| Hook | When it runs |
|---|---|
| `onInit` | Once, during `app.start()`, before the server boots |
| `beforeRequest` | Before every HTTP request (after rate limiting) |
| `afterRequest` | After every HTTP request, before the response is sent |
| `onError` | When an unhandled error occurs — can return a custom `Response` |

## Registering Plugins

Pass plugins in the `createRadiant()` config, or push them onto `app.plugins`:

```typescript
// In src/app.ts
import { createRadiant } from "../radiant/runtime";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";

const requestLogger = {
  name: "request-logger",
  beforeRequest: (ctx) => {
    console.log(`${ctx.request.method} ${ctx.request.url}`);
  },
};

export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
  plugins: [requestLogger],
});
```

Or dynamically:

```typescript
app.plugins.push({
  name: "auth-guard",
  beforeRequest: (ctx) => {
    if (!ctx.user) throw new Error("Authentication required");
  },
});
```

## Built-in Plugin Uses

### Request Logging

```typescript
const logger = {
  name: "logger",
  beforeRequest: (ctx) => {
    console.log(`→ ${ctx.request.method} ${new URL(ctx.request.url).pathname}`);
  },
  afterRequest: (ctx, res) => {
    console.log(`← ${res.status} ${new URL(ctx.request.url).pathname}`);
  },
};
```

### Global Auth Guard

```typescript
import { RadiantError } from "@codesordinatestudio/radiant-bun";

const authGuard = {
  name: "auth-guard",
  beforeRequest: (ctx) => {
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader) throw RadiantError.Unauthorized("Token required");
    // Verify token...
  },
};
```

### Error Handling

```typescript
const errorHandler = {
  name: "error-handler",
  onError: (ctx, err) => {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  },
};
```

### Overriding Storage

Plugins can replace the default storage provider by setting `app.storage` during `onInit`:

```typescript
import { s3Storage } from "@codesordinatestudio/radiant-plugin-s3";

const s3Plugin = {
  name: "s3-storage",
  onInit: (app) => {
    app.storage = s3Storage({
      bucket: "my-uploads",
      region: "us-east-1",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    });
  },
};
```

## Writing a Custom Plugin

A plugin is just an object with a `name` and any combination of lifecycle hooks:

```typescript
// src/plugins/analytics.ts
import type { RadiantPlugin } from "@codesordinatestudio/radiant-bun";

export function analyticsPlugin(apiKey: string): RadiantPlugin {
  return {
    name: "analytics",
    afterRequest: (ctx, res) => {
      // Send request metrics to an analytics service
      fetch("https://analytics.example.com/ingest", {
        method: "POST",
        headers: { "X-API-Key": apiKey },
        body: JSON.stringify({
          method: ctx.request.method,
          path: new URL(ctx.request.url).pathname,
          status: res.status,
          userId: ctx.user?.id,
        }),
      }).catch(() => {}); // fire-and-forget
    },
  };
}
```

```typescript
// src/app.ts
import { analyticsPlugin } from "./plugins/analytics";

export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
  plugins: [
    analyticsPlugin(process.env.ANALYTICS_API_KEY!),
  ],
});
```

## Plugin Order

Plugins run in the order they're registered:

- `onInit` — runs once, in registration order
- `beforeRequest` — runs in registration order before each request
- `afterRequest` — runs in registration order after each request
- `onError` — runs in registration order; the first plugin to return a `Response` wins

## Related

- [Storage](./storage) — The `StorageProvider` interface and S3 plugin
- [Email](./email) — Email transport plugins
- [Custom Endpoints](./custom-endpoints) — Adding routes
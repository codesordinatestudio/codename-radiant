# Custom Endpoints

The auto-generated CRUD routes cover most data operations, but you often need custom endpoints — webhooks, aggregations, health checks, or integration with external services. The `app.router` lets you add arbitrary HTTP routes alongside the generated ones.

## Adding Routes

Use `app.router.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, or `.all()` in `src/custom-routes.ts`:

```typescript
// src/custom-routes.ts
import { app, t } from "@codesordinatestudio/radiant-bun";

// Simple GET route
app.router.get("/greeting", () => {
  return { greeting: "hello from radiant" };
});

// Route with path params
app.router.get("/users/:id/profile", (ctx) => {
  return { userId: ctx.params.id };
});
```

## The Route Context

Each handler receives a `RadiantRouteContext`:

```typescript
interface RadiantRouteContext {
  request: Request;        // The raw HTTP request
  url: URL;                // Parsed URL (lazy)
  params: Record<string, string>; // Path params (e.g. :id)
  query: Record<string, string | string[]>; // Query string params
  body: unknown;           // Parsed body (when body schema is defined)
  user: AuthUser | null;   // Authenticated user
  radiant: RadiantRuntime; // Runtime instance
  state?: unknown;         // Plugin state
}
```

## Path Parameters

Use `:param` syntax in the path. Parameters are available in `ctx.params`:

```typescript
app.router.get("/users/:id", (ctx) => {
  return { id: ctx.params.id };
});

app.router.get("/posts/:slug/comments/:commentId", (ctx) => {
  return {
    slug: ctx.params.slug,
    commentId: ctx.params.commentId,
  };
});
```

## Query Parameters

Query string parameters are available in `ctx.query`:

```typescript
app.router.get("/search", (ctx) => {
  const q = ctx.query.q as string;
  const page = parseInt(ctx.query.page as string) || 1;
  return { query: q, page };
});
```

## Schema Validation

Use [TypeBox](https://github.com/sinclairzx/typebox) (exported as `t` from the runtime) to validate request bodies, query params, and responses. Invalid inputs are rejected with a `400` error before your handler runs:

```typescript
import { app, t } from "@codesordinatestudio/radiant-bun";

app.router.post(
  "/users/:id/transfer",
  (ctx) => {
    // ctx.body is typed and validated
    const { amount, toUserId } = ctx.body;
    // ctx.params.id is typed and validated
    return { transferred: amount, from: ctx.params.id, to: toUserId };
  },
  {
    body: t.Object({
      amount: t.Number({ minimum: 1 }),
      toUserId: t.String(),
    }),
    params: t.Object({
      id: t.String(),
    }),
    response: t.Object({
      transferred: t.Number(),
      from: t.String(),
      to: t.String(),
    }),
  }
);
```

### Schema Options

| Option | Description |
|---|---|
| `body` | TypeBox schema for the request body (JSON). Validates POST/PUT/PATCH bodies. |
| `query` | TypeBox schema for query string parameters. |
| `params` | TypeBox schema for path parameters. |
| `response` | TypeBox schema for the response body. |
| `detail` | OpenAPI metadata: `{ summary, description, tags }`. |
| `authRequired` | When `true`, rejects unauthenticated requests with `401`. |

## Returning Responses

Handlers can return plain objects (auto-converted to JSON), `Response` objects, or throw errors:

```typescript
// Return a plain object (200 OK, application/json)
app.router.get("/stats", () => {
  return { totalUsers: 42, activeSessions: 7 };
});

// Return a Response directly
app.router.get("/html", () => {
  return new Response("<h1>Hello</h1>", {
    headers: { "Content-Type": "text/html" },
  });
});

// Return with custom status
app.router.post("/webhooks/stripe", (ctx) => {
  // Process webhook...
  return new Response(JSON.stringify({ received: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
```

## Using the Runtime Inside Routes

Access the database and other runtime features via `ctx.radiant`:

```typescript
app.router.get("/dashboard/:userId", async (ctx) => {
  const userId = ctx.params.userId;

  const [todos, posts] = await Promise.all([
    ctx.radiant.find("todos", { where: { author: { eq: userId } }, limit: 10 }),
    ctx.radiant.find("posts", { where: { author: { eq: userId } }, limit: 5 }),
  ]);

  return {
    todos: todos.docs,
    posts: posts.docs,
    totalTodos: todos.totalDocs,
    totalPosts: posts.totalDocs,
  };
});
```

## Auth-Required Routes

Set `authRequired: true` to reject unauthenticated requests:

```typescript
app.router.get(
  "/admin/stats",
  (ctx) => {
    return { users: ctx.radiant.count("users") };
  },
  { authRequired: true }
);
```

## OpenAPI Documentation

Routes with `detail` and schema options are included in the auto-generated OpenAPI spec at `/api/docs`:

```typescript
app.router.get(
  "/health",
  () => ({ status: "ok", uptime: process.uptime() }),
  {
    response: t.Object({ status: t.String(), uptime: t.Number() }),
    detail: {
      summary: "Health check",
      description: "Returns server health status",
      tags: ["system"],
    },
  }
);
```

## Related

- [Local API](./local-api) — Querying data programmatically
- [Access Control](./access) — How access rules interact with custom routes
- [REST API](./rest-api) — The auto-generated CRUD endpoints
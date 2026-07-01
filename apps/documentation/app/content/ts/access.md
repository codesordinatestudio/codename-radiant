# Access Control

Access control lets you define who can read, create, update, or delete records in each collection. Rules are written in TypeScript in `src/access.ts` and evaluated per-request.

## Defining Rules

Use `app.access(collectionSlug, rules)` to register access rules for a collection:

```typescript
// src/access.ts
import { app } from "./app";

app.access("todos", {
  read: (ctx) => true,
  create: (ctx) => ctx.user !== null,
  update: (ctx) => ctx.user?.id === ctx.data.author || ctx.user?.role === "admin",
  delete: (ctx) => ctx.user?.role === "admin",
});
```

Each rule is a function that receives a `RadiantRequestContext` and returns `boolean` or `Promise<boolean>`. If the function returns `false`, the request is rejected with a `403 Forbidden` error.

## Rule Properties

| Rule | When it runs | Applies to |
|---|---|---|
| `read` | Before `GET /api/<slug>` and `GET /api/<slug>/:id` | List and single-record queries |
| `create` | Before `POST /api/<slug>` | Create operations |
| `update` | Before `PATCH /api/<slug>/:id` | Update operations |
| `delete` | Before `DELETE /api/<slug>/:id` | Delete operations |

## The Context Object

Every rule function receives a `RadiantRequestContext`:

```typescript
interface RadiantRequestContext {
  request: Request;       // The raw HTTP request
  user: AuthUser | null;  // The authenticated user (or null)
  radiant: RadiantRuntime; // The runtime instance
  state?: unknown;        // Optional state from plugins
}

interface AuthUser {
  id: string;
  role: string;
  [key: string]: any;     // All other fields from the user record
}
```

### Using `ctx.user`

The `user` object is populated from the JWT access token (when JWT auth is enabled). It contains all fields from the user's database record except `password`.

```typescript
app.access("posts", {
  read: (ctx) => true,
  create: (ctx) => ctx.user !== null,
  update: (ctx) => {
    // Only the author or an admin can update
    return ctx.user?.id === ctx.data.author || ctx.user?.role === "admin";
  },
});
```

### Async Rules

Rules can be async — useful for checking external permissions or querying the database:

```typescript
app.access("documents", {
  read: async (ctx) => {
    if (!ctx.user) return false;
    // Check if the user belongs to the organisation that owns the document
    const membership = await ctx.radiant.find("memberships", {
      where: {
        userId: { eq: ctx.user.id },
        orgId: { eq: ctx.data.orgId }
      },
      limit: 1
    });
    return membership.docs.length > 0;
  },
});
```

## Default Behaviour

If no access rules are registered for a collection, **all operations are allowed**. This is intentional — access control is opt-in per collection. Only register rules for collections that need protection.

## Multiple Collections

You can register rules for as many collections as needed:

```typescript
app.access("users", {
  read: (ctx) => true,
  create: (ctx) => ctx.user?.role === "admin",
  update: (ctx) => ctx.user?.id === ctx.data.id || ctx.user?.role === "admin",
  delete: (ctx) => ctx.user?.role === "admin",
});

app.access("todos", {
  read: () => true,
  create: () => true,
  update: (ctx) => ctx.user?.id === ctx.data.author,
  delete: (ctx) => ctx.user?.id === ctx.data.author,
});
```

## Globals

Globals support the same `app.access()` API. Use the global's slug as the collection name:

```typescript
app.access("siteSettings", {
  read: () => true,
  update: (ctx) => ctx.user?.role === "admin",
});
```

## Related

- [Hooks](./hooks) — Lifecycle hooks that run before/after CRUD operations
- [Local API](./local-api) — Querying data programmatically inside access rules
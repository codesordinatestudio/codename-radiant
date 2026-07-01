# Collections

A `collection` block defines a data model — a database table (in SQL databases) or a document collection (in document databases). Each collection automatically gets CRUD API endpoints.

## Syntax

```radiant
collection <name> {
  auth: true
  fields: {
    // field definitions
  }
  realtime: { ... }
  cache: { ... }
  hooks: { ... }
  admin: { ... }
}
```

The collection name must be a valid identifier (`[a-zA-Z_][a-zA-Z0-9_]*`) and must be unique across all `.radiant` files.

## Allowed Properties

| Property | Type | Description |
|---|---|---|
| `auth` | Boolean | Marks this collection as the authentication collection. Only one collection should have `auth: true`. |
| `fields` | Object | The field definitions for this collection. See [Field Types](./field-types). |
| `realtime` | Object | Realtime subscription settings (WebSocket, SSE, durable streams). |
| `cache` | Object | Caching settings (TTL, strategy). |
| `hooks` | Object | Lifecycle hook references. |
| `admin` | Object | Admin UI settings for this collection. |

## `auth`

When `auth: true`, the collection is treated as the user collection. The runtime enables login, registration, password reset, and token refresh endpoints for it. The runtime also hashes the `password` field automatically.

```radiant
collection users {
  auth: true
  fields: {
    name: text
    email: email @unique
    password: password
    role: text @default("user")
  }
}
```

## `fields`

The `fields` block contains field definitions as key-value pairs. Each key is the field name, and the value is the field type (an identifier or function call):

```radiant
collection todos {
  fields: {
    title: text
    completed: boolean @default(false)
    priority: select("low", "medium", "high")
    author: relationship("users")
    tags: text[]
    metadata: json @optional
  }
}
```

Every collection automatically gets an `id` field (UUID string), plus `createdAt` and `updatedAt` timestamp fields managed by the runtime.

See the [Field Types](./field-types) page for all available types and the [Decorators](./decorators) page for `@unique`, `@optional`, `@default`, etc.

## `realtime`

Realtime subscriptions push change events to connected clients in real time.

```radiant
collection todos {
  realtime: {
    ws: ["create", "update", "delete"]
    sse: true
    durableStream: false
  }
  fields: {
    // ...
  }
}
```

| Property | Type | Description |
|---|---|---|
| `ws` | String[] | Events to broadcast over WebSocket: `"create"`, `"update"`, `"delete"`. |
| `sse` | Boolean | Enable Server-Sent Events for this collection. |
| `durableStream` | Boolean | Enable a durable stream (persisted event log) for replay. |

## `cache`

Per-collection caching with configurable TTL and strategy:

```radiant
collection products {
  cache: {
    ttl: 3600
    strategy: "stale-while-revalidate"
  }
  fields: {
    // ...
  }
}
```

| Property | Type | Description |
|---|---|---|
| `ttl` | Number | Time-to-live in seconds. |
| `strategy` | String | Cache strategy: `"stale-while-revalidate"`, `"cache-first"`, `"network-first"`. |

## `hooks`

Lifecycle hooks run before or after CRUD operations. Hook handlers are written in TypeScript in `src/hooks.ts` (not in the DSL). The `hooks` property in the DSL is a reference/flag that the runtime uses to register them:

```radiant
collection todos {
  hooks: {
    beforeCreate: true
    afterCreate: true
    beforeUpdate: true
  }
  fields: {
    // ...
  }
}
```

The actual hook logic is defined in TypeScript:

```typescript
// src/hooks.ts
import { app } from "./app";

app.hooks("todos", {
  beforeCreate: async (ctx) => {
    if (!ctx.data.author) ctx.data.author = ctx.user?.id || "anonymous";
    return ctx.data;
  },
  afterCreate: async (ctx) => {
    console.log("Todo created:", ctx.data.id);
  },
});
```

## `admin`

Admin UI settings for this collection:

```radiant
collection products {
  admin: {
    list: ["name", "price", "status"]
    searchable: true
    pageSize: 25
  }
  fields: {
    // ...
  }
}
```

## Auto-Generated API Routes

Every collection gets these REST endpoints (mounted under the API prefix):

| Method | Path | Description |
|---|---|---|
| `GET` | `/<slug>` | List records with filtering, pagination, and sorting. |
| `POST` | `/<slug>` | Create a new record. |
| `GET` | `/<slug>/:id` | Get a single record by ID. |
| `PUT` | `/<slug>/:id` | Update a record by ID. |
| `DELETE` | `/<slug>/:id` | Delete a record by ID. |

For a collection named `todos` with API prefix `/api`:

```
GET    /api/todos
POST   /api/todos
GET    /api/todos/:id
PUT    /api/todos/:id
DELETE /api/todos/:id
```

## Cross-File References

Collections can reference each other across files. The compiler merges all `.radiant` files and validates relationship targets:

```radiant
// radiant/users.radiant
collection users {
  auth: true
  fields: {
    name: text
    email: email @unique
  }
}
```

```radiant
// radiant/posts.radiant
collection posts {
  fields: {
    title: text
    author: relationship("users")  // references the users collection
  }
}
```

If `relationship("users")` targets a collection that doesn't exist, the compiler produces a semantic error.
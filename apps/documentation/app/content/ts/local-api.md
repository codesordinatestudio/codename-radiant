# Local API

The Local API lets you query and mutate data programmatically from your TypeScript code — inside hooks, access rules, custom routes, cron jobs, or anywhere you have access to the `app` instance. These methods bypass HTTP and go straight to the database adapter.

## Methods

### `find(collection, query?)`

Query records with filtering, sorting, and pagination. Returns a paginated result.

```typescript
const result = await app.find("todos", {
  where: { completed: { eq: false } },
  sort: "-createdAt",
  limit: 10,
  page: 1,
});

// result.docs — array of records
// result.totalDocs — total matching records
// result.totalPages — total pages
// result.hasNextPage — boolean
// result.hasPrevPage — boolean
```

### `findById(collection, id, query?)`

Fetch a single record by ID. Returns `null` if not found.

```typescript
const todo = await app.findById("todos", "abc-123");
if (!todo) {
  console.log("Not found");
  return;
}
console.log(todo.title);
```

### `create(collection, data)`

Create a new record. Returns the created record (with `id`, `createdAt`, `updatedAt`).

```typescript
const todo = await app.create("todos", {
  title: "Buy groceries",
  completed: false,
  author: ctx.user.id,
});
```

### `update(collection, id, data)`

Update a record by ID. Returns the updated record.

```typescript
const updated = await app.update("todos", "abc-123", {
  completed: true,
});
```

### `delete(collection, id)`

Delete a record by ID.

```typescript
await app.delete("todos", "abc-123");
```

### `count(collection, query?)`

Count records matching a query.

```typescript
const total = await app.count("todos");
const completed = await app.count("todos", {
  where: { completed: { eq: true } },
});
```

## Query Structure

```typescript
interface QueryArgs {
  where?: WhereClause;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;  // Relationship populate depth
}
```

### Where Clauses

Each field in a `where` clause supports filter operators:

```typescript
await app.find("todos", {
  where: {
    title: { eq: "Buy groceries" },           // equals
    completed: { neq: true },                  // not equals
    priority: { in: ["high", "urgent"] },     // in array
    status: { nin: ["archived", "deleted"] }, // not in array
    createdAt: { gt: "2026-01-01" },          // greater than
    createdAt: { gte: "2026-01-01" },         // greater than or equal
    createdAt: { lt: "2026-12-31" },          // less than
    createdAt: { lte: "2026-12-31" },         // less than or equal
    title: { like: "%grocer%" },              // LIKE pattern
    title: { nlike: "%test%" },               // NOT LIKE
  },
});
```

### Combining with AND/OR

```typescript
await app.find("todos", {
  where: {
    OR: [
      { completed: { eq: false } },
      { priority: { eq: "urgent" } },
    ],
  },
});
```

### Sorting

Prefix with `-` for descending order:

```typescript
await app.find("todos", { sort: "-createdAt" });   // newest first
await app.find("todos", { sort: "priority" });      // ascending
await app.find("todos", { sort: "-priority,createdAt" }); // multiple fields
```

### Pagination

```typescript
await app.find("todos", { limit: 20, page: 1 });
```

### Relationship Populate (depth)

Use `depth` to populate relationship fields with the full referenced record:

```typescript
// depth: 0 (default) — author is just the ID string
const todos = await app.find("todos", { depth: 0 });
// todos.docs[0].author → "user-uuid-string"

// depth: 1 — author is populated with the full user object
const populated = await app.find("todos", { depth: 1 });
// populated.docs[0].author → { id: "user-uuid", name: "John", ... }
```

## Using Inside Hooks

```typescript
app.hooks("todos", {
  beforeCreate: async (ctx) => {
    // Check if the user already has a todo with the same title
    const existing = await ctx.radiant.find("todos", {
      where: {
        author: { eq: ctx.user!.id },
        title: { eq: ctx.data.title },
      },
      limit: 1,
    });
    if (existing.docs.length > 0) {
      throw new Error("You already have a todo with this title");
    }
    return ctx.data;
  },
});
```

## Using Inside Custom Routes

```typescript
app.router.get("/dashboard/:userId", async (ctx) => {
  const [todos, posts] = await Promise.all([
    ctx.radiant.find("todos", {
      where: { author: { eq: ctx.params.userId } },
      limit: 10,
    }),
    ctx.radiant.find("posts", {
      where: { author: { eq: ctx.params.userId } },
      limit: 5,
    }),
  ]);

  return {
    todos: todos.docs,
    posts: posts.docs,
  };
});
```

## Using Inside Access Rules

```typescript
app.access("documents", {
  read: async (ctx) => {
    if (!ctx.user) return false;
    const membership = await ctx.radiant.find("memberships", {
      where: {
        userId: { eq: ctx.user.id },
        orgId: { eq: ctx.data.orgId },
      },
      limit: 1,
    });
    return membership.docs.length > 0;
  },
});
```

## Audit Logging

When `security.audit.enabled` is `true` in your DSL, the Local API automatically logs all `create`, `update`, and `delete` operations to the `radiant_audit_log` collection with HMAC-signed entries.

## Related

- [REST API](./rest-api) — The auto-generated HTTP endpoints that mirror these methods
- [Hooks](./hooks) — Where you'll most commonly use the Local API
- [Access Control](./access) — Using the Local API inside access rules
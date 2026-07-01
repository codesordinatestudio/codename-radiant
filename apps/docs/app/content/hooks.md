# Hooks

Hooks are lifecycle functions that run before or after CRUD operations on a collection. They let you inject business logic — validating data, enriching records, triggering side effects — without modifying the generated routes.

## Registering Hooks

Use `app.hooks(collectionSlug, hooks)` in `src/hooks.ts`:

```typescript
// src/hooks.ts
import { app } from "./app";

app.hooks("todos", {
  beforeCreate: async (ctx) => {
    // Auto-assign the current user as author if not provided
    if (!ctx.data.author) ctx.data.author = ctx.user?.id || "anonymous";
    return ctx.data;
  },
  afterCreate: async (ctx) => {
    console.log(`Todo created: ${ctx.data.id}`);
  },
});
```

## Available Hooks

| Hook | When it runs | Can modify data? |
|---|---|---|
| `beforeCreate` | Before a record is inserted | Yes — return modified data |
| `afterCreate` | After a record is inserted | No (side effects only) |
| `beforeUpdate` | Before a record is updated | Yes — return modified data |
| `afterUpdate` | After a record is updated | No |
| `beforeDelete` | Before a record is deleted | No |
| `afterDelete` | After a record is deleted | No |

## The Hook Context

Each hook receives a `HookContext`:

```typescript
interface HookContext {
  request: Request;         // The raw HTTP request
  user: AuthUser | null;    // The authenticated user
  radiant: RadiantRuntime;  // The runtime instance
  collection: string;       // The collection slug
  data: any;                // The data being created/updated/deleted
}
```

## Before Hooks (Data Modification)

Before hooks can modify the data before it reaches the database. Return the modified data from the function:

```typescript
app.hooks("posts", {
  beforeCreate: async (ctx) => {
    // Generate a slug from the title
    ctx.data.slug = ctx.data.title.toLowerCase().replace(/\s+/g, "-");
    // Set the author
    ctx.data.author = ctx.user?.id;
    return ctx.data;
  },
  beforeUpdate: async (ctx) => {
    // Update the slug if the title changed
    if (ctx.data.title) {
      ctx.data.slug = ctx.data.title.toLowerCase().replace(/\s+/g, "-");
    }
    return ctx.data;
  },
});
```

If you don't return anything, the original data is used unchanged.

## After Hooks (Side Effects)

After hooks run after the database operation completes. Use them for side effects — sending emails, logging, cache invalidation, triggering webhooks:

```typescript
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

app.hooks("users", {
  afterCreate: async (ctx) => {
    // Send a welcome email
    await resend.emails.send({
      from: "welcome@myapp.com",
      to: ctx.data.email,
      subject: "Welcome!",
      html: `<h1>Hi ${ctx.data.name}</h1><p>Welcome aboard!</p>`,
    });
  },
  afterDelete: async (ctx) => {
    console.log(`User deleted: ${ctx.data.id}`);
    // Clean up related data
    await ctx.radiant.delete("sessions", ctx.data.id);
  },
});
```

## Throwing Errors

Any hook can throw an error to abort the operation. The error is returned to the client as an error response:

```typescript
app.hooks("todos", {
  beforeCreate: async (ctx) => {
    if (!ctx.data.title || ctx.data.title.trim().length === 0) {
      throw new Error("Title is required");
    }
    if (ctx.data.title.length > 200) {
      throw new Error("Title must be 200 characters or less");
    }
    return ctx.data;
  },
});
```

## Multiple Collections

Register hooks for as many collections as needed:

```typescript
app.hooks("users", {
  beforeCreate: async (ctx) => {
    // Normalise email
    ctx.data.email = ctx.data.email.toLowerCase().trim();
    return ctx.data;
  },
});

app.hooks("todos", {
  beforeCreate: async (ctx) => {
    if (!ctx.data.author) ctx.data.author = ctx.user?.id;
    return ctx.data;
  },
  afterUpdate: async (ctx) => {
    // Notify the author if the todo was completed
    if (ctx.data.completed) {
      // ... send notification
    }
  },
});
```

## Globals

Globals support hooks too. The `beforeUpdate` and `afterUpdate` hooks fire when the global document is saved:

```typescript
app.hooks("siteSettings", {
  beforeUpdate: async (ctx) => {
    // Log maintenance mode changes
    if (ctx.data.maintenanceMode) {
      console.log("Maintenance mode enabled");
    }
    return ctx.data;
  },
});
```

## Related

- [Access Control](./access) — Restricting who can perform CRUD operations
- [Local API](./local-api) — Querying data inside hooks
- [Custom Endpoints](./custom-endpoints) — Adding routes beyond the auto-generated CRUD
# Overview

Radiant is a **schema-first backend framework** that turns a declarative domain-specific language (`.radiant` files) into a fully functional API server. You describe your data model, security policies, and infrastructure settings in the Radiant DSL; the compiler validates and transforms them into a typed runtime, database schema, and CRUD API endpoints — no boilerplate required.

## How It Works

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  .radiant files │────▶│  Compiler     │────▶│  Generated Code   │
│  (your schema)  │     │  (lexer +     │     │  runtime.ts      │
│                  │     │   parser +    │     │  radiant-types.ts│
│                  │     │   validator)  │     │  schema.json     │
└─────────────────┘     └──────────────┘     └──────────────────┘
                                                      │
                                                      ▼
                                              ┌──────────────┐
                                              │  Bun Server  │
                                              │  CRUD API    │
                                              │  Auth, CORS   │
                                              │  Realtime     │
                                              └──────────────┘
```

1. **You write** `.radiant` files in the `radiant/` directory of your project.
2. **The CLI** (`radiant generate` or `radiant dev`) compiles those files into a schema, TypeScript types, and a runtime entry point.
3. **The runtime** boots a Bun server with auto-generated REST endpoints, authentication, rate limiting, realtime subscriptions, and more.

## Design Philosophy

- **Schema as source of truth.** Your `.radiant` files are the canonical definition. Everything else — TypeScript types, database DDL, API routes — is derived. You never edit generated files by hand.
- **No migration files.** Radiant syncs the database directly from the compiled schema using `radiant db:sync`. No versioned migration files to manage.
- **Configuration as code.** Security policies, rate limits, CORS, monitoring — all declared in the DSL, validated at compile time, and wired into the runtime automatically.
- **Type-safe by default.** The compiler generates TypeScript interfaces for every collection, create/update inputs, and query builders. You get autocompletion and compile-time checks in your hooks, access rules, and custom routes.

## What Radiant Gives You

| Feature | How |
|---|---|
| **CRUD API** | Every `collection` gets `GET`, `POST`, `PUT`, `DELETE` routes automatically. |
| **Authentication** | JWT, session, or API key strategies — declared in the DSL, enforced by the runtime. |
| **Access Control** | Per-collection read/create/update/delete rules written in TypeScript. |
| **Hooks** | `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete` — lifecycle hooks in TypeScript. |
| **Realtime** | WebSocket and Server-Sent Events subscriptions on collection changes. |
| **Caching** | Per-collection TTL and stale-while-revalidate strategies. |
| **Rate Limiting** | Configurable per-action (write, login) limits with time windows. |
| **OpenAPI Docs** | Auto-generated Swagger/OpenAPI spec at `/api/docs`. |
| **Admin UI** | Optional admin dashboard driven by your collection schema. |
| **Database Sync** | `radiant db:sync` diffs the compiled schema against your database and applies changes safely. |
| **Editor Support** | VS Code extension + LSP with diagnostics, autocompletion, and formatting. |

## Quick Example

Here is a complete Radiant project in two files:

```radiant
// radiant/config.radiant

config {
  core: {
    api: {
      prefix: "/api"
    }
  }

  security: {
    auth: {
      strategies: ["jwt"]
      jwt: {
        accessTokenExpiry: "15m"
        refreshTokenExpiry: "7d"
      }
    }
  }

  monitoring: {
    healthCheck: {
      enabled: true
      path: "/health"
    }
  }
}
```

```radiant
// radiant/collections.radiant

collection users {
  auth: true
  fields: {
    name: text
    email: email @unique
    password: password
    role: text @default("user")
  }
}

collection todos {
  fields: {
    title: text
    completed: boolean @default(false)
    author: relationship("users")
  }
}
```

Run `radiant generate` and you get:

- `radiant/runtime/schema.json` — the compiled schema
- `radiant/runtime/runtime.ts` — the runtime entry point
- `radiant-types.ts` — TypeScript types for all collections
- REST endpoints: `GET /api/todos`, `POST /api/todos`, `PUT /api/todos/:id`, `DELETE /api/todos/:id`, and the same for `users`
- JWT authentication wired into `users`
- A health check at `/health`
- OpenAPI docs at `/api/docs`

## Next Steps

- [DSL Syntax](./dsl-syntax) — Learn the full grammar and structure of `.radiant` files.
- [Config Block](./config-block) — Deep dive into the `config {}` block.
- [Collections](./collections) — Define your data models.
- [Field Types](./field-types) — All available field types.
- [CLI Reference](./cli-reference) — Every CLI command.
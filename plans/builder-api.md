# Radiant Builder API — Implementation Plan

> **Status:** Planning
> **Date:** 2026-06-30
> **Goal:** Expose Radiant's full project lifecycle (scaffold, collections, config, hooks, access, routes, cron, DB sync, build) as an HTTP API that any AI agent (Lovable, Bolt, Claude, OpenAI, Anthropic) can call to generate and manage a complete Radiant application.

---

## 1. Problem

Today Radiant's capabilities are locked behind CLI commands (`radiant init`, `radiant generate`, `radiant db:sync`, `radiant dev`) and manual TypeScript authoring (`hooks.ts`, `access.ts`, `custom-routes.ts`). An AI agent cannot drive Radiant programmatically — it would need to shell out to the CLI and edit files blind.

## 2. Solution

A standalone HTTP API server (`@codesordinatestudio/radiant-builder`) that wraps the existing CLI logic and code generation into 30 REST endpoints. Every endpoint maps to an existing CLI command, compiler function, or runtime feature — no new core capabilities are needed, just an HTTP layer.

**Architecture:**
```
┌──────────────────────────────────────────────────────┐
│  Agent (Lovable, Bolt, Claude, etc.)                │
│  Calls HTTP endpoints to scaffold & configure       │
└──────────────┬───────────────────────────────────────┘
               │ HTTP + Bearer token
               ▼
┌──────────────────────────────────────────────────────┐
│  radiant-builder (new package)                      │
│  Bun.serve on port 9100                              │
│  - Project registry (maps projectId → filesystem)   │
│  - DSL recompiler (reuses cli/compiler.ts)           │
│  - Code generators (writes hooks.ts, access.ts, etc) │
│  - Schema sync (reuses db-sync logic)                │
│  - Build runner (shells out to `bun build`)           │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  Existing Radiant packages                           │
│  - cli (compiler, scaffolds, generator, db-sync)     │
│  - runtime/bun (RadiantRuntime, adapters, etc.)      │
│  - plugins/ts (sqlite, postgres, mongodb, etc.)      │
└──────────────────────────────────────────────────────┘
```

**Package placement:** `packages/builder` (workspace package, same level as `cli`).

---

## 3. Key Design Decisions

### 3.1 DSL as source of truth
Collection/config endpoints modify `config.radiant` (and sibling `.radiant` files), then recompile via the existing `compile()` function from `packages/cli/src/compiler.ts`. The generated TypeScript (`runtime.ts`, `radiant-types.ts`) is always derived — never edited directly by the API.

### 3.2 Code generation for TypeScript files
Hooks, access rules, custom routes, and cron jobs are TypeScript functions. The API accepts them as source code strings and writes them into the appropriate files (`src/hooks.ts`, `src/access.ts`, `src/custom-routes.ts`, `src/cron.ts`). Each write triggers a recompile.

### 3.3 Atomic operations
Every write recompiles and validates. If compilation fails (semantic error, invalid field type, broken relationship), the change is rejected and the original DSL is restored. The error is returned in the response.

### 3.4 Project registry
A simple JSON file (`~/.radiant/projects.json`) maps `projectId` → absolute filesystem path. No database needed. The builder server is stateless aside from this registry.

### 3.5 Auth
Single bearer token via `RADIANT_BUILDER_KEY` env var. No multi-tenant auth — this is a local/CI tool, not a SaaS product.

### 3.6 Handler code as strings
Hooks, access rules, routes, and cron handlers are accepted as TypeScript source strings. The API does not eval them — it writes them into files and lets the compiler validate. This matches how these files work today (they're just `.ts` files imported by `index.ts`).

---

## 4. Endpoint Reference (30 endpoints)

Base URL: `http://localhost:9100/api/builder`
Auth: `Authorization: Bearer <RADIANT_BUILDER_KEY>`

### 4.1 Projects

#### 4.1.1 `POST /projects` — Scaffold a new project

Creates a new Radiant project with config, adapter, and directory structure. Equivalent to `radiant init` + `radiant generate`.

**Request:**
```json
{
  "name": "my-saas-app",
  "targetDir": "/home/user/projects/my-saas-app",
  "template": "blank",
  "database": {
    "type": "sqlite",
    "url": "radiant.sqlite"
  },
  "config": {
    "apiPrefix": "/api",
    "auth": { "strategies": ["jwt"] },
    "rateLimit": {
      "write": { "max": 100, "window": "15m" },
      "login": { "max": 5, "window": "15m" }
    },
    "monitoring": {
      "healthCheck": { "enabled": true, "path": "/health" }
    }
  }
}
```

**Response (201):**
```json
{
  "projectId": "my-saas-app",
  "path": "/home/user/projects/my-saas-app",
  "files": [
    "radiant/config.radiant",
    "src/app.ts",
    "src/index.ts",
    "src/access.ts",
    "src/custom-routes.ts",
    ".env"
  ],
  "status": "scaffolded"
}
```

**Implementation:** Reuses `scaffoldTsProject()` from `packages/cli/src/scaffolds/bun.ts`. The `config` object is converted to Radiant DSL syntax and written to `config.radiant`. Then `generateCompilerOutput()` is called to compile and generate `runtime.ts` + `radiant-types.ts`.

#### 4.1.2 `GET /projects/:projectId` — Get project status

Returns the current state of a project — schema summary, files, and health.

**Response (200):**
```json
{
  "projectId": "my-saas-app",
  "path": "/home/user/projects/my-saas-app",
  "status": "ready",
  "schema": {
    "collections": ["users", "todos"],
    "globals": [],
    "config": { "apiPrefix": "/api", "auth": { "strategies": ["jwt"] } }
  },
  "files": [
    { "path": "radiant/config.radiant", "modified": "2026-06-30T12:00:00Z" },
    { "path": "src/app.ts", "modified": "2026-06-30T12:00:00Z" },
    { "path": "src/access.ts", "modified": "2026-06-30T12:00:00Z" }
  ],
  "database": { "type": "sqlite", "synced": true }
}
```

**Implementation:** Reads `schema.json` from the project's `radiant/runtime/` directory. Lists files via `fs.readdirSync`. Status is `"ready"` if `schema.json` exists and compiles, `"needs-sync"` if schema has changed since last `db:sync`, `"needs-build"` if no `dist/` exists.

---

### 4.2 Collections

#### 4.2.1 `POST /projects/:projectId/collections` — Add a collection

Adds a new collection to the Radiant DSL and recompiles.

**Request:**
```json
{
  "slug": "todos",
  "auth": false,
  "fields": [
    { "name": "title", "type": "text" },
    { "name": "completed", "type": "boolean", "default": false },
    { "name": "priority", "type": "select", "options": ["low", "medium", "high"] },
    { "name": "author", "type": "relationship", "target": "users" },
    { "name": "tags", "type": "array", "items": "text" }
  ],
  "cache": { "ttl": 3600, "strategy": "stale-while-revalidate" },
  "realtime": {
    "ws": ["create", "update", "delete"],
    "sse": false,
    "durableStream": false
  }
}
```

**Response (201):**
```json
{
  "collection": "todos",
  "fields": [
    { "name": "title", "type": "text" },
    { "name": "completed", "type": "boolean", "default": false },
    { "name": "priority", "type": "select", "options": ["low", "medium", "high"] },
    { "name": "author", "type": "relationship", "target": "users" },
    { "name": "tags", "type": "array", "items": "text" }
  ],
  "routesGenerated": [
    "GET /api/todos",
    "POST /api/todos",
    "GET /api/todos/:id",
    "PUT /api/todos/:id",
    "DELETE /api/todos/:id"
  ],
  "dslFragment": "collection todos {\n  fields: {\n    title: text,\n    completed: boolean @default(false),\n    ...\n  };\n}",
  "status": "compiled"
}
```

**Implementation:** Converts the JSON field definitions to Radiant DSL syntax (e.g. `{ name: "completed", type: "boolean", default: false }` → `completed: boolean @default(false)`). Appends the `collection` block to the appropriate `.radiant` file (creates `radiant/collections.radiant` if it doesn't exist). Calls `compile()` to validate. On error, restores the original file content and returns the error.

**DSL mapping rules:**
| JSON field | DSL output |
|---|---|
| `{ name: "title", type: "text" }` | `title: text` |
| `{ name: "email", type: "email", unique: true }` | `email: email @unique` |
| `{ name: "role", type: "enum", values: ["admin", "user"], default: "user" }` | `role: ["admin", "user"] @default("user")` |
| `{ name: "author", type: "relationship", target: "users" }` | `author: relationship("users")` |
| `{ name: "priority", type: "select", options: ["low", "medium", "high"] }` | `priority: select("low", "medium", "high")` |
| `{ name: "bio", type: "text", optional: true }` | `bio: text @optional` |
| `{ name: "tags", type: "array", items: "text" }` | `tags: array(text)` |

#### 4.2.2 `PUT /projects/:projectId/collections/:slug` — Update a collection

Updates fields, cache, realtime, or auth settings on an existing collection.

**Request:**
```json
{
  "addFields": [
    { "name": "dueDate", "type": "date", "optional": true }
  ],
  "removeFields": ["tags"],
  "updateCache": { "ttl": 7200 },
  "updateRealtime": { "ws": true, "sse": true }
}
```

**Response (200):**
```json
{
  "collection": "todos",
  "addedFields": ["dueDate"],
  "removedFields": ["tags"],
  "dslUpdated": true,
  "schemaSyncRequired": true,
  "status": "compiled"
}
```

**Implementation:** Parses the existing DSL for the collection, applies the diff (add/remove fields, update cache/realtime), writes back the modified DSL, and recompiles. The `schemaSyncRequired` flag is set when fields are added/removed — the agent should call `POST /db/sync` afterward.

#### 4.2.3 `DELETE /projects/:projectId/collections/:slug` — Delete a collection

Removes a collection from the DSL and recompiles. Does not drop the DB table unless `dropTable: true`.

**Request:**
```json
{
  "dropTable": false
}
```

**Response (200):**
```json
{
  "collection": "todos",
  "removed": true,
  "tableDropped": false,
  "status": "compiled"
}
```

**Implementation:** Removes the `collection` block from the `.radiant` file, recompiles. If `dropTable: true`, runs `DROP TABLE` via the adapter after schema diff.

---

### 4.3 Configuration

#### 4.3.1 `PUT /projects/:projectId/config/security` — Configure security

Updates the security block: auth strategies, JWT settings, CORS, rate limiting, headers, password policy, lockout.

**Request:**
```json
{
  "auth": {
    "strategies": ["jwt"],
    "jwt": {
      "accessTokenExpiry": "15m",
      "refreshTokenExpiry": "7d",
      "cookies": { "enabled": true }
    },
    "passwordPolicy": {
      "minLength": 8,
      "requireUppercase": true,
      "requireNumber": true
    },
    "lockout": {
      "maxAttempts": 5,
      "durationMinutes": 15
    }
  },
  "cors": {
    "origin": ["https://myapp.com"],
    "credentials": true
  },
  "rateLimit": {
    "write": { "max": 100, "window": "15m" },
    "login": { "max": 5, "window": "15m" }
  },
  "headers": { "enabled": true },
  "secrets": { "enabled": true },
  "audit": { "enabled": false }
}
```

**Response (200):**
```json
{
  "updated": ["auth", "cors", "rateLimit", "headers"],
  "dslFragment": "security: { auth: { ... }, cors: { ... }, ... }",
  "status": "compiled"
}
```

**Implementation:** Converts the JSON to DSL `security: { ... }` block. Replaces the existing security block in `config.radiant`. Recompiles. The allowed keys are validated against `ALLOWED_SECURITY` from `compiler.ts`:
- `auth`, `cors`, `rateLimit`, `headers`, `secrets`, `audit`

And within `auth`, against `ALLOWED_AUTH`:
- `strategies`, `jwt`, `session`, `apiKey`, `passwordPolicy`, `lockout`

#### 4.3.2 `PUT /projects/:projectId/config/monitoring` — Configure monitoring

**Request:**
```json
{
  "healthCheck": { "enabled": true, "path": "/health", "requiresAuth": false },
  "requestId": { "enabled": true }
}
```

**Response (200):**
```json
{
  "updated": ["healthCheck", "requestId"],
  "status": "compiled"
}
```

**Implementation:** Same DSL replacement pattern as security. Allowed keys: `healthCheck`, `requestId`, `apiKey`, `enabled` (from `ALLOWED_MONITORING`).

#### 4.3.3 `PUT /projects/:projectId/config/email` — Configure email

**Request:**
```json
{
  "from": "no-reply@myapp.com",
  "appName": "My SaaS",
  "resetTokenExpiryMinutes": 30,
  "resetPasswordUrl": "https://myapp.com/reset-password",
  "verifyEmailUrl": "https://myapp.com/verify-email",
  "transport": {
    "type": "smtp",
    "host": "smtp.mailgun.org",
    "port": 587,
    "user": "postmaster@myapp.com",
    "pass": "env:SMTP_PASS"
  }
}
```

**Response (200):**
```json
{
  "updated": true,
  "status": "compiled"
}
```

**Implementation:** Adds an `email: { ... }` block to the config DSL. The `transport` object is converted to the plugin registration in `src/app.ts` (e.g. `nodemailerEmail({ host, port, auth: { user, pass } })`). The `pass: "env:SMTP_PASS"` pattern writes `process.env.SMTP_PASS` in the generated code and adds `SMTP_PASS=` to `.env`.

---

### 4.4 Hooks

#### 4.4.1 `POST /projects/:projectId/collections/:slug/hooks` — Add hooks

Registers before/after hooks for a collection. Generates TypeScript code in `src/hooks.ts` and recompiles.

**Request:**
```json
{
  "hooks": {
    "beforeCreate": "async (ctx) => { if (!ctx.data.author) ctx.data.author = ctx.user?.id || 'anonymous'; return ctx.data; }",
    "afterCreate": "async (ctx) => { console.log('Todo created:', ctx.data.id); }",
    "beforeUpdate": "async (ctx) => { ctx.data.updatedAt = new Date().toISOString(); return ctx.data; }"
  }
}
```

**Response (201):**
```json
{
  "collection": "todos",
  "hooks": ["beforeCreate", "afterCreate", "beforeUpdate"],
  "fileUpdated": "src/hooks.ts",
  "status": "compiled"
}
```

**Implementation:** Reads `src/hooks.ts`, finds the `app.hooks("todos", { ... })` call (or creates one), inserts/replaces the specified hook functions within the object. The handler code is inserted verbatim as the function body. Writes the file. The project's own `tsc` / `bun build` step validates the TypeScript at build time.

**Generated code example:**
```typescript
import { app } from "./app";

app.hooks("todos", {
  beforeCreate: async (ctx) => {
    if (!ctx.data.author) ctx.data.author = ctx.user?.id || "anonymous";
    return ctx.data;
  },
  afterCreate: async (ctx) => {
    console.log("Todo created:", ctx.data.id);
  },
  beforeUpdate: async (ctx) => {
    ctx.data.updatedAt = new Date().toISOString();
    return ctx.data;
  },
});
```

#### 4.4.2 `PUT /projects/:projectId/collections/:slug/hooks` — Update hooks

Replaces specific hooks without touching others.

**Request:**
```json
{
  "hooks": {
    "beforeCreate": "async (ctx) => { ctx.data.status = 'active'; return ctx.data; }"
  }
}
```

**Response (200):**
```json
{
  "collection": "todos",
  "updated": ["beforeCreate"],
  "fileUpdated": "src/hooks.ts",
  "status": "compiled"
}
```

#### 4.4.3 `DELETE /projects/:projectId/collections/:slug/hooks/:hookName` — Remove a hook

**Response (200):**
```json
{
  "collection": "todos",
  "removed": "afterCreate",
  "fileUpdated": "src/hooks.ts",
  "status": "compiled"
}
```

**Implementation:** Removes the named hook from the `app.hooks("todos", { ... })` object. If the object becomes empty, removes the entire `app.hooks()` call.

---

### 4.5 Access Control

#### 4.5.1 `POST /projects/:projectId/collections/:slug/access` — Set access control rules

Generates/updates access rules for a collection in `src/access.ts`.

**Request:**
```json
{
  "rules": {
    "read": "(ctx) => true",
    "create": "(ctx) => ctx.user?.role === 'admin'",
    "update": "(ctx) => ctx.user?.id === ctx.data.author || ctx.user?.role === 'admin'",
    "delete": "(ctx) => ctx.user?.role === 'admin'"
  }
}
```

**Response (200):**
```json
{
  "collection": "todos",
  "rules": ["read", "create", "update", "delete"],
  "fileUpdated": "src/access.ts",
  "status": "compiled"
}
```

**Implementation:** Similar to hooks — reads `src/access.ts`, finds or creates the `app.access("todos", { ... })` call, replaces the rules object with the new rules. The rule code is inserted verbatim.

**Generated code example:**
```typescript
import { app } from "./app";

app.access("todos", {
  read: (ctx) => true,
  create: (ctx) => ctx.user?.role === "admin",
  update: (ctx) => ctx.user?.id === ctx.data.author || ctx.user?.role === "admin",
  delete: (ctx) => ctx.user?.role === "admin",
});
```

---

### 4.6 Custom Routes

#### 4.6.1 `POST /projects/:projectId/routes` — Add a custom route

**Request:**
```json
{
  "method": "POST",
  "path": "/stats/summary",
  "handler": "async (ctx) => { const total = await app.adapter.count('todos'); return { total }; }",
  "options": {
    "body": {
      "type": "object",
      "properties": {
        "startDate": { "type": "string", "format": "date" }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "total": { "type": "number" }
      }
    },
    "detail": {
      "summary": "Get todo stats summary",
      "tags": ["stats"]
    },
    "authRequired": true
  }
}
```

**Response (201):**
```json
{
  "route": "POST /stats/summary",
  "fileUpdated": "src/custom-routes.ts",
  "status": "compiled"
}
```

**Implementation:** Appends a new `app.router.post("/stats/summary", handler, options)` call to `src/custom-routes.ts`. The `options.body` and `options.response` are converted to TypeBox schema calls (e.g. `t.Object({ startDate: t.String() })`).

**JSON Schema → TypeBox mapping:**
| JSON Schema | TypeBox |
|---|---|
| `{ type: "string" }` | `t.String()` |
| `{ type: "number" }` | `t.Number()` |
| `{ type: "boolean" }` | `t.Boolean()` |
| `{ type: "object", properties: { ... } }` | `t.Object({ ... })` |
| `{ type: "array", items: { type: "string" } }` | `t.Array(t.String())` |
| `{ format: "date" }` | `t.String({ format: "date" })` |

#### 4.6.2 `DELETE /projects/:projectId/routes` — Remove a custom route

**Request:**
```json
{
  "method": "POST",
  "path": "/stats/summary"
}
```

**Response (200):**
```json
{
  "removed": "POST /stats/summary",
  "fileUpdated": "src/custom-routes.ts",
  "status": "compiled"
}
```

**Implementation:** Parses `src/custom-routes.ts` to find the matching `app.router.<method>("<path>", ...)` call and removes it. Uses a simple regex or AST parse (Bun has `bun:ast` or we can use a TypeScript AST parser).

---

### 4.7 Cron Jobs

#### 4.7.1 `POST /projects/:projectId/cron` — Schedule a cron job

**Request:**
```json
{
  "name": "cleanup-expired-todos",
  "schedule": "0 * * * *",
  "handler": "async (app) => { const expired = await app.adapter.find('todos', { where: { dueDate: { lt: new Date().toISOString() } } }); for (const t of expired.docs) await app.adapter.delete('todos', t.id); }"
}
```

**Response (201):**
```json
{
  "job": "cleanup-expired-todos",
  "schedule": "0 * * * *",
  "fileUpdated": "src/cron.ts",
  "status": "compiled"
}
```

**Implementation:** Creates `src/cron.ts` if it doesn't exist. Adds an import of `app` and a `app.cronManager.schedule(name, schedule, handler, app)` call. Also adds `import "./cron"` to `src/index.ts` so the cron jobs are registered on startup.

#### 4.7.2 `DELETE /projects/:projectId/cron/:name` — Remove a cron job

**Response (200):**
```json
{
  "removed": "cleanup-expired-todos",
  "status": "compiled"
}
```

**Implementation:** Removes the matching `schedule()` call from `src/cron.ts`.

---

### 4.8 Database Sync

#### 4.8.1 `POST /projects/:projectId/db/sync` — Sync database schema

Runs schema diff and applies changes. Equivalent to `radiant db:sync`.

**Request:**
```json
{
  "force": false
}
```

**Response (200):**
```json
{
  "toCreate": [{ "table": "todos" }],
  "toAdd": [{ "table": "users", "column": "avatar" }],
  "toDropTable": [],
  "toDropColumn": [],
  "applied": true,
  "status": "synced"
}
```

**Implementation:** Reuses the exact logic from `packages/cli/src/db-sync.ts` — `createAdapterFromUrl()`, `computeSchemaDiff()`, `applyChanges()`. Loads `DATABASE_URL` from the project's `.env`. Creates the adapter via plugin resolution. Runs the diff and applies changes.

#### 4.8.2 `POST /projects/:projectId/db/sync/preview` — Preview schema diff

Shows what would change without applying anything.

**Response (200):**
```json
{
  "toCreate": [{ "table": "todos", "columns": ["id", "title", "completed", "author"] }],
  "toAdd": [{ "table": "users", "column": "avatar", "type": "text" }],
  "toDropTable": [{ "table": "old_collection" }],
  "toDropColumn": [{ "table": "users", "column": "legacy_field" }],
  "destructiveChangesPending": true,
  "forceRequired": true
}
```

**Implementation:** Same as `db/sync` but calls `computeSchemaDiff()` only — does not call `applyChanges()`.

---

### 4.9 Build & Validate

#### 4.9.1 `POST /projects/:projectId/build` — Build the project

**Request:**
```json
{
  "target": "bun"
}
```

**Response (200):**
```json
{
  "target": "bun",
  "output": "dist/index.js",
  "size": "245KB",
  "duration": "1.2s",
  "status": "built"
}
```

**Implementation:** Shells out to `bun build src/index.ts --outdir dist --target bun` (or `--target node` / `--target vercel` in the future) in the project directory. Returns stdout/stderr and exit code.

#### 4.9.2 `POST /projects/:projectId/validate` — Validate schema

Compiles the DSL and returns errors/warnings without writing files.

**Response (200):**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    { "message": "Collection 'todos' has no access rules defined. All operations will be public.", "collection": "todos" }
  ],
  "collections": ["users", "todos"],
  "routes": [
    "GET /api/users", "POST /api/users/login", "POST /api/users/register",
    "GET /api/todos", "POST /api/todos", "GET /api/todos/:id", "PUT /api/todos/:id", "DELETE /api/todos/:id"
  ]
}
```

**On error (200 with valid: false):**
```json
{
  "valid": false,
  "errors": [
    { "message": "Collection 'todos' relates to non-existent collection 'authors'.", "line": 15, "file": "radiant/collections.radiant" }
  ]
}
```

**Implementation:** Calls `compile()` from `packages/cli/src/compiler.ts` with the raw ASTs from the `.radiant` files. Returns `SemanticError[]` if any. Also generates the list of routes that would be created by the runtime (by inspecting the schema and applying the route generation logic from `runtime.ts:buildRoutes()`).

---

### 4.10 Introspection

#### 4.10.1 `GET /projects/:projectId/schema` — Get compiled schema

Returns the full compiled `schema.json`.

**Response (200):**
```json
{
  "collections": [
    {
      "slug": "users",
      "auth": true,
      "fields": [
        { "name": "name", "type": "text" },
        { "name": "email", "type": "email", "unique": true },
        { "name": "password", "type": "password" },
        { "name": "role", "type": "enum", "values": ["admin", "user"], "default": "user" }
      ]
    },
    {
      "slug": "todos",
      "fields": [
        { "name": "title", "type": "text" },
        { "name": "completed", "type": "boolean", "default": false },
        { "name": "author", "type": "relationship", "target": "users" }
      ],
      "cache": { "ttl": 3600 },
      "realtime": { "ws": ["create", "update", "delete"] }
    }
  ],
  "core": { "api": { "prefix": "/api" } },
  "security": { "auth": { "strategies": ["jwt"] } }
}
```

**Implementation:** Reads and returns `radiant/runtime/schema.json` directly.

#### 4.10.2 `GET /projects/:projectId/openapi` — Get OpenAPI spec

Returns the generated OpenAPI 3.1 spec.

**Implementation:** Calls `generateOpenAPISpec()` from `runtime/bun/src/core/openapi.ts` with the compiled schema. This is the same function called by the runtime's `/api/docs/openapi.json` route.

#### 4.10.3 `GET /projects/:projectId/files` — List project files

**Response (200):**
```json
{
  "files": [
    {
      "path": "radiant/config.radiant",
      "content": "config { ... }\ncollection users { ... }"
    },
    {
      "path": "src/app.ts",
      "content": "import { createRadiant } from \"./radiant/runtime\";\n..."
    },
    {
      "path": "src/access.ts",
      "content": "import { app } from \"./app\";\napp.access(\"users\", { ... });"
    },
    {
      "path": "src/hooks.ts",
      "content": "import { app } from \"./app\";\napp.hooks(\"todos\", { ... });"
    },
    {
      "path": "src/custom-routes.ts",
      "content": "import { app } from \"./app\";\napp.router.get(\"/custom\", ...);"
    }
  ]
}
```

**Implementation:** Recursively reads the project directory, excluding `node_modules/`, `dist/`, `.bin/`, `radiant/runtime/` (generated files). Returns file contents.

#### 4.10.4 `GET /projects/:projectId/files/:path` — Read a specific file

**Response (200):**
```json
{
  "path": "src/access.ts",
  "content": "import { app } from \"./app\";\n\napp.access(\"users\", {\n  read: (ctx) => true,\n  create: (ctx) => ctx.user?.role === \"admin\",\n});\n",
  "modified": "2026-06-30T12:00:00Z"
}
```

**Implementation:** `readFileSync` on the resolved path. Path traversal protection — rejects paths containing `..`.

#### 4.10.5 `PUT /projects/:projectId/files/:path` — Write/update a file

**Request:**
```json
{
  "content": "import { app } from \"./app\";\n\napp.access(\"todos\", {\n  read: () => true,\n  create: (ctx) => !!ctx.user,\n});\n"
}
```

**Response (200):**
```json
{
  "path": "src/access.ts",
  "written": true,
  "status": "written"
}
```

**Implementation:** `writeFileSync` on the resolved path. For when the agent wants full control and doesn't want to use the structured endpoints.

---

### 4.11 Plugins & Queue

#### 4.11.1 `POST /projects/:projectId/plugins` — Add a plugin

**Request:**
```json
{
  "package": "@codesordinatestudio/radiant-plugin-redis-db",
  "config": {
    "url": "redis://localhost:6379"
  }
}
```

**Response (201):**
```json
{
  "plugin": "redis-db",
  "installed": true,
  "registered": true,
  "fileUpdated": "src/app.ts",
  "status": "compiled"
}
```

**Implementation:** Runs `bun add <package>` in the project directory. Updates `src/app.ts` to add the import and pass the plugin config to `createRadiant()`. Recompiles.

#### 4.11.2 `DELETE /projects/:projectId/plugins/:name` — Remove a plugin

**Response (200):**
```json
{
  "plugin": "redis-db",
  "removed": true,
  "fileUpdated": "src/app.ts",
  "status": "compiled"
}
```

**Implementation:** Runs `bun remove <package>`. Removes the import and config from `src/app.ts`. Recompiles.

#### 4.11.3 `POST /projects/:projectId/queue` — Configure queue system

**Request:**
```json
{
  "connection": {
    "host": "localhost",
    "port": 6379
  },
  "prefix": "myapp",
  "defaultQueueOptions": {
    "defaultJobOptions": {
      "removeOnComplete": true,
      "removeOnFail": 100
    }
  }
}
```

**Response (200):**
```json
{
  "queueConfigured": true,
  "fileUpdated": "src/app.ts",
  "status": "compiled"
}
```

**Implementation:** Adds `RadiantQueueManager.initialize({ bullmq: { connection, prefix, ... } })` to `src/app.ts` or a new `src/queue.ts` file. Adds `import "./queue"` to `src/index.ts`.

---

### 4.12 Discovery

#### 4.12.1 `GET /templates` — List available templates

**Response (200):**
```json
{
  "templates": [
    {
      "key": "blank",
      "label": "Blank Project",
      "hint": "A clean slate with a basic schema",
      "collections": ["users"],
      "features": ["auth", "jwt", "healthCheck"]
    }
  ]
}
```

**Implementation:** Reads from `packages/cli/src/templates/index.ts` — the existing template registry.

#### 4.12.2 `GET /field-types` — List available field types

**Response (200):**
```json
{
  "types": [
    { "name": "text", "decorators": ["unique", "optional", "default"] },
    { "name": "email", "decorators": ["unique", "optional"] },
    { "name": "password", "decorators": [] },
    { "name": "number", "decorators": ["optional", "default"] },
    { "name": "integer", "decorators": ["optional", "default"] },
    { "name": "boolean", "decorators": ["optional", "default"] },
    { "name": "date", "decorators": ["optional", "default"] },
    { "name": "relationship", "args": ["target collection"], "decorators": ["optional"] },
    { "name": "select", "args": ["option1", "option2", "..."], "decorators": ["default"] },
    { "name": "enum", "format": "[\"value1\", \"value2\"]", "decorators": ["default"] },
    { "name": "array", "args": ["item type"], "decorators": ["optional"] },
    { "name": "json", "decorators": ["optional"] },
    { "name": "upload", "decorators": ["optional"] },
    { "name": "richtext", "decorators": ["optional"] },
    { "name": "textarea", "decorators": ["optional"] },
    { "name": "multiselect", "args": ["option1", "option2"], "decorators": [] }
  ],
  "decorators": [
    { "name": "unique", "description": "Enforces uniqueness at the DB level" },
    { "name": "optional", "description": "Field is not required" },
    { "name": "default", "args": ["value"], "description": "Sets default value on create" }
  ]
}
```

**Implementation:** Returns the `ALLOWED_FIELD_TYPES` set from `compiler.ts` with metadata about decorators. Static data — no project context needed.

---

## 5. Summary Table

| # | Endpoint | Method | What it does | Reuses |
|---|----------|--------|-------------|--------|
| 1 | `/projects` | POST | Scaffold a new project | `scaffoldTsProject()` |
| 2 | `/projects/:id` | GET | Get project status | `readFileSync`, `schema.json` |
| 3 | `/projects/:id/collections` | POST | Add a collection | `compile()` |
| 4 | `/projects/:id/collections/:slug` | PUT | Update a collection | `compile()` |
| 5 | `/projects/:id/collections/:slug` | DELETE | Delete a collection | `compile()` |
| 6 | `/projects/:id/config/security` | PUT | Configure security, rate limiting, CORS | `compile()` |
| 7 | `/projects/:id/config/monitoring` | PUT | Configure monitoring/health check | `compile()` |
| 8 | `/projects/:id/config/email` | PUT | Configure email transport | `compile()` |
| 9 | `/projects/:id/collections/:slug/hooks` | POST | Add hooks | code gen → `hooks.ts` |
| 10 | `/projects/:id/collections/:slug/hooks` | PUT | Update hooks | code gen → `hooks.ts` |
| 11 | `/projects/:id/collections/:slug/hooks/:name` | DELETE | Remove a hook | code gen → `hooks.ts` |
| 12 | `/projects/:id/collections/:slug/access` | POST | Set access control rules | code gen → `access.ts` |
| 13 | `/projects/:id/routes` | POST | Add a custom route | code gen → `custom-routes.ts` |
| 14 | `/projects/:id/routes` | DELETE | Remove a custom route | code gen → `custom-routes.ts` |
| 15 | `/projects/:id/cron` | POST | Schedule a cron job | code gen → `cron.ts` |
| 16 | `/projects/:id/cron/:name` | DELETE | Remove a cron job | code gen → `cron.ts` |
| 17 | `/projects/:id/db/sync` | POST | Sync database schema | `db-sync.ts` logic |
| 18 | `/projects/:id/db/sync/preview` | POST | Preview schema diff | `computeSchemaDiff()` |
| 19 | `/projects/:id/build` | POST | Build the project | `bun build` shell |
| 20 | `/projects/:id/validate` | POST | Validate schema (dry run) | `compile()` |
| 21 | `/projects/:id/schema` | GET | Get compiled schema JSON | `schema.json` |
| 22 | `/projects/:id/openapi` | GET | Get OpenAPI spec | `generateOpenAPISpec()` |
| 23 | `/projects/:id/files` | GET | List all project files | `readdirSync` |
| 24 | `/projects/:id/files/:path` | GET | Read a file | `readFileSync` |
| 25 | `/projects/:id/files/:path` | PUT | Write/update a file | `writeFileSync` |
| 26 | `/projects/:id/plugins` | POST | Add a plugin | `bun add` + code gen |
| 27 | `/projects/:id/plugins/:name` | DELETE | Remove a plugin | `bun remove` + code gen |
| 28 | `/projects/:id/queue` | POST | Configure queue system | code gen → `queue.ts` |
| 29 | `/templates` | GET | List available templates | `templates/index.ts` |
| 30 | `/field-types` | GET | List field types + decorators | `ALLOWED_FIELD_TYPES` |

---

## 6. Implementation Plan

### Phase 1: Core infrastructure (packages/builder)

**Deliverable:** A new `packages/builder` package that starts an HTTP server and serves the API.

1. **`packages/builder/package.json`** — new workspace package
   ```json
   {
     "name": "@codesordinatestudio/radiant-builder",
     "scripts": {
       "dev": "bun run src/index.ts",
       "build": "bun build src/index.ts --outdir dist --target bun"
     },
     "dependencies": {
       "@codesordinatestudio/radiant-bun": "workspace:*",
       "@radiant/cli": "workspace:*"
     }
   }
   ```

2. **`packages/builder/src/index.ts`** — server entry point
   - `Bun.serve()` on port 9100 (configurable via `RADIANT_BUILDER_PORT`)
   - Bearer token auth middleware
   - Route dispatch to handlers

3. **`packages/builder/src/registry.ts`** — project registry
   - `~/.radiant/projects.json` maps `projectId` → `{ path, createdAt }`
   - `registerProject(projectId, path)`, `getProjectPath(projectId)`, `listProjects()`

4. **`packages/builder/src/dsl.ts`** — DSL read/write helpers
   - `readDslFiles(projectPath)` → returns all `.radiant` file contents
   - `writeDslBlock(projectPath, blockType, blockName, dslContent)` → inserts/replaces a block in the appropriate `.radiant` file
   - `removeDslBlock(projectPath, blockType, blockName)` → removes a block
   - `compileProject(projectPath)` → calls `compile()` and writes `schema.json` + `runtime.ts` + `radiant-types.ts`

5. **`packages/builder/src/codegen.ts`** — TypeScript code generation
   - `generateHooksCode(collection, hooks)` → produces `app.hooks("col", { ... })` string
   - `generateAccessCode(collection, rules)` → produces `app.access("col", { ... })` string
   - `generateRouteCode(method, path, handler, options)` → produces `app.router.method("path", handler, options)` string
   - `generateCronCode(name, schedule, handler)` → produces `app.cronManager.schedule(...)` string
   - `insertIntoFile(filePath, codeBlock)` → inserts code into the appropriate section
   - `removeFromFile(filePath, matcher)` → removes a code block matching the pattern

### Phase 2: Project & collection endpoints

6. **`packages/builder/src/handlers/projects.ts`**
   - `POST /projects` — scaffold
   - `GET /projects/:projectId` — status

7. **`packages/builder/src/handlers/collections.ts`**
   - `POST /projects/:projectId/collections` — add
   - `PUT /projects/:projectId/collections/:slug` — update
   - `DELETE /projects/:projectId/collections/:slug` — delete

### Phase 3: Config endpoints

8. **`packages/builder/src/handlers/config.ts`**
   - `PUT /projects/:projectId/config/security`
   - `PUT /projects/:projectId/config/monitoring`
   - `PUT /projects/:projectId/config/email`

### Phase 4: Code-gen endpoints (hooks, access, routes, cron)

9. **`packages/builder/src/handlers/hooks.ts`**
   - `POST /projects/:projectId/collections/:slug/hooks`
   - `PUT /projects/:projectId/collections/:slug/hooks`
   - `DELETE /projects/:projectId/collections/:slug/hooks/:hookName`

10. **`packages/builder/src/handlers/access.ts`**
    - `POST /projects/:projectId/collections/:slug/access`

11. **`packages/builder/src/handlers/routes.ts`**
    - `POST /projects/:projectId/routes`
    - `DELETE /projects/:projectId/routes`

12. **`packages/builder/src/handlers/cron.ts`**
    - `POST /projects/:projectId/cron`
    - `DELETE /projects/:projectId/cron/:name`

### Phase 5: DB sync, build, validate

13. **`packages/builder/src/handlers/db.ts`**
    - `POST /projects/:projectId/db/sync`
    - `POST /projects/:projectId/db/sync/preview`

14. **`packages/builder/src/handlers/build.ts`**
    - `POST /projects/:projectId/build`
    - `POST /projects/:projectId/validate`

### Phase 6: Introspection & discovery

15. **`packages/builder/src/handlers/introspection.ts`**
    - `GET /projects/:projectId/schema`
    - `GET /projects/:projectId/openapi`
    - `GET /projects/:projectId/files`
    - `GET /projects/:projectId/files/:path`
    - `PUT /projects/:projectId/files/:path`

16. **`packages/builder/src/handlers/plugins.ts`**
    - `POST /projects/:projectId/plugins`
    - `DELETE /projects/:projectId/plugins/:name`
    - `POST /projects/:projectId/queue`

17. **`packages/builder/src/handlers/discovery.ts`**
    - `GET /templates`
    - `GET /field-types`

### Phase 7: Tests & docs

18. **`packages/builder/_tests/builder.test.ts`** — end-to-end tests:
    - Scaffold a project → add collection → add hooks → set access → build → validate
    - Schema sync preview (no DB required)
    - Error cases (invalid field type, non-existent relationship target)

19. **`packages/builder/README.md`** — API reference with all 30 endpoints

---

## 7. Agent Integration Examples

### 7.1 Lovable / Bolt (AI website builder)

```
1. POST /projects                    → scaffold "my-app" with SQLite
2. POST /projects/my-app/collections → add "pages" collection
3. POST /projects/my-app/collections → add "components" collection
4. POST /projects/my-app/collections/:slug/access → restrict writes to admins
5. POST /projects/my-app/collections/:slug/hooks  → add beforeCreate slug generator
6. POST /projects/my-app/build        → build the project
7. GET  /projects/my-app/openapi      → get the API spec for the frontend
```

### 7.2 Claude (Anthropic)

```
1. POST /projects                    → scaffold "claude-todos" with PostgreSQL
2. POST /projects/claude-todos/collections → add "tasks" with relationship to "users"
3. PUT  /projects/claude-todos/config/security → configure JWT + rate limiting
4. POST /projects/claude-todos/collections/tasks/hooks → add validation hook
5. POST /projects/claude-todos/collections/tasks/access → set user-scoped access
6. POST /projects/claude-todos/db/sync → sync schema to PostgreSQL
7. POST /projects/claude-todos/build → build
8. GET  /projects/claude-todos/schema → verify final schema
```

---

## 8. What's NOT in scope

- **Multi-tenant auth** — single bearer token, not per-user auth
- **Project running** — the builder API builds/configures projects, it doesn't run them. The user runs the built server separately.
- **Hot reload** — each write recompiles; the builder doesn't watch for file changes
- **Version control** — no git integration. The agent or user handles git separately.
- **Deployment** — no deploy endpoints. Build produces the bundle; deployment is the user's responsibility.
- **Cloudflare/Vercel/Lambda targets** — Phase 1 only supports `--target bun`. Other targets depend on the platform abstraction work (separate plan).

---

## 9. Risks & open questions

1. **Code injection** — Hooks, access rules, routes, and cron handlers are accepted as raw TypeScript strings. This is by design (agents generate code), but a malicious payload could write arbitrary code. Mitigation: the builder API is local-only, single-tenant, behind a bearer token. Not exposed to end users.

2. **DSL parsing** — inserting/replacing blocks in `.radiant` files requires either regex-based editing or a proper CST round-trip. The current CLI uses chevrotain (CST), but the builder API needs to modify DSL without going through the full parse→modify→serialize cycle. Phase 1 can use regex + recompile validation; Phase 2 can upgrade to CST-based editing if needed.

3. **Concurrent writes** — two agents hitting the same project simultaneously could corrupt files. Phase 1: simple file locking. Phase 2: operation queue per project.

4. **Plugin resolution** — `db:sync` needs to resolve adapter plugins from the project's `node_modules`, not the builder's. This already works in `db-sync.ts` via `require.resolve(pkg, { paths: [projectRoot] })` — the builder reuses this pattern.
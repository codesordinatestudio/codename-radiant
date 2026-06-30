# Radiant Enterprise Readiness Review

**Date:** June 30, 2026  
**Scope:** Backend architecture, security, scalability, observability, data layer, API design, and acquisition attractiveness  
**Target:** Companies like Russell Investments, Cloudflare, AWS

---

## What's Built So Far (Impressive Foundation)

Radiant has a strong architectural foundation. Here's what exists and works:

### 1. DSL & Tooling
- Custom DSL (`.radiant`) with Chevrotain-based lexer, parser, and visitor
- Compiler with semantic validation (e.g., `link()` target existence checks)
- TypeScript type generation (`radiant-types.ts`) with model/create/update/query interfaces
- LSP with formatting support
- VSCode extension with syntax highlighting
- Dev watcher with auto-rebuild on file change
- Project scaffolding (`radiant init`)
- Environment variable resolution (`$env` / `$default` in schema)

### 2. Runtime Engine
- `RadiantRuntime<TCollections>` with generic type safety
- Auto-generated CRUD routes (list, get, create, update, delete) per collection
- Auth routes (register, login, refresh, logout, forgot-password, reset-password)
- Globals (singleton config documents) with get/upsert
- Custom router with TypeBox schema validation, coercion, and OpenAPI generation
- WebSocket manager with rooms, heartbeat, and access control
- SSE manager with channels and heartbeat
- Durable stream store interface (in-memory default, pluggable for Redis/Postgres)
- Cron scheduling (local via `Bun.cron`, distributed via BullMQ)
- Plugin system with `onInit`, `beforeRequest`, `afterRequest`, `onError` lifecycle hooks
- Collection-level hooks (beforeCreate, afterCreate, beforeUpdate, etc.)
- Access control system (per-collection read/create/update/delete rules)

### 3. Data Layer
- Abstract `RadiantAdapter` interface with 25+ methods
- PostgreSQL adapter (Bun SQL + postgres.js fallback, auto-create DB, connection retry, constraint error parsing, schema sync)
- SQLite adapter
- MongoDB adapter
- Redis adapter
- SurrealDB adapter
- Schema auto-sync (create tables, add columns, detect orphans, optional drop)
- Migration versioning interface (`recordMigration`, `getCurrentMigrationVersion`)

### 4. Infrastructure
- Rate limiting (IP-based, configurable per login/write)
- JWT auth with access/refresh token rotation and password reset tokens
- File upload with pluggable storage (local disk, S3 plugin)
- Email system with templates (welcome, forgot password, reset success, verify email) and pluggable transports (Resend, Nodemailer)
- BullMQ queue manager for background jobs
- SQLite-backed KV store with TTL support
- Pino-based structured logging with KV-persisted error logs
- OpenAPI spec generation + Scalar API docs UI
- CSRF protection in native route handler
- Production guardrail (blocks MemoryCacheStore in production)

### 5. Testing
- Unit tests for CLI (lexer, parser, compiler, generator, formatter, scaffold)
- Unit tests for runtime (cache, openapi, request, response, storage, stream, cron, router, sse, websocket, auth, globals, plugin)
- Unit tests for plugins (postgres, mongodb, redis-db, surrealdb, email)
- E2E test scaffolding with Docker Compose (Postgres, Redis, MongoDB, SurrealDB, Mailpit)

---

## Critical Bugs (Must Fix Before Any Enterprise Conversation)

### BUG-1: Plugin System Is Broken in `start()` ⚠️ CRITICAL

**File:** `runtime/bun/src/main/runtime.ts:740-759`

The `start()` method defines an inline `fetch` handler for `Bun.serve()` that **completely bypasses the plugin lifecycle**. It does NOT call `this.fetch()` (the method that runs `beforeRequest`, `afterRequest`, and `onError` plugin hooks). This means:

- **Global middleware is silently ignored** when the server runs in production
- **Request logging plugins don't fire**
- **Error handling plugins don't fire**
- **Custom auth plugins don't fire**

The `this.fetch()` method exists and correctly runs all plugin hooks, but `start()` reimplements the fetch handler from scratch instead of delegating to `this.fetch()`. This is the #1 issue to fix.

### BUG-2: Duplicate Adapter Assignment

**File:** `runtime/bun/src/main/runtime.ts:46-47`

```typescript
this.adapter = config.adapter;
this.adapter = config.adapter; // Duplicate
```

### BUG-3: Cache Invalidation Destroys All Cache

**File:** `runtime/bun/src/main/runtime.ts:450, 479, 495-496, 510-511`

The cache invalidation strategy calls `this.cache.close()` (which clears ALL entries in `MemoryCacheStore`) on every create/update/delete. The code even has a comment: `"Invalidate all (naive)"`. This makes caching effectively useless — any write nukes the entire cache, not just the affected collection's entries.

### BUG-4: No Input Validation on Auto-Generated CRUD Routes

The auto-generated CRUD routes (create, update) do `await req.json()` and pass the raw body directly to `this.adapter.create()` without any validation against the collection's field definitions. A user can submit arbitrary fields, wrong types, or missing required fields. Only custom routes with TypeBox schemas get validated.

### BUG-5: Refresh Token Store Is In-Memory Only

**File:** `runtime/bun/src/security/auth.ts:92-93`

```typescript
// For now, store in memory. In a DB adapter, this would go into a system table.
this.refreshTokenStore.set(tokenHash, { userId, collection, role, expiresAt });
```

Refresh tokens are stored in a process-local `Map`. In a multi-server deployment, a refresh token issued by Server A is unknown to Server B. Token revocation on logout only works on the server that handles the logout request. This breaks horizontal scaling entirely.

### BUG-6: Dual Fetch Handlers Cause Inconsistent Behavior

The `start()` method's inline fetch handler and the `this.fetch()` method handle errors differently:
- `start()`: catches `"Unauthorized"` in the error message string and returns 403
- `this.fetch()`: uses plugin `onError` hooks and returns `err.status || 500`

This means the same error produces different responses depending on which code path handles it.

---

## Enterprise Readiness Gaps

### A. Security (Highest Priority for AWS/Cloudflare)

| Gap | Severity | Description |
|-----|----------|-------------|
| **No API Key Authentication** | High | Only JWT. Enterprise APIs need API keys with scopes, rotation, and rate limits per key. |
| **No OAuth2/OIDC / SSO** | High | No external identity provider integration (Auth0, Okta, Azure AD). Enterprises require SSO. |
| **No RBAC/ABAC** | High | Access rules are simple boolean functions. No role hierarchy, no permission inheritance, no attribute-based policies. |
| **No Multi-tenancy** | High | No tenant isolation, no per-tenant data separation, no tenant-specific configuration. |
| **No Field-Level Encryption** | High | No encryption at rest for sensitive fields (PII, PCI data). |
| **No Audit Logging** | High | `security.audit.enabled` exists in schema but has zero implementation. Enterprises need immutable audit trails. |
| **Password Policy Not Enforced** | Medium | `security.passwordPolicy` is in the schema but no code enforces minLength, requireUppercase, requireNumber. |
| **Account Lockout Not Enforced** | Medium | `security.lockout` is in the schema but no code enforces maxAttempts/duration. |
| **Security Headers Not Implemented** | Medium | `security.headers.enabled` is in the schema but no headers (HSTS, X-Frame-Options, CSP) are set. |
| **Secrets Management Not Implemented** | Medium | `security.secrets.enabled` is in the schema but there's no integration with Vault, AWS Secrets Manager, etc. |
| **No SQL Injection Audit** | Medium | The Postgres adapter uses `this.db.unsafe()` with string-interpolated SQL in several places. While parameters are used for values, table/column names are interpolated and could be vulnerable to injection if collection slugs aren't sanitized. |
| **No HTTPS/TLS Configuration** | Medium | No built-in TLS support, no redirect from HTTP to HTTPS. |
| **CORS Not Wired from Schema** | Low | `security.cors` exists in schema but isn't passed to the runtime's Bun.serve handler. |
| **No WebSocket Auth on Connect** | Medium | WebSocket auth is checked on room join, not on initial connection upgrade. Unauthenticated clients can connect. |

### B. Scalability & Reliability (Critical for Cloudflare/AWS)

| Gap | Severity | Description |
|-----|----------|-------------|
| **No Horizontal Scaling Story** | Critical | In-memory refresh tokens, in-memory cache, in-memory WebSocket connections, in-memory SSE connections. None of this works across multiple server instances without external state stores. |
| **No Graceful Shutdown** | High | No SIGTERM handling, no in-flight request draining, no connection cleanup. Kubernetes rolling deployments will drop requests. |
| **No Connection Pool Monitoring** | Medium | No pool stats exposure, no connection leak detection, no pool exhaustion alerts. |
| **No Circuit Breaker** | Medium | No circuit breaker for database or external service calls. A slow DB will hang the entire server. |
| **No Backpressure Handling** | Medium | No flow control for WebSocket/SSE when clients can't keep up. Can cause memory growth. |
| **No Request Timeouts** | Medium | No per-request or per-route timeout configuration. A slow handler can hold connections indefinitely. |
| **No Pagination Limit Enforcement** | Medium | No max limit on list queries. A client can request `limit: 1000000` and exhaust memory. |
| **No Distributed Locking** | Low | No support for distributed locks for concurrent operations (e.g., preventing duplicate cron execution). |

### C. Observability (Required for Enterprise Operations)

| Gap | Severity | Description |
|-----|----------|-------------|
| **No Metrics Export** | Critical | No Prometheus, OpenTelemetry, or custom metrics. No request count, latency, error rate, queue depth, or DB connection metrics. |
| **No Distributed Tracing** | High | No trace propagation, no OpenTelemetry integration. Can't trace requests across services. |
| **No Request Logging Middleware** | High | The `start()` fetch handler doesn't log requests. The monitoring hooks exist in `router.toNativeRoutes()` but aren't used in the runtime's own server. |
| **No Error Tracking Integration** | Medium | No Sentry, Bugsnag, or similar integration. Errors go to console/Pino only. |
| **No Health Check Depth** | Medium | Health check returns uptime/memory only. No DB connectivity, Redis connectivity, or external service health checks. |
| **No Admin Dashboard** | Low | `adminUI.enabled` exists in schema but no implementation. |

### D. Data Layer (Required for Enterprise Data Workloads)

| Gap | Severity | Description |
|-----|----------|-------------|
| **No Transaction Support** | Critical | No multi-operation transactions. Can't do "create order + decrement inventory" atomically. |
| **No Versioned Migrations** | Critical | Auto-sync is not migration. No migration files, no `radiant migrate` CLI, no rollback, no forward-only migration tracking. |
| **No Soft Deletes** | High | No soft delete support. Records are hard-deleted with no recovery. |
| **No Field-Level Permissions** | High | Can't restrict which fields a role can read/write. E.g., "users can read their own profile but not the `password` field." |
| **No Relationship Population** | High | The `depth` parameter exists in types but the runtime doesn't populate relationships. `author: link("users")` returns just the ID, never the populated user object. |
| **No Full-Text Search** | Medium | The Postgres adapter tracks `_searchableFields` but never implements FTS queries. |
| **No Aggregation/Group By** | Medium | No aggregation queries, no GROUP BY, no COUNT/SUM/AVG/MIN/MAX. |
| **No Bulk Operations** | Medium | `createMany` / `deleteMany` are in the interface but the runtime's CRUD routes don't expose them. |
| **No Schema Versioning** | Low | No way to version the schema or maintain backward compatibility. |

### E. API Layer

| Gap | Severity | Description |
|-----|----------|-------------|
| **No API Versioning** | High | No `/v1/`, `/v2/` versioning. Breaking changes require coordinating all clients simultaneously. |
| **No GraphQL Support** | Medium | Only REST. No GraphQL endpoint for clients who need flexible queries. |
| **No Response Compression** | Medium | No gzip/brotli. Large JSON responses consume unnecessary bandwidth. |
| **No Conditional Requests** | Low | No ETag, no If-Modified-Since, no 304 Not Modified support. |
| **No Rate Limit Headers** | Low | 429 responses don't include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` headers. |
| **No Request ID in Responses** | Low | Even when `monitoring.requestId.enabled` is true, the request ID isn't returned in response headers. |

### F. Developer Experience & Operations

| Gap | Severity | Description |
|-----|----------|-------------|
| **No Test Utilities** | Medium | No test helpers, no mock adapters, no test database management. Developers must set up full infrastructure to test. |
| **No Migration CLI** | High | No `radiant migrate` or `radiant migrate:rollback` command. |
| **No Seed Data Support** | Medium | No seeding mechanism for development or staging environments. |
| **No Docker/Deployment Templates** | Medium | No production Dockerfile, no k8s manifests, no deployment guides. |
| **No CI/CD Pipeline** | Medium | No GitHub Actions, no automated publishing, no release process. |
| **No Plugin Discovery** | Low | Plugins are manual imports. No registry, no auto-discovery. |
| **Leftover Lucent References** | Low | Logger uses `LUCENT_LOG_LEVEL`, Postgres adapter filters `NOT LIKE 'lucent_%'`. Should be `radiant_`. |

---

## Acquisition Attractiveness Assessment

### What Makes Radiant Attractive

1. **Unique Architecture**: DSL-to-AST-to-runtime is a differentiated approach. No competitor does this (Prisma, Hasura, Supabase all use config files or schema definitions, not a compiled DSL).

2. **Runtime-Agnostic Design**: The Universal AST (`schema.json`) can target any runtime. The Go runtime is already planned. This is a moat — competitors are locked to one language.

3. **Bun-First Performance**: Benchmarks against Elysia show competitive performance. Bun is the fastest-growing JS runtime.

4. **Plugin Architecture**: Clean separation between core, runtime, and plugins. Storage, cache, email, and DB are all pluggable. This is exactly how enterprise platforms are structured.

5. **Real-Time Built-In**: WebSocket + SSE + Durable Streams in one framework is rare. Most frameworks require bolting on Socket.io or similar.

6. **Type Safety Story**: DSL → generated types → runtime generics is a compelling developer experience.

### What Would Make an Acquirer Hesitate

1. **Security Holes**: The in-memory refresh token store, missing input validation, and unimplemented security features (audit, password policy, lockout, headers) would fail any enterprise security review immediately.

2. **Plugin System Bug**: The fact that the #1 extensibility mechanism (plugins) is silently broken in `start()` signals insufficient testing. An acquirer's due diligence would catch this.

3. **No Horizontal Scaling**: Cloudflare and AWS sell infrastructure that scales. A framework that can't scale horizontally doesn't fit their narrative.

4. **No Observability**: No metrics, no tracing, no structured request logging. Enterprise platforms need to be observable. Cloudflare and AWS both sell observability products.

5. **No Migration Story**: Auto-sync is not migrations. Enterprises need controlled, reviewable, rollbackable schema changes. This is a deal-breaker for any team managing production data.

6. **No Multi-tenancy**: SaaS platforms (which is what Russell, Cloudflare, and AWS all are) need multi-tenancy. Radiant has zero support.

7. **Leftover Branding**: Lucent references in logger env vars and DB table prefixes suggest the codebase was forked/renamed. Acquirers want clean IP.

---

## Recommended Priority Order

### Phase 1: Fix Critical Bugs (1-2 weeks)
1. Fix the plugin system in `start()` — delegate to `this.fetch()`
2. Fix cache invalidation — use targeted key deletion, not `cache.close()`
3. Add input validation to auto-generated CRUD routes
4. Move refresh token store to DB-backed implementation
5. Remove duplicate adapter assignment
6. Clean up Lucent references

### Phase 2: Security Hardening (2-3 weeks)
1. Implement API key authentication
2. Implement audit logging
3. Enforce password policy and account lockout
4. Add security headers middleware
5. Wire CORS from schema to runtime
6. Add WebSocket auth on connection

### Phase 3: Enterprise Data Layer (2-3 weeks)
1. Implement transaction support
2. Build versioned migration system + CLI
3. Implement soft deletes
4. Implement relationship population (depth-based)
5. Add pagination limit enforcement

### Phase 4: Scalability & Observability (2-3 weeks)
1. Implement graceful shutdown (SIGTERM handling)
2. Add Prometheus metrics export
3. Add OpenTelemetry tracing
4. Implement structured request logging
5. Add deep health checks (DB, Redis, etc.)
6. Add response compression

### Phase 5: Platform Features (3-4 weeks)
1. Add multi-tenancy support
2. Add API versioning
3. Add OAuth2/OIDC integration
4. Implement field-level permissions
5. Add admin dashboard
6. Add migration CLI (`radiant migrate`)
# Radiant Enterprise Blockers — Implementation Plan

**Date:** June 30, 2026  
**Status:** In Progress — Fixes 1-4 complete, Fix 5 in progress  
**Scope:** Fix the 6 critical enterprise blockers identified in the enterprise review

---

## Overview

This plan addresses the 6 enterprise blockers that would fail a due-diligence security/architecture review by an acquirer like Cloudflare, AWS, or Russell. Each fix is scoped to touch only what's necessary, following the existing architecture conventions (adapter interface, plugin system, schema-driven config).

The fixes are ordered by dependency: Bug-1 unblocks proper plugin behavior, Bug-3 makes caching actually work, Bug-4 prevents data corruption, Bug-5 enables horizontal scaling, Bug-2+6 are cleanup.

---

## Completed Fixes

### ✅ Fix 1: Repair the Plugin System in `start()`
**Status:** Done — The inline `Bun.serve()` fetch handler was replaced with `fetch: async (req) => this.fetch(req)`, routing all requests through `this.fetch()` which runs plugin lifecycle hooks (`beforeRequest`, `afterRequest`, `onError`). Rate-limit check moved into `this.fetch()`. All plugin tests pass.

### ✅ Fix 2: Remove Duplicate Adapter Assignment
**Status:** Done — The duplicate `this.adapter = config.adapter;` line in the constructor was removed.

### ✅ Fix 3: Fix Cache Invalidation Strategy
**Status:** Done — `this.cache.close()` calls replaced with targeted key deletion via `_cacheKeyRegistry: Map<string, Set<string>>`. Invalidations now only delete entries for the affected collection, preserving other collections' cache entries.

### ✅ Fix 4: Add Input Validation to Auto-Generated CRUD Routes
**Status:** Done — New `runtime/bun/src/core/validator.ts` with `validateCreate()` and `validateUpdate()` using compiled TypeBox schemas. Called in POST/PATCH handlers. System fields excluded, undeclared fields rejected, types enforced.

---

## Fix 5: DB-Backed Refresh Token Store

### Problem
`auth.ts:37-45, 92-93` — Refresh tokens are stored in a process-local `Map`. In multi-server deployments:
- Server A issues a refresh token → stores it in its local Map
- Server B receives a refresh request → checks its local Map → token not found → rejects
- Logout on Server A → deletes from Server A's Map → Server B still accepts the token

This breaks horizontal scaling and creates a security hole (revoked tokens remain valid on other servers).

### What We'll Do
1. Define a `TokenStore` interface with methods: `store(hash, entry)`, `lookup(hash)`, `revoke(hash)`, `revokeAllForUser(userId)`.
2. Implement `InMemoryTokenStore` (the current behavior, for dev/testing).
3. Implement `AdapterTokenStore` that uses the `RadiantAdapter` to persist tokens in a `radiant_refresh_tokens` system table (created via `getSystemTableStatements()`).
4. Modify `JWTAuthenticator` constructor to accept a `TokenStore` instead of using a raw `Map`. Default to `InMemoryTokenStore` if no store is provided.
5. Modify `RadiantRuntime` constructor: if the adapter supports `getSystemTableStatements` (i.e., it's a SQL adapter), pass an `AdapterTokenStore` to the `JWTAuthenticator`. Otherwise, fall back to `InMemoryTokenStore`.
6. Add `revokeAllForUser(userId)` — called when a user changes their password (after reset-password) to invalidate all existing sessions.
7. Update the `lifecycle.md` note: the system table `radiant_refresh_tokens` is auto-created by SQL adapters.

### Files Touched
- `runtime/bun/src/security/auth.ts` — refactor to use `TokenStore` interface
- New file: `runtime/bun/src/security/token-store.ts` — `TokenStore` interface, `InMemoryTokenStore`, `AdapterTokenStore`
- `runtime/bun/src/main/runtime.ts` — wire `TokenStore` into `JWTAuthenticator` construction
- `plugins/ts/postgres/src/ddl/schema.ts` — add `radiant_refresh_tokens` to `generateSystemTables()`
- `plugins/ts/sqlite/src/ddl/schema.ts` — same
- `plugins/ts/surrealdb/src/ddl/schema.ts` — same
- `plugins/ts/mongodb/src/adapter.ts` — add token collection creation (MongoDB doesn't use DDL, so `getSystemTableStatements` returns no-op, but `configureCollections` should create the collection)
- `plugins/ts/redis-db/src/adapter.ts` — Redis doesn't need a table, but `AdapterTokenStore` should handle the Redis case (tokens stored as keys with TTL)

### Verification
- Unit test: issue a refresh token, verify it's stored in the adapter (not just memory).
- Unit test: revoke a token, verify it's rejected on refresh.
- Unit test: revoke all for a user, verify all their tokens are rejected.
- E2E test: start two server instances, issue token on A, refresh on B → succeeds.
- Run `bun run test` for existing auth tests.

---

## Fix 6: Implement Versioned Migration System

### Problem
The current "migration" is auto-sync: on `start()`, the runtime diffs the schema against the database and creates missing tables/columns. This is destructive and uncontrollable:
- No migration files to review
- No rollback capability
- No version tracking (the `recordMigration`/`getCurrentMigrationVersion` adapter methods exist but are never called by the runtime)
- No way to add data transformations
- Running auto-sync in production is dangerous (it could drop columns if `dropOrphan` is true)

Enterprises need controlled, reviewable, version-tracked schema changes. Auto-sync should be a dev-only convenience, not the migration strategy.

### What We'll Do

### 6a. Migration CLI (`radiant migrate`)
1. Add `radiant migrate` command to the CLI (`packages/cli/src/cli.ts`).
2. Add subcommands:
   - `radiant migrate:status` — show current version, pending migrations
   - `radiant migrate:run` — apply all pending migrations
   - `radiant migrate:rollback` — rollback the last migration (one step)
   - `radiant migrate:create <name>` — generate a new migration file
   - `radiant migrate:reset` — drop all tables and re-run all migrations (dev only)
3. Migration files live in `radiant/migrations/` and follow the naming convention `NNN_name.ts` where NNN is a zero-padded sequence number.
4. Each migration file exports `up(adapter)` and `down(adapter)` async functions that use the `RadiantAdapter.raw()` method to execute DDL.

### 6b. Migration Runner
1. New file: `packages/cli/src/migrate/runner.ts` — reads migration files, queries the adapter for the current version (`getCurrentMigrationVersion()`), applies pending migrations in order, records each via `recordMigration(version, description)`.
2. The migration runner connects to the database directly using the adapter (constructed from env vars or a `radiant.config.json` connection string).
3. Migration files can use `adapter.raw()` for DDL and `adapter.create/update/find` for data transformations.

### 6c. Runtime Integration
1. In `RadiantRuntime.start()`, replace `this.syncDatabaseSchema()` with a migration check:
   - If `NODE_ENV === "production"`: refuse to auto-sync. Log a warning telling the user to run `radiant migrate:run` first. Optionally, auto-run pending migrations if a config flag `autoMigrate: true` is set.
   - If `NODE_ENV !== "production"`: keep auto-sync as a convenience (dev mode), but log that it's dev-only.
2. Keep `syncDatabaseSchema()` as a separate method that can be called manually for dev convenience.

### 6d. DSL Support for Migration Flags
The `migrate` block already exists in the schema (`migrate.dropOrphan`). We'll add:
- `migrate.auto` — boolean, whether to auto-run migrations on startup (default: `false` in production, `true` in dev)

### Files Touched
- New file: `packages/cli/src/migrate/runner.ts` — migration runner
- New file: `packages/cli/src/migrate/generator.ts` — migration file scaffold
- `packages/cli/src/cli.ts` — add `migrate` commands
- `packages/cli/src/index.ts` — register commands
- `runtime/bun/src/main/runtime.ts` — replace `syncDatabaseSchema()` call in `start()` with migration logic
- `runtime/bun/src/core/types.ts` — add `migrate.auto` to `RadiantAST.migrate`

### Verification
- Unit test: `radiant migrate:create add_users_table` generates a migration file.
- Unit test: `radiant migrate:run` applies pending migrations and records versions.
- Unit test: `radiant migrate:rollback` reverses the last migration.
- Unit test: `radiant migrate:status` shows correct pending/applied state.
- E2E test: start the server in production mode without running migrations → warning logged, server starts but schema isn't auto-synced.
- Run `bun run test` for existing tests.

---

## Execution Order

```
Fix 1 (Plugin system)     ✅ Done
Fix 2 (Duplicate adapter)  ✅ Done
Fix 3 (Cache invalidation) ✅ Done
Fix 4 (Input validation)   ✅ Done
Fix 5 (Token store)        ← in progress
Fix 6 (Migrations)         ← pending
```

---

## What This Does NOT Include (Deliberate Scope Boundaries)

- No new features (API keys, OAuth, multi-tenancy, RBAC) — those are Phase 2 of the enterprise roadmap.
- No refactoring of the router or adapter interface — those contracts are stable.
- No changes to the DSL syntax — the compiler and parser are untouched.
- No changes to the plugin interface contract — only the `start()` method is fixed to actually call plugins.
- No changes to the test framework or test structure.

These boundaries ensure the plan is executable without cascading changes.
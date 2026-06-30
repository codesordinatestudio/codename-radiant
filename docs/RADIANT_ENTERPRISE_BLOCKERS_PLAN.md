# Radiant Enterprise Blockers — Implementation Plan

**Date:** June 30, 2026  
**Status:** Complete — All 6 fixes done  
**Scope:** Fix the 6 critical enterprise blockers identified in the enterprise review

---

## Overview

This plan addresses the 6 enterprise blockers that would fail a due-diligence security/architecture review by an acquirer like Cloudflare, AWS, or Russell. Each fix is scoped to touch only what's necessary, following the existing architecture conventions (adapter interface, plugin system, schema-driven config).

---

## Completed Fixes

### ✅ Fix 1: Repair the Plugin System in `start()`
**Status:** Done — The inline `Bun.serve()` fetch handler was replaced with `fetch: async (req) => this.fetch(req)`, routing all requests through `this.fetch()` which runs plugin lifecycle hooks (`beforeRequest`, `afterRequest`, `onError`). Rate-limit check moved into `this.fetch()`. All plugin tests pass.

### ✅ Fix 2: Remove Duplicate Adapter Assignment
**Status:** Done — The duplicate `this.adapter = config.adapter;` line in the constructor was removed.

### ✅ Fix 3: Fix Cache Invalidation Strategy
**Status:** Done — `this.cache.close()` calls replaced with targeted key deletion via `_cacheKeyRegistry: Map<string, Set<string>>`. Invalidations now only delete entries for the affected collection, preserving other collections' cache entries.

### ✅ Fix 4: Add Input Validation to Auto-Generated CRUD Routes
**Status:** Done — New `runtime/bun/src/core/validator.ts` with `validateCreate()` and `validateUpdate()` using compiled TypeBox schemas. Called in POST/PATCH handlers. System fields excluded, undeclared fields rejected, types enforced. Fields with `default` values are optional on create.

### ✅ Fix 5: DB-Backed Refresh Token Store
**Status:** Done — New `TokenStore` interface (`token-store.ts`) with `InMemoryTokenStore` and `AdapterTokenStore`. `JWTAuthenticator` refactored to use `TokenStore` instead of a raw `Map`. Runtime wires `AdapterTokenStore` when adapter supports system tables. `radiant_refresh_tokens` system table added to Postgres, SQLite, SurrealDB, MongoDB DDL. `revokeAllForUser()` called after password reset. E2E tests verify cross-instance token refresh and revocation.

---

## Fix 6: Safe Schema Sync (No Migration Files)

### Problem
The current auto-sync in `syncDatabaseSchema()` can drop columns/tables when `migrate.dropOrphan` is true — destructive in production. There's no way to control when schema changes are applied, and no visibility into what will change.

### Approach
**No migration files.** The `config.radiant` schema is the single source of truth — no version tracking, no `radiant/migrations/` directory, no Prisma-style file dependency. The DB is always synced against the current schema.

### What We Did

#### 6a. Production-Safe Auto-Sync
Modified `syncDatabaseSchema()` to be **additive-only in production**:
- In production (`NODE_ENV === "production"`): auto-sync only creates missing tables and adds missing columns. It **never drops** anything, regardless of `dropOrphan`. Orphaned columns/tables are logged as warnings only.
- In dev: `dropOrphan` flag works as before — when true, drops orphaned tables/columns; when false, warns.
- Auto-sync always runs on `start()` (dev and prod) — but it's safe because it can only add, never remove.
- `radiant_refresh_tokens` system table is excluded from orphan detection.

#### 6b. `radiant db:sync` CLI Command
New CLI command for manual schema sync with a `--force` flag:
- `radiant db:sync` — shows the schema diff (what tables/columns need to be created, what's orphaned). Applies additive changes only (same as auto-sync).
- `radiant db:sync --force` — applies destructive changes too (drops orphaned tables/columns). This is the manual escape hatch for production — you review the diff, then run with `--force` to actually drop things.
- Connects to the DB by resolving adapter plugins from the user's project `node_modules` (via `require.resolve` with `paths`), reads `DATABASE_URL` from `.env`, loads schema from `radiant/runtime/schema.json`.

#### 6c. Keep Existing `migrate.dropOrphan`
The `migrate.dropOrphan` flag stays as-is in the schema — it's a **dev-only** flag. In production it's ignored (auto-sync is always additive). The `--force` flag on `radiant db:sync` is the production equivalent.

### Files Touched
- `runtime/bun/src/main/runtime.ts` — modified `syncDatabaseSchema()` to be additive-only in production
- New file: `packages/cli/src/db-sync.ts` — `radiant db:sync` command with `--force` flag
- `packages/cli/src/index.ts` — registered `db:sync` command

### Verification
- 163 unit tests pass, 0 fail.
- 20 E2E tests pass (17 comprehensive + 3 token store), 0 fail.
- `bun run build` — 12/12 packages successful.

---

## Execution Order

```
Fix 1 (Plugin system)     ✅ Done
Fix 2 (Duplicate adapter)  ✅ Done
Fix 3 (Cache invalidation) ✅ Done
Fix 4 (Input validation)   ✅ Done
Fix 5 (Token store)        ✅ Done
Fix 6 (Safe schema sync)   ✅ Done
```

---

## What This Does NOT Include (Deliberate Scope Boundaries)

- No migration files — the schema is the source of truth, no Prisma-style version tracking.
- No new features (API keys, OAuth, multi-tenancy, RBAC) — those are Phase 2 of the enterprise roadmap.
- No refactoring of the router or adapter interface — those contracts are stable.
- No changes to the DSL syntax — the compiler and parser are untouched.
- No changes to the plugin interface contract.
- No changes to the test framework or test structure.
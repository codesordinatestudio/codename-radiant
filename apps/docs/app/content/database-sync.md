# Database Sync

Radiant syncs your database directly from the compiled schema — no migration files, no version numbers, no `up`/`down` scripts. Run `radiant db:sync` and the runtime diffs your schema against the live database, then applies the changes.

## How It Works

```
┌───────────────┐     ┌──────────────┐     ┌──────────────────┐
│  schema.json  │────▶│  Schema Diff  │────▶│  Database Changes │
│  (compiled)   │     │  (add/create/ │     │  (applied safely) │
│               │     │   drop)       │     │                   │
└───────────────┘     └──────┬───────┘     └──────────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │  Live Database│
                      │  (adapter)    │
                      └──────────────┘
```

1. `radiant db:sync` loads `radiant/runtime/schema.json` (produced by `radiant generate`)
2. Connects to the database using `DATABASE_URL`
3. Introspects the current database schema (tables, columns)
4. Computes a diff between the compiled schema and the live database
5. Applies non-destructive changes automatically
6. Applies destructive changes only with `--force`

## Supported Databases

The adapter is selected based on the `DATABASE_URL` scheme:

| URL Scheme | Database | Adapter Package |
|---|---|---|
| `file:`, `sqlite:` | SQLite | `@codesordinatestudio/radiant-plugin-sqlite` |
| `postgres:`, `postgresql:` | PostgreSQL | `@codesordinatestudio/radiant-plugin-postgres` |
| `mongodb:`, `mongodb+srv:` | MongoDB | `@codesordinatestudio/radiant-plugin-mongodb` |
| `redis:` | Redis | `@codesordinatestudio/radiant-plugin-redis-db` |
| `http:`, `https:` | SurrealDB | `@codesordinatestudio/radiant-plugin-surrealdb` |

Adapter plugins are resolved from your project's `node_modules` — not from the CLI's bundled dependencies.

## The Diff Report

After comparing the schema against the database, `db:sync` prints a report:

```
📊 Comparing schema against database...

  + Tables to create:
      + todos
      + products
  + Columns to add:
      + users.role
      + users.avatar
  - Tables to drop:
      - legacy_table
  - Columns to drop:
      - users.legacyField
```

### Change Types

| Type | Destructive? | Default | With `--force` |
|---|---|---|---|
| **Create table** — collection doesn't exist in DB | No | ✅ Applied | ✅ Applied |
| **Add column** — field doesn't exist in table | No | ✅ Applied | ✅ Applied |
| **Drop table** — DB table not in schema (orphaned) | Yes | ⏭️ Skipped | ✅ Applied |
| **Drop column** — DB column not in schema (orphaned) | Yes | ⏭️ Skipped | ✅ Applied |

## Safe Mode (Default)

Without `--force`, the sync only applies **additive** changes:

```bash
radiant db:sync
```

- ✅ Creates missing tables
- ✅ Adds missing columns
- ⏭️ Skips dropping orphaned tables
- ⏭️ Skips dropping orphaned columns

This is safe to run in production — it never destroys data.

## Force Mode

With `--force`, the sync also applies destructive changes:

```bash
radiant db:sync --force
```

- ✅ Creates missing tables
- ✅ Adds missing columns
- ✅ Drops orphaned tables
- ✅ Drops orphaned columns

In production (`NODE_ENV=production`), destructive changes are always skipped unless `--force` is explicitly provided, even if `--force` would normally apply them.

## System Tables

The sync preserves certain system tables that are not defined in the schema:

| Table | Purpose |
|---|---|
| `radiant_migrations` | Internal migration tracking |
| `radiant_refresh_tokens` | JWT refresh token storage |
| `radiant_audit_log` | Audit log entries (auto-created when `security.audit.enabled` is true) |

These tables are never dropped, even if they appear orphaned.

## Auto-Injected Collections

When `security.audit.enabled` is `true`, the compiler automatically injects a `radiant_audit_log` collection into the schema with these fields:

| Field | Type | Optional |
|---|---|---|
| `action` | `text` | No |
| `collection` | `text` | Yes |
| `recordId` | `text` | Yes |
| `userId` | `text` | Yes |
| `metadata` | `json` | Yes |
| `hmac` | `text` | No |
| `prevHmac` | `text` | Yes |

The HMAC fields create a tamper-evident chain — each log entry signs the previous entry's HMAC, so any modification is detectable.

## Workflow

```bash
# 1. Edit your .radiant files
# Add a new field to a collection:
#   collection products {
#     fields: {
#       + sku: text @unique
#     }
#   }

# 2. Recompile
radiant generate

# 3. Sync the database
radiant db:sync
# Output:
#   + Columns to add:
#       + products.sku
#   ⚙️  Applying changes...
#   ✅ Schema sync complete.

# 4. If you removed a field and want to drop the column:
radiant db:sync --force
```

## Environment Variables

`db:sync` automatically loads `.env` from the project root if it exists:

```bash
# .env
DATABASE_URL=file:./radiant.sqlite
# or
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
```

For SurrealDB, additional environment variables are used:

```bash
SURREAL_USER=root
SURREAL_PASS=root
SURREAL_NS=test
SURREAL_DB=test
```

## Related

- [CLI Reference](./cli-reference) — All CLI commands
- [Code Generation](./code-generation) — What `schema.json` contains
- [Config Block](./config-block) — The `migrate` config option
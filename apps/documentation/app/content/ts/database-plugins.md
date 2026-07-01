# Database Plugins

Radiant supports five database engines through adapter plugins. Each plugin implements the `RadiantAdapter` interface — you pick the one that matches your `DATABASE_URL`.

## Quick Reference

| Database | URL Scheme | Package | Install |
|---|---|---|---|
| SQLite | `file:` or `sqlite:` | `@codesordinatestudio/radiant-plugin-sqlite` | `bun add @codesordinatestudio/radiant-plugin-sqlite` |
| PostgreSQL | `postgres:` or `postgresql:` | `@codesordinatestudio/radiant-plugin-postgres` | `bun add @codesordinatestudio/radiant-plugin-postgres` |
| MongoDB | `mongodb:` or `mongodb+srv:` | `@codesordinatestudio/radiant-plugin-mongodb` | `bun add @codesordinatestudio/radiant-plugin-mongodb` |
| Redis | `redis:` | `@codesordinatestudio/radiant-plugin-redis-db` | `bun add @codesordinatestudio/radiant-plugin-redis-db` |
| SurrealDB | `http:` or `https:` | `@codesordinatestudio/radiant-plugin-surrealdb` | `bun add @codesordinatestudio/radiant-plugin-surrealdb` |

## SQLite

Zero-config, file-based database. Ideal for development and small deployments.

```typescript
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";

export const app = createRadiant({
  adapter: sqlite({ url: "file:./radiant.sqlite" }),
});
```

```bash
# .env
DATABASE_URL=file:./radiant.sqlite
```

## PostgreSQL

Production-grade relational database with connection pooling support.

```typescript
import { postgres } from "@codesordinatestudio/radiant-plugin-postgres";

export const app = createRadiant({
  adapter: postgres({
    url: process.env.DATABASE_URL!,
    pool: { max: 10 },      // optional connection pool size
    pgBouncer: false,       // set true if using PgBouncer
  }),
});
```

```bash
# .env
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

## MongoDB

Document database. Stores records as BSON documents.

```typescript
import { mongodb } from "@codesordinatestudio/radiant-plugin-mongodb";

export const app = createRadiant({
  adapter: mongodb({ url: process.env.DATABASE_URL! }),
});
```

```bash
# .env
DATABASE_URL=mongodb://localhost:27017/mydb
# or with authentication
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/mydb
```

## Redis

Key-value store as a database. Radiant maps collections to Redis hashes.

```typescript
import { redis } from "@codesordinatestudio/radiant-plugin-redis-db";

export const app = createRadiant({
  adapter: redis({
    url: process.env.DATABASE_URL!,
    prefix: "myapp:",  // optional key prefix
  }),
});
```

```bash
# .env
DATABASE_URL=redis://localhost:6379
```

## SurrealDB

Multi-model database with HTTP API.

```typescript
import { surrealdb } from "@codesordinatestudio/radiant-plugin-surrealdb";

export const app = createRadiant({
  adapter: surrealdb({
    url: process.env.DATABASE_URL!,
    user: process.env.SURREAL_USER || "root",
    pass: process.env.SURREAL_PASS || "root",
    ns: process.env.SURREAL_NS || "test",
    db: process.env.SURREAL_DB || "test",
  }),
});
```

```bash
# .env
DATABASE_URL=http://localhost:8000
SURREAL_USER=root
SURREAL_PASS=root
SURREAL_NS=test
SURREAL_DB=test
```

## Email Plugins

| Plugin | Package | Install |
|---|---|---|
| Nodemailer (SMTP) | `@codesordinatestudio/radiant-plugin-nodemailer` | `bun add @codesordinatestudio/radiant-plugin-nodemailer` |
| Resend (API) | `@codesordinatestudio/radiant-plugin-resend` | `bun add @codesordinatestudio/radiant-plugin-resend` |

See the [Email](./email) page for usage details.

## Storage Plugins

| Plugin | Package | Install |
|---|---|---|
| S3 | `@codesordinatestudio/radiant-plugin-s3` | `bun add @codesordinatestudio/radiant-plugin-s3` |

See the [Storage](./storage) page for usage details.

## Durable Streams Plugin

| Plugin | Package | Install |
|---|---|---|
| Durable Streams | `@codesordinatestudio/radiant-plugin-durable-streams` | `bun add @codesordinatestudio/radiant-plugin-durable-streams` |

See the [Realtime](./realtime) page for usage details.

## Related

- [Project Structure](./project-structure) — Where plugins are registered
- [Database Sync](./database-sync) — Syncing schema changes to your database
- [Environment Variables](./environment-variables) — Database connection env vars
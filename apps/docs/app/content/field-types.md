# Field Types

Radiant supports 15 field types. Each maps to a specific database column type and TypeScript type. You can also nest objects as field types.

## Scalar Types

| Type | SQL Storage | TypeScript | Example |
|---|---|---|---|
| `text` | `TEXT` | `string` | `name: text` |
| `textarea` | `TEXT` | `string` | `description: textarea` |
| `richtext` | `JSONB` | `any` | `body: richtext` |
| `email` | `TEXT` | `string` | `email: email @unique` |
| `password` | `TEXT` (hashed) | `string` | `password: password` |
| `boolean` | `BOOLEAN` | `boolean` | `completed: boolean @default(false)` |
| `integer` | `INTEGER` | `number` | `viewCount: integer` |
| `number` | `NUMERIC` | `number` | `price: number` |
| `date` | `TIMESTAMPTZ` | `string` | `publishedAt: date @optional` |

**`text` vs `textarea`** — Both store as `TEXT`. The difference is semantic: `textarea` signals the admin UI to render a multi-line input.

**`password`** — Hashed automatically on write (bcrypt/argon2). Omitted from the generated model interface and API responses, but included in the `Create` input type.

**`email`** — Validated against an email pattern on create/update.

**`date`** — Stored as `TIMESTAMPTZ`. Values are ISO 8601 strings in TypeScript.

## Selection Types

### `select`

Enumerated type with a fixed set of string options. Requires at least one option — the compiler errors on zero.

```radiant
status: select("draft", "published", "archived")
```

```typescript
// Generated TypeScript
status: "draft" | "published" | "archived"
```

### `multiselect`

Multiple string selections stored as `TEXT[]`.

```radiant
tags: multiselect("work", "personal", "urgent")
```

```typescript
tags: string[]
```

### Enum shorthand

An inline enum defined as an array literal. Same result as `select` but more concise for simple cases.

```radiant
role: ["admin", "user"] @default("user")
```

```typescript
role: "admin" | "user"
```

## Relationship Type

### `relationship`

A foreign key reference to another collection. The first argument is the target collection slug — it must exist, or the compiler produces a semantic error.

```radiant
author: relationship("users")
```

```typescript
// Base model (unpopulated):
author: string

// Populated model:
author: Users
```

Mark a relationship as an array with `[]`:

```radiant
tags: relationship("tags")[]
```

## Complex Types

| Type | SQL Storage | TypeScript | Example |
|---|---|---|---|
| `json` | `JSONB` | `any` | `metadata: json @optional` |
| `upload` | `JSONB` | `any` | `avatar: upload @optional` |
| `array(type)` | `JSONB` | `T[]` | `scores: array(integer)` |

**`array`** — Wraps another type. You can also use the `[]` suffix on any type: `tags: text[]`.

**`upload`** — Stores file metadata (path, size, MIME type) as JSON.

## Nested Object Fields

Fields can contain nested objects with their own field definitions. The nested object is stored as `JSONB`.

```radiant
collection products {
  fields: {
    name: text
    dimensions: {
      width: number
      height: number
      unit: text
    }
  }
}
```

```typescript
// Generated TypeScript
dimensions: { width: number; height: number; unit: string }
```

## Auto-Generated Fields

Every collection automatically includes these — you never declare them:

| Field | TypeScript | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key, auto-generated |
| `createdAt` | `string` | ISO timestamp, set on creation |
| `updatedAt` | `string` | ISO timestamp, updated on every modification |

## Related

- [Decorators](./decorators) — `@unique`, `@optional`, `@default`, `@hidden`, `@index`
- [Collections](./collections) — Where fields are defined
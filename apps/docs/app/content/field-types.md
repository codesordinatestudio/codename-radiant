# Field Types

Radiant supports 15 field types. Each maps to a specific database column type and TypeScript type.

## Scalar Types

### `text`

Short text. Maps to `TEXT` in SQL databases, `string` in TypeScript.

```radiant
name: text
```

### `textarea`

Long-form text. Same storage as `text` but signals to the admin UI to render a textarea input.

```radiant
description: textarea
```

### `richtext`

Rich text (JSON-serialised blocks). Maps to `JSONB`.

```radiant
body: richtext
```

### `email`

Email address. Maps to `TEXT`. The runtime validates the format on create/update.

```radiant
email: email @unique
```

### `password`

Hashed password. Maps to `TEXT` but is never returned in API responses. The runtime hashes it automatically on write using bcrypt/argon2.

```radiant
password: password
```

> **Note:** Password fields are omitted from the generated TypeScript model interface but included in the `Create` input type.

### `boolean`

True/false. Maps to `BOOLEAN`.

```radiant
completed: boolean @default(false)
```

### `integer`

Whole number. Maps to `INTEGER`.

```radiant
viewCount: integer
```

### `number`

Decimal number. Maps to `NUMERIC`.

```radiant
price: number
```

### `date`

ISO 8601 date/datetime. Maps to `TIMESTAMPTZ` in SQL databases.

```radiant
publishedAt: date @optional
```

## Selection Types

### `select`

An enumerated type with a fixed set of string options. Maps to `TEXT` with a TypeScript union type.

```radiant
status: select("draft", "published", "archived")
```

Generated TypeScript:
```typescript
status: "draft" | "published" | "archived"
```

> **Validation:** `select` requires at least one option. The compiler produces an error if zero options are provided.

### `multiselect`

Multiple string selections. Maps to `TEXT[]` in SQL databases, `string[]` in TypeScript.

```radiant
tags: multiselect("work", "personal", "urgent")
```

### `enum` (shorthand)

An inline enum defined as an array literal. Maps to `TEXT` with a TypeScript union type.

```radiant
role: ["admin", "user"] @default("user")
```

Generated TypeScript:
```typescript
role: "admin" | "user"
```

## Relationship Types

### `relationship`

A foreign key reference to another collection. Maps to a UUID/string in the database, but resolves to the full referenced object in "populated" queries.

```radiant
author: relationship("users")
```

| Property | Description |
|---|---|
| First argument | The target collection slug (must exist). |

Generated TypeScript:
```typescript
// In the base model (unpopulated):
author: string;

// In the Populated model:
author: Users;
```

You can mark a relationship as an array using `[]`:

```radiant
tags: relationship("tags")[]
```

## Complex Types

### `json`

Arbitrary JSON. Maps to `JSONB`.

```radiant
metadata: json @optional
```

### `array`

An array of values. When used as `array(type)`, it creates an array of the inner type. Maps to `JSONB`.

```radiant
scores: array(integer)
```

> **Note:** You can also use the `[]` suffix on any type to mark it as an array: `tags: text[]`.

### `upload`

File upload. Maps to `JSONB` (stores file metadata — path, size, MIME type).

```radiant
avatar: upload @optional
```

## Object/Nested Fields

Fields can contain nested objects with their own field definitions:

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

This creates a nested JSON object field. The generated TypeScript type is:

```typescript
dimensions: { width: number; height: number; unit: string }
```

## Type Reference Table

| Field Type | SQL Storage | TypeScript Type | Notes |
|---|---|---|---|
| `text` | `TEXT` | `string` | Short text |
| `textarea` | `TEXT` | `string` | Long text (admin UI renders textarea) |
| `richtext` | `JSONB` | `any` | Rich text blocks |
| `email` | `TEXT` | `string` | Validated email |
| `password` | `TEXT` (hashed) | `string` | Omitted from model responses |
| `boolean` | `BOOLEAN` | `boolean` | |
| `integer` | `INTEGER` | `number` | Whole numbers |
| `number` | `NUMERIC` | `number` | Decimal numbers |
| `date` | `TIMESTAMPTZ` | `string` | ISO 8601 |
| `select(...)` | `TEXT` | `"a" \| "b" \| ...` | Requires ≥1 option |
| `multiselect(...)` | `TEXT[]` | `string[]` | |
| `["a", "b"]` (enum) | `TEXT` | `"a" \| "b"` | Inline enum shorthand |
| `relationship("x")` | `UUID` / `TEXT` | `string` (base), `X` (populated) | Foreign key |
| `json` | `JSONB` | `any` | Arbitrary JSON |
| `upload` | `JSONB` | `any` | File metadata |
| nested object | `JSONB` | `{ ... }` | Inline object type |

## Auto-Generated Fields

Every collection automatically includes these fields — you do not declare them:

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key, auto-generated. |
| `createdAt` | `string` (ISO date) | Set on creation. |
| `updatedAt` | `string` (ISO date) | Updated on every modification. |

## Related

- [Decorators](./decorators) — `@unique`, `@optional`, `@default`, `@hidden`, `@index`
- [Collections](./collections) — Collection block structure
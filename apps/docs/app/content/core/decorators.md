# Decorators

Decorators are metadata annotations attached to field definitions. They start with `@` and can take optional arguments in parentheses. Multiple decorators can be chained on a single field.

## Syntax

```radiant
fieldName: type @decorator
fieldName: type @decorator("arg")
fieldName: type @decorator1 @decorator2
```

## Available Decorators

### `@unique`

Ensures the field value is unique across all records in the collection. Creates a unique constraint in the database.

```radiant
email: email @unique
```

### `@optional`

Marks the field as nullable. By default, all fields are required. Use `@optional` to allow null values.

```radiant
bio: text @optional
metadata: json @optional
```

In the generated TypeScript types, optional fields get the `?` modifier:

```typescript
interface Users {
  id: string;
  name: string;
  bio?: string;      // optional
  metadata?: any;     // optional
}
```

### `@default`

Sets a default value for the field when no value is provided at create time. Takes a single argument (string, number, boolean, or identifier).

```radiant
role: text @default("user")
completed: boolean @default(false)
priority: select("low", "medium", "high") @default("medium")
viewCount: integer @default(0)
```

In the generated TypeScript `Create` input types, fields with a `@default` are optional (since the runtime will fill in the default):

```typescript
interface TodosCreate {
  title: string;
  completed?: boolean;   // has @default(false)
  author: string;
}
```

### `@hidden`

Hides the field from API responses. The field is still stored in the database and can be used in hooks and access rules, but it is stripped from JSON responses.

```radiant
internalNotes: text @hidden
```

### `@index`

Creates a database index on the field to improve query performance. Use on fields that are frequently filtered or sorted.

```radiant
email: email @unique @index
status: select("draft", "published") @index
```

## Combining Decorators

Decorators can be freely combined. Order does not matter:

```radiant
email: email @unique @index
apiKey: text @unique @hidden
bio: text @optional @default("")
```

## Decorator Arguments

Decorators can take arguments in parentheses:

```radiant
role: text @default("user")
```

The argument value follows the same value rules as any DSL value:

| Argument Type | Example |
|---|---|
| String | `@default("user")` |
| Number | `@default(0)` |
| Boolean | `@default(false)` |

## Summary

| Decorator | Effect | Database Impact |
|---|---|---|
| `@unique` | Enforces uniqueness | Creates `UNIQUE` constraint |
| `@optional` | Allows null values | Column is `NULL`-able |
| `@default(value)` | Sets default value on create | Column gets `DEFAULT` clause |
| `@hidden` | Strips from API responses | None |
| `@index` | Adds database index | Creates `INDEX` |

## Related

- [Field Types](./field-types) — All available field types
- [Collections](./collections) — Where fields are defined
- [CLI Reference](./cli-reference) — How decorators affect generated TypeScript
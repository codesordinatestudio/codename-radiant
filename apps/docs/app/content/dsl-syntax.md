# DSL Syntax

The Radiant DSL is a declarative language for defining backend schemas and configuration. This page covers the complete grammar — tokens, block structure, value types, and comments.

## File Convention

Radiant DSL files use the `.radiant` extension and live in the `radiant/` directory of your project. You can split your schema across multiple files — the compiler merges them:

```
radiant/
  config.radiant         # config {} block
  users.radiant          # collection users { ... }
  todos.radiant          # collection todos { ... }
  settings.radiant       # global settings { ... }
```

All `.radiant` files in the `radiant/` directory (including subdirectories) are discovered and compiled together.

## Top-Level Blocks

A `.radiant` file contains zero or more top-level blocks in any order:

```radiant
config {
  // framework-wide configuration
}

collection <name> {
  // a data collection (table/document)
}

global <name> {
  // a singleton document (e.g. site settings)
}
```

- **`config`** — appears once across all files. Defines security, monitoring, API prefix, etc.
- **`collection <name>`** — defines a data model. The name becomes the database table and API route.
- **`global <name>`** — defines a singleton document. Useful for site-wide settings.

## Properties

Inside each block, you write **properties** as key-value pairs:

```radiant
propertyName: value
```

Property names can be identifiers (`name`, `email`) or keywords used as property names (`config`, `collection`, `fields`). Values can be:

### Value Types

| Value | Syntax | Example |
|---|---|---|
| **String** | `"..."` | `"hello world"` |
| **Number** | integer or decimal | `42`, `-3.14` |
| **Boolean** | `true` / `false` | `true` |
| **Identifier** | bare word | `text`, `boolean` |
| **Function call** | `name(args)` | `relationship("users")`, `select("low", "high")` |
| **Array** | `[a, b, c]` | `["jwt", "session"]` |
| **Object** | `{ key: value }` | `{ enabled: true, path: "/health" }` |
| **Environment** | `env("VAR", default)` | `env("JWT_EXPIRY", "15m")` |

### Examples

```radiant
// String
prefix: "/api"

// Number
maxBodyBytes: 1048576

// Boolean
enabled: true

// Identifier (field type)
title: text

// Function call (field type with arguments)
author: relationship("users")

// Array
strategies: ["jwt", "session"]

// Object (nested block)
jwt: {
  accessTokenExpiry: "15m"
  refreshTokenExpiry: "7d"
}

// Environment variable with default
accessTokenExpiry: env("JWT_EXPIRY", "15m")
```

## Array Suffix

Any value can be suffixed with `[]` to mark it as an array:

```radiant
tags: text[]         // array of text values
permissions: text[]   // array of strings
```

## Decorators

Decorators are metadata annotations attached to properties (typically fields). They start with `@`:

```radiant
email: email @unique
bio: text @optional
role: text @default("user")
status: text @unique @optional
```

Multiple decorators can be chained. See the [Decorators](./decorators) page for the full list.

## Separators

Properties are separated by commas **or** semicolons — both are optional:

```radiant
// All of these are valid:
name: text,
email: email @unique

role: text @default("user");
status: boolean @default(false)
```

## Comments

Line comments start with `//` and continue to the end of the line:

```radiant
// This is a comment
collection users {
  auth: true  // this collection has auth enabled
  fields: {
    name: text
    // email must be unique across all users
    email: email @unique
  }
}
```

Comments are preserved by the formatter and used as leading comments in the output.

## Grammar Reference

The full grammar in EBNF-like notation:

```
radiantFile     := (configBlock | collectionBlock | globalBlock)*

configBlock     := "config" "{" objectBody "}"
collectionBlock := "collection" Identifier "{" objectBody "}"
globalBlock     := "global" Identifier "{" objectBody "}"

objectBody      := property*

propertyName    := Identifier | "config" | "collection" | "globals" | "fields"

property        := propertyName ":" value arraySuffix? decorator* separator?

arraySuffix     := "[" "]"

value           := StringLiteral
                 | NumberLiteral
                 | "true"
                 | "false"
                 | functionOrIdentifier
                 | arrayLiteral
                 | objectLiteral

functionOrIdentifier := Identifier ("(" value ("," value)* ")")?

arrayLiteral    := "[" value? ("," value)* "]"

objectLiteral   := "{" objectBody "}"

decorator       := "@" Identifier ("(" value ("," value)* ")")?

separator       := ";" | ","
```

## Tokens

The lexer recognizes these token types:

| Category | Tokens |
|---|---|
| **Keywords** | `config`, `collection`, `global`/`globals`, `fields`, `true`, `false` |
| **Identifier** | `[a-zA-Z_][a-zA-Z0-9_]*` |
| **Decorator** | `@[a-zA-Z_][a-zA-Z0-9_]*` |
| **String** | `"(?:[^"\\]|\\.)*"` |
| **Number** | `-?\d+(\.\d+)?` |
| **Punctuation** | `{ } [ ] ( ) : , ;` |
| **Comment** | `//[^\n\r]*` |
| **Whitespace** | `[ \t\n\r]+` (skipped) |

Keywords are matched before identifiers — `collection` is parsed as the keyword token, not as an identifier. This means you can still use `collection` as a property name inside blocks (e.g., in audit log fields).

## Related Pages

- [Config Block](./config-block) — All properties allowed inside `config {}`
- [Collections](./collections) — All properties allowed inside `collection {}`
- [Field Types](./field-types) — All field types and their usage
- [Decorators](./decorators) — `@unique`, `@optional`, `@default`, and more
- [Environment Variables](./environment-variables) — The `env()` function
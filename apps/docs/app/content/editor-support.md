# Editor Support

Radiant provides a Language Server (LSP) and VS Code extension for a first-class editing experience: real-time diagnostics, autocompletion, and code formatting.

## VS Code Extension

The `vscode-radiant` package provides a VS Code extension that launches the Radiant LSP. It activates for `.radiant` files and provides:

- **Diagnostics** — squiggly lines for lexing, parsing, and semantic errors
- **Autocompletion** — context-aware completions for keywords, field types, decorators, and config keys
- **Formatting** — format-on-save with consistent 2-space indentation
- **Cross-file validation** — errors in one file take other `.radiant` files into account (e.g., relationship targets)

## LSP Server

The LSP server is implemented in `packages/cli/src/lsp/server.ts` and uses the `vscode-languageserver` library. You start it with:

```bash
radiant lsp
```

This runs on stdio — editors launch it automatically. You typically never run this manually.

## Diagnostics

The LSP provides three layers of diagnostics:

### 1. Lexing Errors

Reported immediately when the lexer cannot tokenise a character:

```
✖ Lexing errors:
  Unexpected character '!' at line 5, column 3
```

### 2. Parsing Errors

Reported when the token stream doesn't match the grammar:

```
✖ Parsing errors:
  Expecting token of type: "RCurly" but found "Identifier"
```

### 3. Semantic Errors

Reported after successful parsing, during compilation. The LSP scans all `.radiant` files in the workspace for cross-file context:

- **Unknown property** — a key not in the allowed set for its block
- **Unknown field type** — a type not in the allowed field type list
- **Duplicate collection** — two collections with the same name
- **Invalid relationship target** — `relationship("x")` where `x` doesn't exist
- **Missing select options** — `select()` with zero arguments

### Cross-File Validation

The LSP scans all `.radiant` files in the workspace to build cross-file context. This means:

- A `relationship("users")` in `posts.radiant` validates against the `users` collection defined in `users.radiant`
- Duplicate collection names are detected even when collections are in different files
- When you edit one file, diagnostics update across all open files

## Autocompletion

The LSP provides context-aware completions based on what you're typing:

### Structural Keywords

When typing at the block level (not after a `:`), you get completions for:

- `config`, `collection`, `global` — top-level block keywords
- `core`, `security`, `monitoring`, `adminUI`, `output` — config block keys
- `api`, `prefix`, `maxBodyBytes`, `trustedProxies` — nested config keys
- `auth`, `cors`, `rateLimit`, `headers`, `secrets`, `audit` — security keys
- `strategies`, `jwt`, `passwordPolicy`, `lockout` — auth keys
- `healthCheck`, `path`, `requiresAuth`, `requestId` — monitoring keys
- `fields` — collection field definition key

### Field Types

When typing after a `:` (in a field definition context), you get completions for all 15 field types with documentation:

- `text`, `textarea`, `richtext`, `email`, `password`
- `boolean`, `integer`, `number`, `date`
- `select`, `multiselect`, `enum`
- `relationship`, `json`, `array`, `upload`

Each completion includes a `detail` line (e.g., "Stored as TEXT") and documentation.

### Decorators

When typing after `@`, you get decorator completions:

- `@unique` — Ensure field is unique
- `@optional` — Mark field as optional
- `@default(value)` — Set a default value
- `@hidden` — Hide from API responses
- `@index` — Add database index

### `env()` Function

The `env` completion appears in field type contexts with documentation about the env variable resolution pattern.

## Formatting

The formatter (`packages/cli/src/lsp/formatter.ts`) uses the parser's CST to produce consistent formatting:

- 2-space indentation
- Consistent property separator (no trailing commas/semicolons)
- Multi-line object blocks for nested objects
- Single-line for simple key-value pairs
- Comments preserved and aligned as leading comments

The formatter never formats broken code — if the input has lex or parse errors, the original text is returned unchanged.

### Format on Save

In VS Code, enable format-on-save in your settings:

```json
{
  "[radiant]": {
    "editor.formatOnSave": true
  }
}
```

## Related

- [DSL Syntax](./dsl-syntax) — The grammar the LSP validates against
- [Config Block](./config-block) — The keys the LSP autocompletes in `config {}`
- [Collections](./collections) — The keys the LSP autocompletes in `collection {}`
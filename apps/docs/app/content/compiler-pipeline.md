# Compiler Pipeline

The Radiant compiler transforms `.radiant` source files into a validated schema. Understanding the pipeline helps you debug errors and reason about how your DSL maps to generated code.

## Pipeline Stages

```
.radiant files
     │
     ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Lexer    │────▶│  Parser  │────▶│  Visitor │────▶│ Compiler │
│  (tokens) │     │  (CST)   │     │  (AST)   │     │ (schema) │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │  Generator    │
                                                  │  (ts types,   │
                                                  │   runtime)   │
                                                  └──────────────┘
```

### 1. Lexer

**Source:** `packages/cli/src/parser/lexer.ts`

Tokenises the raw text into a stream of tokens using [Chevrotain](https://chevrotain.io/). Handles:

- **Keywords:** `config`, `collection`, `global`/`globals`, `fields`, `true`, `false`
- **Identifiers:** `[a-zA-Z_][a-zA-Z0-9_]*`
- **Decorators:** `@unique`, `@default(...)`
- **Literals:** strings (`"..."`), numbers (`-?\d+(\.\d+)?`)
- **Punctuation:** `{ } [ ] ( ) : , ;`
- **Comments:** `// ...` (grouped separately, preserved for formatter)
- **Whitespace:** skipped

Keywords are matched before identifiers — `collection` is the keyword token, not an identifier. This allows keywords to be used as property names inside blocks (e.g., `collection: text` in the audit log).

### 2. Parser

**Source:** `packages/cli/src/parser/parser.ts`

A Chevrotain `CstParser` with recovery enabled (`recoveryEnabled: true`, `maxLookahead: 2`). Produces a Concrete Syntax Tree (CST).

Grammar rules:

```
radiantFile       → (configBlock | collectionBlock | globalBlock)*
configBlock       → "config" "{" objectBody "}"
collectionBlock   → "collection" Identifier "{" objectBody "}"
globalBlock      → "global" Identifier "{" objectBody "}"
objectBody        → property*
property          → propertyName ":" value arraySuffix? decorator* separator?
value             → StringLiteral | NumberLiteral | True | False
                   | functionOrIdentifier | arrayLiteral | objectLiteral
functionOrIdentifier → Identifier ("(" value ("," value)* ")")?
arrayLiteral      → "[" value? ("," value)* "]"
objectLiteral     → "{" objectBody "}"
decorator         → "@" Identifier ("(" value ("," value)* ")")?
```

Recovery mode means the parser continues after errors and produces partial results — useful for LSP diagnostics where you want to show as many errors as possible in one pass.

### 3. Visitor

**Source:** `packages/cli/src/parser/visitor.ts`

Walks the CST to produce a plain JavaScript AST. The visitor:

- Flattens blocks into `{ type, name, body, token }` objects
- Resolves property names (identifiers and keyword-as-property-name)
- Compiles values into plain JS values:
  - `StringLiteral` → `string` (quotes stripped)
  - `NumberLiteral` → `number`
  - `True`/`False` → `boolean`
  - `functionOrIdentifier` → `{ type: "function", name, args }` or `{ type: "identifier", name }`
  - `arrayLiteral` → `{ type: "array", elements }`
  - `objectLiteral` → `{ type: "object", properties }`
  - `decorator` → `{ type: "decorator", name, args }`
- Preserves token references for error reporting (startOffset, endOffset)

### 4. Compiler

**Source:** `packages/cli/src/compiler.ts`

The compiler takes an array of ASTs (one per `.radiant` file) and produces a unified schema with validation. It runs in three phases:

#### Phase 1: Block Compilation

Traverses each AST and compiles each block:

- **`config` block** — validates keys against `ALLOWED_CONFIG` (`core`, `security`, `monitoring`, `adminUI`, `apiPrefix`, `migrate`, `output`). Nested validation for `core`, `security`, `monitoring`, `migrate`.
- **`collection` block** — validates keys against `ALLOWED_COLLECTION` (`auth`, `fields`, `realtime`, `cache`, `hooks`, `admin`). Compiles fields via `compileField()`. Detects duplicate collection names.
- **`global` block** — same validation as collections. Detects duplicate global names.

#### Phase 2: Field Validation

Validates all compiled fields across all collections and globals:

- **Field type existence** — checks against `ALLOWED_FIELD_TYPES` (15 types)
- **Relationship targets** — `relationship("x")` must reference an existing collection
- **Select options** — `select(...)` must have at least one option

#### Phase 3: Auto-Injection

If `security.audit.enabled` is `true`, auto-injects the `radiant_audit_log` collection with HMAC-chain fields for tamper-evident logging.

#### Value Compilation

The `compileValue()` function transforms AST value nodes into runtime values:

- `object` → nested plain object
- `array` → plain array
- `identifier` → string (the name)
- `function("env", args)` → `{ $env: "VAR", $default: value }` — special handling for environment variable resolution
- Other functions → kept as-is for the runtime to interpret

#### Field Compilation

The `compileField()` function transforms a field property into a field definition:

- `identifier` value → `{ name, type: "identifier_name" }`
- `function` value → `{ name, type: "function_name", ...args }` (e.g., `relationship("users")` → `{ type: "relationship", target: "users" }`)
- `array` value → `{ name, type: "enum", values: [...] }` (inline enum shorthand)
- `object` value → `{ name, type: "object", fields: [...] }` (nested object)
- `[]` suffix → adds `isArray: true`
- Decorators → `@unique` → `unique: true`, `@optional` → `optional: true`, `@default(x)` → `default: x`

### 5. Generator

**Source:** `packages/cli/src/generator/ts.ts`

Takes the compiled schema and produces TypeScript output:

- `generateTypeScriptTypes(schema)` → `radiant-types.ts` (model interfaces, create/update inputs, where clauses, collections registry)
- `generateTypeScriptRuntime(schema)` → `runtime.ts` (embeds the schema as JSON, exports `createRadiant()`)

The generator strips internal compiler metadata (tokens, URIs) before serialising the schema.

## Error Handling

Each stage can produce errors:

| Stage | Error Type | Example |
|---|---|---|
| Lexer | Token recognition failure | `Unexpected character '!'` |
| Parser | Grammar mismatch | `Expected "RCurly" but found "Identifier"` |
| Compiler | Semantic error | `Unknown property 'xyz' in config block` |
| Compiler | Validation error | `Collection 'posts' relates to non-existent collection 'authors'` |

In `radiant generate` mode, any error prints the message and exits with code 1. In `radiant dev` mode, errors are printed but the process continues watching.

The LSP surfaces all three error types as diagnostics with accurate line/column ranges.

## Related

- [DSL Syntax](./dsl-syntax) — The grammar the pipeline processes
- [Code Generation](./code-generation) — What the generator produces
- [Editor Support](./editor-support) — How the LSP uses the pipeline for diagnostics
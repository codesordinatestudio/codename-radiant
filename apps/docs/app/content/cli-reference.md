# CLI Reference

The Radiant CLI (`radiant`) provides commands for project initialization, code generation, development, database sync, and language server support.

## Installation

The CLI is available as the `@codesordinatestudio/radiant` package. In a Radiant project, it's already available via `npx radiant` or `bunx radiant`.

## Commands

### `radiant init`

Initialize a new Radiant project in the current directory.

```bash
radiant init
radiant init --dir my-app
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-d, --dir <path>` | Project directory name | Interactive prompt |

**What it does:**

1. Prompts for a project name (if not provided via `--dir`)
2. Prompts for a template (currently: `blank`)
3. Creates a `<project>/radiant/` directory
4. Writes the template's `config.radiant` boilerplate
5. Prints next steps

The blank template creates a starter `config.radiant` with basic security and monitoring settings, plus a `users` collection with auth enabled.

### `radiant generate`

Compile `.radiant` files and generate runtime artifacts.

```bash
radiant generate
radiant generate --runtime ts --dir ./radiant
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-r, --runtime <type>` | Target runtime (`ts` for TypeScript/Bun) | `ts` |
| `-d, --dir <path>` | Path to the `radiant/` directory | `./radiant` |

**What it does:**

1. Finds all `.radiant` files in the `radiant/` directory (recursively)
2. Lexes each file (tokenises the source)
3. Parses the token stream into a CST
4. Visits the CST to produce an AST
5. Compiles all ASTs into a unified schema (with semantic validation)
6. Generates output files:
   - `radiant/runtime/schema.json` — compiled schema
   - `radiant/runtime/runtime.ts` — runtime entry point
   - `radiant-types.ts` — TypeScript types (at project root)

If any lexing, parsing, or semantic errors occur, the command prints them and exits with code 1 (unless in dev mode).

### `radiant dev`

Watch `.radiant` files and rebuild on changes.

```bash
radiant dev
radiant dev --runtime ts
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-r, --runtime <type>` | Target runtime | `ts` |
| `-d, --dir <path>` | Path to the `radiant/` directory | `./radiant` |

**What it does:**

1. Runs an initial `generateCompilerOutput` (same as `radiant generate`)
2. Watches the `radiant/` directory with chokidar (ignoring generated outputs)
3. On any `.radiant` file change, debounces for 100ms, then recompiles
4. In dev mode, compilation errors are printed but the process does not exit — you fix and save again

This is the primary development workflow: run `radiant dev` in one terminal and `bun run --hot src/index.ts` in another.

### `radiant db:sync`

Sync the database schema against the compiled `.radiant` schema.

```bash
radiant db:sync
radiant db:sync --force
radiant db:sync --dir ./radiant
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-d, --dir <path>` | Path to the `radiant/` directory | `./radiant` |
| `--force` | Apply destructive changes (drop orphaned tables/columns) | `false` |

**What it does:**

1. Loads the compiled `radiant/runtime/schema.json`
2. Reads `DATABASE_URL` from the environment (or `.env` file)
3. Creates a database adapter based on the URL scheme:
   - `file:` / `sqlite:` → SQLite adapter
   - `postgres:` / `postgresql:` → PostgreSQL adapter
   - `mongodb:` / `mongodb+srv:` → MongoDB adapter
   - `redis:` → Redis adapter
   - `http:` / `https:` → SurrealDB adapter
4. Computes a schema diff:
   - **Tables to create** — collections that don't exist in the database
   - **Columns to add** — fields that don't exist in existing tables
   - **Tables to drop** — database tables not in the schema (orphaned)
   - **Columns to drop** — database columns not in the schema (orphaned)
5. Prints the diff report
6. Applies non-destructive changes (create tables, add columns)
7. Applies destructive changes only if `--force` is provided
8. In production (`NODE_ENV=production`), destructive changes are always skipped unless `--force`

**Example output:**

```
📡 Connecting to database...
📊 Comparing schema against database...

  + Tables to create:
      + todos
  + Columns to add:
      + users.role
  - Columns to drop:
      - users.legacyField

  ⚠ Skipping destructive changes (no --force flag).

⚙️  Applying changes...
  + Creating table: todos
  + Adding column: users.role

✅ Schema sync complete.
```

### `radiant lsp`

Run the Radiant Language Server (for editor integration).

```bash
radiant lsp
```

This starts the LSP server on stdio. It's used by the VS Code extension. You typically don't run this manually — the editor launches it.

See [Editor Support](./editor-support) for details.

## Project Lifecycle

Here's the typical workflow:

```bash
# 1. Initialize a new project
radiant init --dir my-app
cd my-app

# 2. Edit your schema
# Edit radiant/config.radiant, add collection files, etc.

# 3. Start the dev watcher (recompiles on save)
radiant dev

# 4. In another terminal, start the server
bun run --hot src/index.ts

# 5. After schema changes, sync the database
radiant db:sync

# 6. For production builds
radiant generate
bun build src/index.ts --outdir dist --target bun
```

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Compilation error (lexing, parsing, or semantic) or missing prerequisites |
# Project Agent Guide

- Keep answers concise. Prefer one clear recommendation over multiple options.
- Never use the word "codex" in branch names, commit messages, pull request titles, or pull request descriptions.
- Use `bun` for project commands. Do not use npm, yarn, or pnpm for install/build/test workflows.
- Do not edit generated files unless the user explicitly asks for it.
- Preserve existing user changes in the working tree.
- Treat TypeScript errors as first-class failures: run the relevant type check for touched TypeScript files and fix type errors before handing work back.
- Always run a build (e.g., `bun run build`) to validate that your changes haven't broken the repository before handing work back to the user.
- Always run tests (either the full test suite via `bun run test` or the specific tests for the modified files) to validate your changes.
- Golden rule: Radiant is a Bun-first developer experience. Compile-time abstractions should lower to native Bun runtime behavior wherever possible; avoid carrying Radiant-only syntax or framework indirection into compiled/server hot paths unless there is no practical Bun-native equivalent.
- **Mandatory Implementation Plan:** Going forward, you must *always* create an implementation plan before making any changes of any kind, no matter how small the change is.
- **Clean Workspace Rule:** Next time you're doing anything and you want to debug or test, make sure you create a single folder for all that. When you're done, just delete the folder.
- **STRICT EXECUTION GATE:** After presenting an implementation plan, you are strictly forbidden from writing code, modifying files, running modifying commands, or creating task lists until the user replies with the exact word **"APPROVED"** or explicitly clicks the Proceed button. If the user replies with *anything else* (e.g., "looks fine", "I don't have a problem with this", or just makes a comment), you MUST treat it as a discussion and continue waiting. You cannot assume implicit approval under any circumstance.
- **Question Rule:** Whenever you see a question mark at the end of any sentence, it is usually a question. That means no action should be performed other than responding to the question.
- **Runtime IP Rule:** Radiant will never be shipped as raw source code. What is shipped to the client is the heavily minified and tree-shaken `@codesordinatestudio/radiant` package. Radiant is protected under IP through this strict ESM minification strategy. We do not distribute readable framework internals. All imports should target `@codesordinatestudio/radiant` or its sub-modules safely.
- **Plugin Separation Rule:** Plugins are standalone items so they can be maintained and scaled individually. They interact with the single, unified `@codesordinatestudio/radiant` package. Do not bundle them tightly into the core package unless they are first-party core plugins.
## Repo Shape

This is a Bun monorepo powered by Turborepo with packages, plugins, docs, and examples:

- `runtime/bun` - The unified package. Contains the Bun TS runtime, shared types, runtime contracts, adapters, cache, auth, and utilities.
- `runtime/go` - (Future) The Go runtime.
- `packages/create-radiant` - project generator.
- `packages/cli` - The DSL Parser and CLI Engine.
- `plugins/*` - first-party plugin packages.
- `examples/*` - example applications
- `docs` - documentation site

## Commands

```bash
turbo run dev
turbo run build
turbo run test
turbo run lint
```

Use narrower package scripts when changing a single workspace, for example:

```bash
cd packages/bun && bun run build
cd packages/core && bun run build
cd plugins/postgres && bun run build
```

## Engineering Notes

- Prefer the existing plugin and package boundaries.
- Keep runtime-agnostic contracts in `packages/core`.
- Keep Bun-specific runtime behavior in `packages/bun`.
- Keep provider-specific integrations in `plugins/*`.
- Add or update focused tests when changing shared behavior, runtime behavior, or plugin contracts.

- **Single Source of Truth Rule:** You must always look at the `docs/radiant_lifecycle.md` file before you make any change at all because that file shows a proper flow and we've already come up with some syntax that we need done. So going forward, you don't do anything again without looking at that file. Every question I ask, every change you have to make, every alter you have to alter the codebase, you must refer to that file as a single source of truth before anything else.
- **Port First Rule (TypeScript runtime):** Everything you implement going forward for the TypeScript Runtime MUST first be checked against `Lucent Bun`. If Lucent Bun already implemented it, you must COPY it and ADAPT it to fit the new Radiant architecture, rather than retyping it from scratch. This ensures we move fast and close out the TypeScript side quickly.
- **Benchmark Standard Rule:** Whenever any major code block is written or edited, or whenever a core function is changed, edited, or modified, you MUST run the bench test (`bun run compare.ts` in `examples/bench`). Mark the current benchmark as the last benchmark run. The safe standard to maintain is: we should always pass Elysia on the hello test, and we should not let Elysia pass us by more than 3,000 on the schema test.

- **Local Package Linking Rule:** NEVER suggest running manual `bun link <package-name>` terminal commands for local development. The ONLY acceptable way to link local packages is by attaching them directly in the `package.json` dependencies using the `link:` prefix (e.g., `"@codesordinatestudio/radiant-bun": "link:@codesordinatestudio/radiant-bun"`). Once packages are globally linked, this is the strictly enforced method for binding them in any generated or test project until they are officially published.

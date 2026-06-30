import { resolve } from 'path';
import pc from 'picocolors';
import { readFileSync, existsSync } from 'fs';
import type { RadiantAST, RadiantAdapter } from '@codesordinatestudio/radiant-bun/core';

export async function dbSyncCommand(options: { force?: boolean, dir?: string }) {
  const dir = options.dir || resolve(process.cwd(), 'radiant');
  const rootDir = resolve(dir, '..');

  // 1. Load the compiled schema
  const schemaPath = resolve(dir, 'runtime', 'schema.json');
  if (!existsSync(schemaPath)) {
    console.error(pc.red(`\n✖ Schema not found at ${schemaPath}`));
    console.error(pc.dim(`  Run ${pc.green('radiant generate')} first to compile your config.radiant.`));
    process.exit(1);
  }

  const schema: RadiantAST = JSON.parse(readFileSync(schemaPath, 'utf-8'));

  // 2. Read DATABASE_URL from env (load .env if present)
  const envPath = resolve(rootDir, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(pc.red('\n✖ DATABASE_URL is not set in environment or .env file.'));
    process.exit(1);
  }

  // 3. Create the adapter based on the URL scheme
  const adapter = await createAdapterFromUrl(dbUrl, rootDir);

  console.log(pc.cyan(`\n📡 Connecting to database...`));
  await adapter.connect();

  // 4. Run the schema diff
  console.log(pc.cyan(`📊 Comparing schema against database...\n`));

  const report = await computeSchemaDiff(adapter, schema, options.force ?? false);

  // 5. Print the report
  printDiffReport(report);

  // 6. Apply changes
  if (report.toCreate.length > 0 || report.toAdd.length > 0 || (options.force && (report.toDropTable.length > 0 || report.toDropColumn.length > 0))) {
    console.log(pc.cyan(`\n⚙️  Applying changes...\n`));
    await applyChanges(adapter, report, options.force ?? false);
    console.log(pc.green('\n✅ Schema sync complete.\n'));
  } else {
    console.log(pc.green('\n✅ Database is already in sync with schema. Nothing to do.\n'));
  }

  await adapter.disconnect();
}

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface DiffReport {
  toCreate: { table: string; collection: any }[];
  toAdd: { table: string; column: string; field: any }[];
  toDropTable: { table: string }[];
  toDropColumn: { table: string; column: string }[];
}

// ──────────────────────────────────────────────────────────────
// Create adapter from URL
// ──────────────────────────────────────────────────────────────

async function createAdapterFromUrl(url: string, projectRoot: string): Promise<RadiantAdapter> {
  const scheme = new URL(url).protocol.replace(':', '');

  // Resolve plugin packages from the user's project node_modules,
  // not from the CLI's bundled dependencies.
  const resolveFromProject = (pkg: string): string => {
    return require.resolve(pkg, { paths: [projectRoot] });
  };

  switch (scheme) {
    case 'postgres':
    case 'postgresql': {
      const mod = await import(resolveFromProject('@codesordinatestudio/radiant-plugin-postgres'));
      return new mod.PostgresAdapter(url);
    }
    case 'file': {
      const mod = await import(resolveFromProject('@codesordinatestudio/radiant-plugin-sqlite'));
      return new mod.SQLiteAdapter(url.replace('file:', ''));
    }
    case 'mongodb':
    case 'mongodb+srv': {
      const mod = await import(resolveFromProject('@codesordinatestudio/radiant-plugin-mongodb'));
      return new mod.MongoDBAdapter({ url });
    }
    case 'redis': {
      const mod = await import(resolveFromProject('@codesordinatestudio/radiant-plugin-redis-db'));
      return new mod.RedisAdapter(url);
    }
    case 'http':
    case 'https': {
      const mod = await import(resolveFromProject('@codesordinatestudio/radiant-plugin-surrealdb'));
      const user = process.env.SURREAL_USER || 'root';
      const pass = process.env.SURREAL_PASS || 'root';
      const ns = process.env.SURREAL_NS || 'test';
      const db = process.env.SURREAL_DB || 'test';
      return new mod.SurrealDBAdapter({ url, user, pass, ns, db });
    }
    default: {
      // Fallback: try SQLite with the raw path
      const mod = await import(resolveFromProject('@codesordinatestudio/radiant-plugin-sqlite'));
      return new mod.SQLiteAdapter(url);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Compute schema diff
// ──────────────────────────────────────────────────────────────

async function computeSchemaDiff(adapter: RadiantAdapter, schema: RadiantAST, force: boolean): Promise<DiffReport> {
  const report: DiffReport = {
    toCreate: [],
    toAdd: [],
    toDropTable: [],
    toDropColumn: [],
  };

  // Init system tables first
  if (adapter.getSystemTableStatements && adapter.raw) {
    const stmts = adapter.getSystemTableStatements();
    for (const stmt of stmts) {
      await adapter.raw(stmt);
    }
  }

  if (!adapter.getCurrentSchema || !adapter.createTableDDL || !adapter.addColumnDDL) {
    return report; // Adapter doesn't support schema diffing
  }

  const currentSchema = await adapter.getCurrentSchema();
  const existingTables = new Set(currentSchema.tables);
  const configuredTables = new Set(schema.collections.map(c => c.slug));

  // Orphaned tables
  for (const existingTable of existingTables) {
    if (
      existingTable !== 'radiant_migrations' &&
      existingTable !== 'radiant_refresh_tokens' &&
      !configuredTables.has(existingTable)
    ) {
      report.toDropTable.push({ table: existingTable });
    }
  }

  // Missing tables and missing columns
  for (const collection of schema.collections) {
    const tableName = collection.slug;

    if (!existingTables.has(tableName)) {
      report.toCreate.push({ table: tableName, collection });
    } else {
      const existingColumnsArray = currentSchema.columns[tableName] || [];
      const existingColumnNames = new Set(existingColumnsArray.map((c: string) => c.split(' ')[0].replace(/"/g, '')));
      const configuredFields = new Set(collection.fields.map((f: any) => f.name));

      // Missing columns
      for (const field of collection.fields) {
        if (!existingColumnNames.has(field.name)) {
          report.toAdd.push({ table: tableName, column: field.name, field });
        }
      }

      // Orphaned columns
      for (const colName of existingColumnNames) {
        if (colName === 'id' || colName === 'createdAt' || colName === 'updatedAt') continue;
        if (!configuredFields.has(colName)) {
          report.toDropColumn.push({ table: tableName, column: colName });
        }
      }
    }
  }

  return report;
}

// ──────────────────────────────────────────────────────────────
// Print diff report
// ──────────────────────────────────────────────────────────────

function printDiffReport(report: DiffReport) {
  if (report.toCreate.length > 0) {
    console.log(pc.green('  + Tables to create:'));
    for (const { table } of report.toCreate) {
      console.log(pc.green(`      + ${table}`));
    }
  }

  if (report.toAdd.length > 0) {
    console.log(pc.green('  + Columns to add:'));
    for (const { table, column } of report.toAdd) {
      console.log(pc.green(`      + ${table}.${column}`));
    }
  }

  if (report.toDropTable.length > 0) {
    if (report.toDropTable.length > 0) {
      console.log(pc.red('  - Tables to drop:'));
      for (const { table } of report.toDropTable) {
        console.log(pc.red(`      - ${table}`));
      }
    }
  }

  if (report.toDropColumn.length > 0) {
    console.log(pc.red('  - Columns to drop:'));
    for (const { table, column } of report.toDropColumn) {
      console.log(pc.red(`      - ${table}.${column}`));
    }
  }

  if (report.toDropTable.length > 0 || report.toDropColumn.length > 0) {
    if (process.env.NODE_ENV === 'production') {
      console.log(pc.yellow('\n  ⚠ Production mode: destructive changes are skipped by default.'));
      console.log(pc.yellow(`  ⚠ Use ${pc.green('--force')} to apply them.`));
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Apply changes
// ──────────────────────────────────────────────────────────────

async function applyChanges(adapter: RadiantAdapter, report: DiffReport, force: boolean) {
  // Create missing tables
  for (const { collection } of report.toCreate) {
    if (adapter.createTableDDL && adapter.raw) {
      const ddl = adapter.createTableDDL(collection);
      console.log(pc.green(`  + Creating table: ${collection.slug}`));
      await adapter.raw(ddl);
    }
  }

  // Add missing columns
  for (const { table, column, field } of report.toAdd) {
    if (adapter.addColumnDDL && adapter.raw) {
      const ddl = adapter.addColumnDDL(table, field);
      if (ddl) {
        console.log(pc.green(`  + Adding column: ${table}.${column}`));
        await adapter.raw(ddl);
      }
    }
  }

  // Drop orphaned tables/columns only with --force
  if (force) {
    for (const { table } of report.toDropTable) {
      if (adapter.dropTableDDL && adapter.raw) {
        console.log(pc.red(`  - Dropping table: ${table}`));
        await adapter.raw(adapter.dropTableDDL(table));
      }
    }

    for (const { table, column } of report.toDropColumn) {
      if (adapter.dropColumnDDL && adapter.raw) {
        console.log(pc.red(`  - Dropping column: ${table}.${column}`));
        await adapter.raw(adapter.dropColumnDDL(table, column));
      }
    }
  } else {
    if (report.toDropTable.length > 0 || report.toDropColumn.length > 0) {
      console.log(pc.yellow('\n  ⚠ Skipping destructive changes (no --force flag).'));
    }
  }
}
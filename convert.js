const fs = require('fs');
let code = fs.readFileSync('plugins/ts/sqlite/src/adapter.ts', 'utf8');

// Replace imports
code = code.replace(/import \{ sql, SQL \} from "bun";\nimport postgresJs from "postgres";/, 'import { Database } from "bun:sqlite";');
code = code.replace(/PostgresAdapter/g, 'SQLiteAdapter');
code = code.replace(/adapterType = "postgres"/g, 'adapterType = "sqlite"');

// Replace constructor & connection logic
code = code.replace(/private db: any = null;/g, 'private db: Database | null = null;');
code = code.replace(/private poolMax: number;\n  private pgBouncer: boolean;/g, '');
code = code.replace(/constructor\(url: string, poolMax = 10, pgBouncer = false\) \{\n    this\.url = url;\n    this\.poolMax = poolMax;\n    this\.pgBouncer = pgBouncer;\n  \}/, 'constructor(url: string) { this.url = url === "sqlite::memory:" ? ":memory:" : url; }');

// Replace initDb and closeDb
code = code.replace(/private initDb\(\) \{[\s\S]*?\}/, 'private initDb() {\n    this.db = new Database(this.url);\n  }');
code = code.replace(/private async closeDb[\s\S]*?\}/, 'private async closeDb(dbInstance: any) {\n    if (dbInstance) dbInstance.close();\n  }');

// Replace connect() to just initDb and skip Postgres auto-create
code = code.replace(/async connect\(\): Promise<void> \{[\s\S]*?\}\n\n  \/\*\*/, `async connect(): Promise<void> {
    this.initDb();
    this.db!.query("SELECT 1").get();
  }

  /**`);

// Replace raw query execution
code = code.replace(/await this\.db\.unsafe\(sql, params\)/g, 'this.db!.query(sql).all(...(params || []))');
code = code.replace(/await this\.db\.unsafe\(sql\)/g, 'this.db!.query(sql).all()');

// Replace find() execution
// Postgres adapter does: const results = (await this.db.unsafe(sqlStr, params)) as any[];
code = code.replace(/const results = \(await this\.db\.unsafe\(sqlStr, params\)\) as any\[\];/g, 
  'const stmt = this.db!.query(sqlStr);\n    const results = stmt.all(...params) as any[];');

// Replace single findById execution
code = code.replace(/const results = await this\.db\.unsafe\(`SELECT \* FROM \${pgIdentifier\(collection\)} WHERE id = \$$1`, \[id\]\);/g, 
  'const results = this.db!.query(`SELECT * FROM ${pgIdentifier(collection)} WHERE id = ?`).all(id) as any[];');
  
code = code.replace(/const results = await this\.db\.unsafe\(`SELECT \* FROM \${pgIdentifier\(collection\)} WHERE id = ANY\(\$$1\)`, \[ids\]\);/g, 
  'const results = this.db!.query(`SELECT * FROM ${pgIdentifier(collection)} WHERE id IN (${ids.map(() => "?").join(", ")})`).all(...ids) as any[];');


// Replace create execution
code = code.replace(/const results = await this\.db\.unsafe\(sqlStr, params\);/g, 
  'const results = this.db!.query(sqlStr + " RETURNING *").all(...params) as any[];');

code = code.replace(/await this\.db\.unsafe\(`DELETE FROM \${pgIdentifier\(collection\)} WHERE id = \$$1`, \[id\]\);/g, 
  'this.db!.query(`DELETE FROM ${pgIdentifier(collection)} WHERE id = ?`).run(id);');

// Replace param placeholders: Postgres uses $1, $2. SQLite uses ?
code = code.replace(/\`\\\$\$\{params\.length\}\`/g, '"?"');
code = code.replace(/\`\\\$\$\{idx\}\`/g, '"?"');
code = code.replace(/\`\\\$\$\{localIndex\}\`/g, '"?"');
code = code.replace(/\`\$\$\{params\.length\}\`/g, '"?"');

// Replace count query
code = code.replace(/const results = await this\.db\.unsafe\(sqlStr, params\);[\s\S]*?return Number\(results\[0\]\.count\);/g, 
  `const stmt = this.db!.query(sqlStr);\n    const results = stmt.all(...params) as any[];\n    return Number(results[0]?.count || 0);`);

// Replace raw method
code = code.replace(/async raw\(sql: string, params\?: unknown\[\]\): Promise<unknown> \{[\s\S]*?\}/g, 
  `async raw(sql: string, params?: unknown[]): Promise<unknown> {
    if (!this.db) throw new Error("Database not connected");
    if (sql.trim().toUpperCase().startsWith("SELECT") || sql.trim().toUpperCase().startsWith("PRAGMA")) {
      return this.db.query(sql).all(...(params || []));
    } else {
      return this.db.query(sql).run(...(params || []));
    }
  }`);

// Postgres specific constraint parser
code = code.replace(/parseConstraintError\(error: unknown\): ParsedConstraintError \| null \{[\s\S]*?createTableDDL/g, 
  `parseConstraintError(error: unknown): ParsedConstraintError | null {
    const err = error as any;
    const msg = err?.message || "";
    if (msg.includes("UNIQUE constraint failed")) {
      const parts = msg.split(":");
      return { type: "unique", rawMessage: msg, constraint: parts[1]?.trim() };
    }
    return null;
  }
  createTableDDL`);

// Schema info
code = code.replace(/async getCurrentSchema\(\)[\s\S]*?return \{ tables, columns \};\n  \}/g, `async getCurrentSchema() {
    const tablesRaw = this.db!.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tables = tablesRaw.map((r) => r.name);
    const columns: Record<string, string[]> = {};
    for (const table of tables) {
      const colsRaw = this.db!.query(\`PRAGMA table_info("\${table}")\`).all() as any[];
      columns[table] = colsRaw.map((c) => c.name);
    }
    return { tables, columns };
  }`);

fs.writeFileSync('plugins/ts/sqlite/src/adapter.ts', code);

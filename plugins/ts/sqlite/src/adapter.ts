import { Database } from "bun:sqlite";
import type {
  RadiantAdapter,
  QueryArgs,
  PaginatedResult as QueryResult,
  CollectionConfig as Collection,
  ParsedConstraintError,
} from "@codesordinatestudio/radiant-bun/core";
import {
  generateSystemTables,
  generateCreateTable,
  generateAddColumn,
  generateRenameColumn,
  buildTable,
  buildColumns,
} from "./ddl/schema";

function pgIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class SQLiteAdapter implements RadiantAdapter {
  readonly adapterType = "sqlite";
  readonly supportsGeneratedConstraintSQL = true;
  private db: Database | null = null;
  private url: string;
  private _createdDbName: string | null = null;
  private _numericFields = new Map<string, Set<string>>();
  private _jsonFields = new Map<string, Set<string>>();
  private _relationshipTargets = new Map<string, string>();
  private _searchableFields = new Map<string, Set<string>>();
  private _knownFields = new Map<string, Set<string>>();

  constructor(url: string) {
    this.url = url === "sqlite::memory:" ? ":memory:" : url;
  }

  private initDb() {
    this.db = new Database(this.url);
  }

  private async closeDb(dbInstance: any) {
    if (dbInstance) dbInstance.close();
  }

  get createdDbName(): string | null {
    return this._createdDbName;
  }

  getStartupInfo(): { createdResourceName?: string | null } {
    return { createdResourceName: this._createdDbName };
  }

  configureCollections(collections: Collection[]): void {
    for (const col of collections) {
      const nums = new Set<string>();
      const jsons = new Set<string>();
      const searchable = new Set<string>();
      const known = new Set<string>(["id"]);
      for (const f of col.fields) {
        known.add(f.name);
        if (f.type === "number" || f.type === "integer") {
          nums.add(f.name);
        }
        if (f.type === "json" || f.type === "richtext" || f.type === "array" || f.type === "upload") {
          jsons.add(f.name);
        }
        if (f.type === "relationship" && f.target) {
          this._relationshipTargets.set(`${col.slug}.${f.name}`, f.target);
        }
      }
      known.add("createdAt");
      known.add("updatedAt");
      if (nums.size > 0) this._numericFields.set(col.slug, nums);
      if (jsons.size > 0) this._jsonFields.set(col.slug, jsons);
      if (searchable.size > 0) this._searchableFields.set(col.slug, searchable);
      this._knownFields.set(col.slug, known);
    }
  }

  registerCollections(collections: Collection[]): void {
    this.configureCollections(collections);
  }

  async connect(): Promise<void> {
    this.initDb();
    this.db!.query("SELECT 1").get();
  }

  async disconnect(): Promise<void> {
    await this.closeDb(this.db);
    this.db = null;
  }

  async ping(): Promise<void> {
    try {
      this.db!.query("SELECT 1").get();
    } catch (err: any) {
      throw err;
    }
  }

  getSystemTableStatements(): string[] {
    return generateSystemTables();
  }

  async getCurrentSchema() {
    const tablesRaw = this.db!.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tables = tablesRaw.map((r) => r.name);
    const columns: Record<string, string[]> = {};
    for (const table of tables) {
      const colsRaw = this.db!.query(`PRAGMA table_info("${table}")`).all() as any[];
      columns[table] = colsRaw.map((c) => c.name);
    }
    return { tables, columns };
  }

  async recordMigration(version: string, description: string): Promise<void> {
    const id = crypto.randomUUID();
    this.db!.query(`INSERT INTO radiant_migrations (id, version, description) VALUES (?, ?, ?)`).run(id, version, description);
  }

  async getCurrentMigrationVersion(): Promise<string | null> {
    const res = this.db!.query(`SELECT version FROM radiant_migrations ORDER BY applied_at DESC LIMIT 1`).all() as any[];
    return res[0]?.version || null;
  }

  parseConstraintError(error: unknown): ParsedConstraintError | null {
    const err = error as any;
    const msg = err?.message || "";
    if (msg.includes("UNIQUE constraint failed")) {
      const parts = msg.split(":");
      return { type: "unique", rawMessage: msg, constraint: parts[1]?.trim() };
    }
    return null;
  }

  createTableDDL(table: unknown): string {
    return generateCreateTable(buildTable(table as any));
  }

  renameColumnDDL(table: string, oldName: string, newName: string): string {
    return generateRenameColumn(table, oldName, newName);
  }

  addColumnDDL(table: string, column: unknown): string | null {
    // buildColumns converts fields to ColumnDefinitions. 
    // We create a mock collection to convert the single field.
    const cols = buildColumns({ slug: table, fields: [column as any] } as any);
    // The field we want is the one right after 'id' (which is index 1 since buildColumns adds 'id' at index 0)
    const colDef = cols.find(c => c.name === (column as any).name);
    if (!colDef) return null;
    return generateAddColumn(table, colDef);
  }

  dropColumnDDL(table: string, column: string): string {
    return `ALTER TABLE ${pgIdentifier(table)} DROP COLUMN "${column}";`;
  }

  dropTableDDL(table: string): string {
    return `DROP TABLE IF EXISTS ${pgIdentifier(table)};`;
  }

  private deserializeRow(collection: string, row: any): any {
    if (!row) return row;
    const nums = this._numericFields.get(collection);
    const jsons = this._jsonFields.get(collection);
    const obj = { ...row };
    
    if (nums) {
      for (const k of nums) {
        if (typeof obj[k] === "string") {
          const parsed = Number(obj[k]);
          if (!isNaN(parsed)) obj[k] = parsed;
        }
      }
    }
    if (jsons) {
      for (const k of jsons) {
        if (typeof obj[k] === "string") {
          try {
            obj[k] = JSON.parse(obj[k]);
          } catch {}
        }
      }
    }
    return obj;
  }

  private buildWhere(where: any, collection: string, params: any[]): string {
    if (!where || Object.keys(where).length === 0) return "";
    const clauses: string[] = [];

    if (where.OR) {
      const orClauses = where.OR.map((cond: any) => this.buildWhere(cond, collection, params)).filter(Boolean);
      if (orClauses.length > 0) clauses.push(`(${orClauses.join(" OR ")})`);
    }
    if (where.AND) {
      const andClauses = where.AND.map((cond: any) => this.buildWhere(cond, collection, params)).filter(Boolean);
      if (andClauses.length > 0) clauses.push(`(${andClauses.join(" AND ")})`);
    }

    const known = this._knownFields.get(collection);
    for (const [key, value] of Object.entries(where)) {
      if (key === "OR" || key === "AND") continue;
      
      const realKey = key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const ops = value as any;
        for (const [op, val] of Object.entries(ops)) {
          if (op === "eq") {
            params.push(val);
            clauses.push(`"${realKey}" = ?`);
          } else if (op === "neq") {
            params.push(val);
            clauses.push(`"${realKey}" != ?`);
          } else if (op === "gt") {
            params.push(val);
            clauses.push(`"${realKey}" > ?`);
          } else if (op === "gte") {
            params.push(val);
            clauses.push(`"${realKey}" >= ?`);
          } else if (op === "lt") {
            params.push(val);
            clauses.push(`"${realKey}" < ?`);
          } else if (op === "lte") {
            params.push(val);
            clauses.push(`"${realKey}" <= ?`);
          } else if (op === "in" && Array.isArray(val) && val.length > 0) {
            const placeholders = val.map(() => { params.push(val); return "?"; }).join(", ");
            clauses.push(`"${realKey}" IN (${placeholders})`);
          } else if (op === "nin" && Array.isArray(val) && val.length > 0) {
            const placeholders = val.map(() => { params.push(val); return "?"; }).join(", ");
            clauses.push(`"${realKey}" NOT IN (${placeholders})`);
          } else if (op === "like") {
            params.push(val);
            clauses.push(`"${realKey}" LIKE ?`);
          }
        }
      } else {
        params.push(value);
        clauses.push(`"${realKey}" = ?`);
      }
    }
    return clauses.join(" AND ");
  }

  async find(collection: string, query: QueryArgs<any>): Promise<QueryResult> {
    if (!this.db) throw new Error("Database not connected");
    const params: any[] = [];
    let sqlStr = `SELECT * FROM ${pgIdentifier(collection)}`;
    
    const whereStr = this.buildWhere(query.where, collection, params);
    if (whereStr) sqlStr += ` WHERE ${whereStr}`;

    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const field = isDesc ? query.sort.substring(1) : query.sort;
      sqlStr += ` ORDER BY "${field}" ${isDesc ? "DESC" : "ASC"}`;
    }

    const limit = query.limit || 10;
    const page = query.page || 1;
    const offset = (page - 1) * limit;

    sqlStr += ` LIMIT ${limit} OFFSET ${offset}`;

    const stmt = this.db.query(sqlStr);
    const results = stmt.all(...(params as any[])) as any[];

    // total count
    let countSql = `SELECT COUNT(*) as count FROM ${pgIdentifier(collection)}`;
    if (whereStr) countSql += ` WHERE ${whereStr}`;
    const countRes = this.db.query(countSql).all(...(params as any[])) as any[];
    const totalDocs = Number(countRes[0]?.count || 0);

    const totalPages = Math.ceil(totalDocs / limit);

    return {
      docs: results.map((r: any) => this.deserializeRow(collection, r)),
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
    if (!this.db) throw new Error("Database not connected");
    const results = this.db.query(`SELECT * FROM ${pgIdentifier(collection)} WHERE id = ?`).all(id) as any[];
    if (!results || results.length === 0) return null;
    return this.deserializeRow(collection, results[0]);
  }

  async findByIds(collection: string, ids: string[]): Promise<Record<string, unknown>[]> {
    if (!this.db) throw new Error("Database not connected");
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const results = this.db.query(`SELECT * FROM ${pgIdentifier(collection)} WHERE id IN (${placeholders})`).all(...ids) as any[];
    return results.map((r: any) => this.deserializeRow(collection, r));
  }

  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.db) throw new Error("Database not connected");
    const keys = Object.keys(data);
    const values = Object.values(data).map(v => typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v);
    
    const keyStr = keys.map(k => `"${k}"`).join(", ");
    const valStr = keys.map(() => "?").join(", ");
    
    const sqlStr = `INSERT INTO ${pgIdentifier(collection)} (${keyStr}) VALUES (${valStr}) RETURNING *`;
    const results = this.db.query(sqlStr).all(...(values as any[])) as any[];
    return this.deserializeRow(collection, results[0]);
  }

  async createMany(collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (!this.db) throw new Error("Database not connected");
    if (!docs.length) return [];
    
    const keys = Object.keys(docs[0]!);
    const keyStr = keys.map(k => `"${k}"`).join(", ");
    
    const allValues: any[] = [];
    const valStrs = docs.map(doc => {
      keys.forEach(k => {
        const v = doc[k];
        allValues.push(typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v);
      });
      return `(${keys.map(() => "?").join(", ")})`;
    });
    
    const sqlStr = `INSERT INTO ${pgIdentifier(collection)} (${keyStr}) VALUES ${valStrs.join(", ")} RETURNING *`;
    const results = this.db.query(sqlStr).all(...(allValues as any[])) as any[];
    return results.map((r: any) => this.deserializeRow(collection, r));
  }

  async update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.db) throw new Error("Database not connected");
    const keys = Object.keys(data);
    if (!keys.length) return this.findById(collection, id) as Promise<Record<string, unknown>>;
    
    const setStr = keys.map(k => `"${k}" = ?`).join(", ");
    const values = Object.values(data).map(v => typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v);
    values.push(id);
    
    const sqlStr = `UPDATE ${pgIdentifier(collection)} SET ${setStr} WHERE id = ? RETURNING *`;
    const results = this.db.query(sqlStr).all(...(values as any[])) as any[];
    if (!results || results.length === 0) throw new Error("Document not found");
    return this.deserializeRow(collection, results[0]);
  }

  async delete(collection: string, id: string): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    this.db.query(`DELETE FROM ${pgIdentifier(collection)} WHERE id = ?`).run(id);
  }

  async deleteMany(collection: string, ids: string[]): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    if (!ids.length) return;
    const placeholders = ids.map(() => "?").join(", ");
    this.db.query(`DELETE FROM ${pgIdentifier(collection)} WHERE id IN (${placeholders})`).run(...ids);
  }

  async count(collection: string, query?: Pick<QueryArgs<any>, "where">): Promise<number> {
    if (!this.db) throw new Error("Database not connected");
    const params: any[] = [];
    let sqlStr = `SELECT COUNT(*) as count FROM ${pgIdentifier(collection)}`;
    if (query?.where) {
      const whereStr = this.buildWhere(query.where, collection, params);
      if (whereStr) sqlStr += ` WHERE ${whereStr}`;
    }
    const countRes = this.db.query(sqlStr).all(...(params as any[])) as any[];
    return Number(countRes[0]?.count || 0);
  }

  async raw(sql: string, params?: unknown[]): Promise<unknown> {
    if (!this.db) throw new Error("Database not connected");
    const bindings = (params || []) as any[];
    if (sql.trim().toUpperCase().startsWith("SELECT") || sql.trim().toUpperCase().startsWith("PRAGMA")) {
      return this.db.query(sql).all(...bindings);
    } else {
      return this.db.query(sql).run(...bindings);
    }
  }
}

// PostgreSQL Adapter using Bun SQL
// Version: 0.0.4

import { sql, SQL } from "bun";
import postgresJs from "postgres";
import type {
  RadiantAdapter as RadiantAdapter,
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
import type { TableDefinition, ColumnDefinition } from "./ddl/schema";

function pgIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function pgLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * PostgreSQL adapter using Bun's native SQL driver.
 */
export class PostgresAdapter implements RadiantAdapter {
  readonly adapterType = "postgres";
  readonly supportsGeneratedConstraintSQL = true;
  private db: any = null;
  private url: string;
  private poolMax: number;
  private pgBouncer: boolean;
  /** Set after connect() if the database was auto-created. */
  private _createdDbName: string | null = null;
  /** Maps collection slug → set of field names that are NUMERIC/INTEGER (returned as strings by Bun SQL). */
  private _numericFields = new Map<string, Set<string>>();
  /** Maps collection slug → set of field names backed by JSONB/JSON columns. */
  private _jsonFields = new Map<string, Set<string>>();
  /** Maps "collectionSlug.fieldName" → related collection slug for dot-notation filtering. */
  private _relationshipTargets = new Map<string, string>();
  /** Maps collection slug → set of field names that have searchable: true (FTS). */
  private _searchableFields = new Map<string, Set<string>>();
  /** Maps collection slug → all field names known to the adapter. */
  private _knownFields = new Map<string, Set<string>>();

  constructor(url: string, poolMax = 10, pgBouncer = false) {
    this.url = url;
    this.poolMax = poolMax;
    this.pgBouncer = pgBouncer;
  }

  private initDb() {
    if (this.pgBouncer) {
      this.db = postgresJs(this.url, { max: this.poolMax, prepare: false });
    } else {
      this.db = new SQL({ url: this.url, max: this.poolMax });
    }
  }

  private async closeDb(dbInstance: any) {
    if (!dbInstance) return;
    if (this.pgBouncer && typeof dbInstance.end === "function") {
      await dbInstance.end().catch(() => {});
    } else if (typeof dbInstance.close === "function") {
      await dbInstance.close().catch(() => {});
    }
  }

  /** Returns the name of the database if it was auto-created during connect(), otherwise null. */
  get createdDbName(): string | null {
    return this._createdDbName;
  }

  getStartupInfo(): { createdResourceName?: string | null } {
    return { createdResourceName: this._createdDbName };
  }

  /**
   * Register collections so the adapter knows which fields are numeric.
   * Bun SQL returns NUMERIC columns as strings to preserve precision;
   * this registry lets `deserializeRow` coerce them back to JS numbers.
   */
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
      if (nums.size > 0) {
        this._numericFields.set(col.slug, nums);
      }
      if (jsons.size > 0) {
        this._jsonFields.set(col.slug, jsons);
      }
      if (searchable.size > 0) {
        this._searchableFields.set(col.slug, searchable);
      }
      this._knownFields.set(col.slug, known);
    }
  }

  registerCollections(collections: Collection[]): void {
    this.configureCollections(collections);
  }

  async connect(): Promise<void> {
    // Try the real connection FIRST. The auto-CREATE-DATABASE probe below opens
    // additional admin connections — running it on every startup leaks sockets
    // under `bun --watch` because rapid restarts don't always drain them in time,
    // eventually triggering Postgres' "too many clients" error.
    this.initDb();
    try {
      await this.db.unsafe("SELECT 1");
      return;
    } catch (err: any) {
      // Only fall through to the auto-create probe if the failure is "database
      // does not exist" (Postgres SQLSTATE 3D000). Anything else is a real error.
      const isMissingDb = err?.code === "3D000" || /database .* does not exist/i.test(err?.message ?? "");
      if (!isMissingDb) {
        await this.closeDb(this.db);
        this.db = null;
        throw err;
      }
      // Discard the broken pool before probing — we'll rebuild it after CREATE.
      await this.closeDb(this.db);
      this.db = null;
    }

    // Auto-create the missing database via a maintenance connection.
    const parsed = new URL(this.url);
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!dbName) {
      throw new Error("Cannot auto-create database: no database name in connection URL");
    }

    const credPart = parsed.username ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@` : "";
    const hostPort = parsed.host;
    const qs = parsed.search;
    const maintenanceCandidates = [
      `postgresql://${credPart}${hostPort}/postgres${qs}`,
      `postgresql://${hostPort}/postgres${qs}`,
      `postgresql://${hostPort}/${parsed.username || "postgres"}${qs}`,
    ];

    let created = false;
    for (const candidateUrl of maintenanceCandidates) {
      const admin: any = this.pgBouncer ? postgresJs(candidateUrl, { max: 1, prepare: false }) : new SQL(candidateUrl);
      try {
        await admin.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
        this._createdDbName = dbName;
        created = true;
        break;
      } catch {
        // try next candidate
      } finally {
        await this.closeDb(admin);
      }
    }

    if (!created) {
      throw new Error(
        `Database "${dbName}" does not exist and could not be auto-created. ` +
          `Create it manually or grant CREATEDB privilege to the connection user.`,
      );
    }

    // Reopen the main pool against the freshly-created database.
    this.initDb();
    await this.db.unsafe("SELECT 1");
  }

  /**
   * Reconnect the pool. Called automatically when a query hits a closed connection.
   */
  private async reconnect(): Promise<void> {
    console.warn("Database connection lost — reconnecting…");
    try {
      if (this.db) await this.closeDb(this.db);
    } catch {
      /* best-effort close */
    }
    this.initDb();
    await this.db.unsafe("SELECT 1");
    console.info("Database reconnected");
  }

  /**
   * Execute a callback, retrying once on connection-closed errors.
   * After reconnect, `this.db` is refreshed so the retry uses the new pool.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "ERR_POSTGRES_CONNECTION_CLOSED") {
        await this.reconnect();
        return await fn();
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.closeDb(this.db);
    }
  }

  async ping(): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    await this.withRetry(() => this.db!.unsafe("SELECT 1") as Promise<any>);
  }

  getSystemTableStatements(): string[] {
    return generateSystemTables();
  }

  async getCurrentSchema(): Promise<{ tables: string[]; columns: Record<string, string[]> }> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(async () => {
      const schema: { tables: string[]; columns: Record<string, string[]> } = {
        tables: [],
        columns: {},
      };

      const tablesResult = (await this.db!.unsafe(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name NOT LIKE 'lucent_%'
          AND table_type = 'BASE TABLE'
      `)) as Array<{ table_name: string }>;

      schema.tables = tablesResult
        .map((row) => row.table_name)
        .filter((name) => name !== "undefined" && name !== "null");

      for (const tableName of schema.tables) {
        const columnsResult = (await this.db!.unsafe(
          `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
          `,
          [tableName],
        )) as Array<{ column_name: string; data_type: string }>;

        schema.columns[tableName] = columnsResult.map((row) => `${row.column_name} ${row.data_type}`);
      }

      return schema;
    });
  }

  async recordMigration(version: string, description: string): Promise<void> {
    await this.raw(
      `INSERT INTO lucent_migrations (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
      [version, description],
    );
  }

  async getCurrentMigrationVersion(): Promise<string | null> {
    const result = (await this.raw(`SELECT version FROM lucent_migrations ORDER BY applied_at DESC LIMIT 1`)) as Array<{
      version: string;
    }>;

    return result[0]?.version || null;
  }

  createTableDDL(collection: unknown): string {
    const tableDef = buildTable(collection as Collection);
    return generateCreateTable(tableDef);
  }

  renameColumnDDL(table: string, oldName: string, newName: string): string {
    return generateRenameColumn(table, oldName, newName);
  }

  addColumnDDL(table: string, field: unknown): string | null {
    // Note: To properly map the field we would ideally need the whole collection,
    // but we can wrap it in a mock collection just to use buildColumns on this single field
    const mockCollection = { slug: table, fields: [field as any], timestamps: false };
    const cols = buildColumns(mockCollection as any);
    // buildColumns always adds 'id', so the generated field is at index 1
    const columnDef = cols.find(c => c.name === (field as any).name);
    if (!columnDef) return null;
    return generateAddColumn(table, columnDef);
  }

  dropColumnDDL(table: string, column: string): string {
    return `ALTER TABLE ${pgIdentifier(table)} DROP COLUMN ${pgIdentifier(column)};`;
  }

  dropTableDDL(table: string): string {
    return `DROP TABLE ${pgIdentifier(table)};`;
  }

  parseConstraintError(error: unknown): ParsedConstraintError | null {
    const message = error instanceof Error ? error.message : String(error);
    const rawMessage = message;

    // PostgreSQL foreign key violation
    // Example: "insert or update on table \"users\" violates foreign key constraint \"users_company_id_fkey\""
    // "Key (company_id)=(123) is not present in table \"companies\"."
    const pgFkMatch =
      message.match(/violates foreign key constraint [""]([^""]+)[""]/i) ||
      message.match(/[""]([^""]+)[""] is not present in table [""]([^""]+)[""]/i);

    if (pgFkMatch) {
      const constraintMatch = message.match(/[""]([^""]+)[""]/);
      const tableMatch = message.match(/on table [""]([^""]+)[""]/i);
      const keyMatch = message.match(/Key \(([^)]+)\)=\(([^)]+)\)/i);

      return {
        type: "foreign_key",
        table: tableMatch?.[1],
        constraint: constraintMatch?.[1],
        referencedTable: pgFkMatch[2] || constraintMatch?.[1]?.replace(/_[a-z_]+_fkey$/, ""),
        column: keyMatch?.[1],
        rawMessage,
      };
    }

    // PostgreSQL unique violation
    const pgUniqueMatch = message.match(/duplicate key.*unique constraint [""]([^""]+)[""]/i);
    if (pgUniqueMatch) {
      const tableMatch = message.match(/on table [""]([^""]+)[""]/i);
      const keyMatch = message.match(/Key \(([^)]+)\)=\(([^)]+)\)/i);
      return {
        type: "unique",
        table: tableMatch?.[1],
        constraint: pgUniqueMatch[1],
        column: keyMatch?.[1],
        rawMessage,
      };
    }

    // PostgreSQL not null violation
    const pgNotNullMatch = message.match(/null value in column [""]([^""]+)[""].*not-null constraint/i);
    if (pgNotNullMatch) {
      const tableMatch = message.match(/on table [""]([^""]+)[""]/i);
      return {
        type: "not_null",
        table: tableMatch?.[1],
        column: pgNotNullMatch[1],
        rawMessage,
      };
    }

    // PostgreSQL check constraint violation
    const pgCheckMatch = message.match(/violates check constraint [""]([^""]+)[""]/i);
    if (pgCheckMatch) {
      const tableMatch = message.match(/for relation [""]([^""]+)[""]/i);
      return {
        type: "check",
        table: tableMatch?.[1],
        constraint: pgCheckMatch[1],
        rawMessage,
      };
    }

    return null;
  }

  async find(collection: string, query: QueryArgs): Promise<QueryResult> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(() => this._find(collection, query));
  }

  private async _find(collection: string, query: QueryArgs): Promise<QueryResult> {
    const { where, sort, limit = 10, page = 1 } = query;

    // Build WHERE clause
    let whereClause = "";
    const params: unknown[] = [];

    if (where) {
      const ctx = { params, paramIndex: 1 };
      const sql = this.buildPgWhere(where as Record<string, unknown>, ctx, collection);
      if (sql) whereClause = "WHERE " + sql;
    }

    // Build ORDER BY clause — supports comma-separated multi-field sort
    let orderClause = "";
    if (sort) {
      const parts = sort
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const orderParts = parts.map((part) => {
        const desc = part.startsWith("-");
        const field = desc ? part.slice(1) : part;
        return `${pgIdentifier(field)} ${desc ? "DESC" : "ASC"}`;
      });
      if (orderParts.length > 0) orderClause = `ORDER BY ${orderParts.join(", ")}`;
    }

    // ---- offset-based pagination (default) ----
    const offset = (page - 1) * limit;

    // Single query: use COUNT(*) OVER() window function to get total count
    // alongside the paginated rows, eliminating one DB round-trip.
    const dataSql =
      `SELECT *, COUNT(*) OVER() AS _total FROM ${pgIdentifier(collection)}` +
      `${whereClause ? " " + whereClause : ""}` +
      `${orderClause ? " " + orderClause : ""}` +
      ` LIMIT ${limit} OFFSET ${offset}`;

    console.debug({ dataSql, params }, "Executing find query");

    const rows = (await this.db!.unsafe(dataSql, params)) as (Record<string, unknown> & { _total?: unknown })[];

    // Extract _total from the first row (all rows carry the same value).
    // If no rows matched, totalDocs is 0.
    const totalDocs = rows.length > 0 ? Number(rows[0]?._total) : 0;

    const docs = rows.map((row: Record<string, unknown>) => {
      // Strip the synthetic _total column before returning.
      const { _total, ...rest } = row;
      return this.deserializeRow(rest, collection);
    });

    const totalPages = Math.ceil(totalDocs / limit);

    return {
      docs,
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(async () => {
      const params: unknown[] = [];
      let whereClause = "";

      if (query?.where) {
        const ctx = { params, paramIndex: 1 };
        const whereSql = this.buildPgWhere(query.where as Record<string, unknown>, ctx, collection);
        if (whereSql) whereClause = "WHERE " + whereSql;
      }

      const countSql = `SELECT COUNT(*) AS cnt FROM ${pgIdentifier(collection)}${whereClause ? " " + whereClause : ""}`;
      console.debug({ countSql, params }, "Executing count query");

      const rows = (await this.db!.unsafe(countSql, params)) as { cnt?: unknown }[];
      return Number(rows[0]?.cnt ?? 0);
    });
  }

  async findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(async () => {
      console.debug({ collection, id }, "Executing findById query");
      const result = await this.db!`SELECT * FROM ${sql(collection)} WHERE id = ${id}`;
      if (result.length === 0) return null;
      return this.deserializeRow(result[0], collection);
    });
  }

  async findByIds(collection: string, ids: string[]): Promise<Record<string, unknown>[]> {
    if (!this.db) throw new Error("Database not connected");
    if (ids.length === 0) return [];
    return this.withRetry(async () => {
      console.debug({ collection, count: ids.length }, "Executing findByIds query");
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
      const result = await this.db!.unsafe(
        `SELECT * FROM ${pgIdentifier(collection)} WHERE id IN (${placeholders})`,
        ids,
      );
      return result.map((row: Record<string, unknown>) => this.deserializeRow(row, collection));
    });
  }

  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(async () => {
      const now = new Date().toISOString();
      const knownFields = this._knownFields.get(collection);
      const rawDoc: Record<string, unknown> = { ...data, id: (data.id as string | undefined) ?? crypto.randomUUID() };
      if (!knownFields || knownFields.has("createdAt")) rawDoc.createdAt = rawDoc.createdAt ?? now;
      if (!knownFields || knownFields.has("updatedAt")) rawDoc.updatedAt = now;
      const doc = this.serializeDocForPg(rawDoc, collection);
      console.debug({ collection, fields: Object.keys(doc) }, "Executing create query");
      const result = await this.db!`INSERT INTO ${sql(collection)} ${sql(doc)} RETURNING *`;
      return this.deserializeRow(result[0], collection);
    });
  }

  async createMany(collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (!this.db) throw new Error("Database not connected");
    if (docs.length === 0) return [];
    return this.withRetry(async () => {
      const now = new Date().toISOString();
      const knownFields = this._knownFields.get(collection);
      const rows = docs.map((data) => {
        const rawDoc: Record<string, unknown> = { ...data, id: (data.id as string | undefined) ?? crypto.randomUUID() };
        if (!knownFields || knownFields.has("createdAt")) rawDoc.createdAt = rawDoc.createdAt ?? now;
        if (!knownFields || knownFields.has("updatedAt")) rawDoc.updatedAt = now;
        return this.serializeDocForPg(rawDoc, collection);
      });
      console.debug({ collection, count: rows.length }, "Executing bulk create");
      const result = await this.db!`INSERT INTO ${sql(collection)} ${sql(rows)} RETURNING *`;
      return result.map((row: Record<string, unknown>) => this.deserializeRow(row, collection));
    });
  }

  async update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(async () => {
      const now = new Date().toISOString();
      const knownFields = this._knownFields.get(collection);
      const rawUpdate = { ...data } as Record<string, unknown>;
      if (!knownFields || knownFields.has("updatedAt")) rawUpdate.updatedAt = now;
      const updateData = this.serializeDocForPg(rawUpdate, collection);
      console.debug({ collection, id, fields: Object.keys(updateData) }, "Executing update query");
      const result = await this.db!`UPDATE ${sql(collection)} SET ${sql(updateData)} WHERE id = ${id} RETURNING *`;
      if (result.length === 0) {
        throw new Error(`Document with id '${id}' not found in collection '${collection}'`);
      }
      return this.deserializeRow(result[0], collection);
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    await this.withRetry(async () => {
      console.debug({ collection, id }, "Executing delete query");
      const result = await this.db!`DELETE FROM ${sql(collection)} WHERE id = ${id}`;
      if (result.count === 0) {
        throw new Error(`Document with id '${id}' not found in collection '${collection}'`);
      }
    });
  }

  async deleteMany(collection: string, ids: string[]): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    if (ids.length === 0) return;
    await this.withRetry(async () => {
      console.debug({ collection, count: ids.length }, "Executing bulk delete");
      await this.db!`DELETE FROM ${sql(collection)} WHERE id IN ${sql(ids)}`;
    });
  }

  async raw(sqlQuery: string, params?: unknown[]): Promise<unknown> {
    if (!this.db) throw new Error("Database not connected");
    return this.withRetry(async () => {
      if (params && params.length > 0) {
        return await this.db!.unsafe(sqlQuery, params);
      }
      return await this.db!.unsafe(sqlQuery);
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Deserializes a database row, parsing JSON fields and normalizing dates.
   */
  private deserializeRow(row: Record<string, unknown>, collection?: string): Record<string, unknown> {
    const numericSet = collection ? this._numericFields.get(collection) : undefined;
    const jsonSet = collection ? this._jsonFields.get(collection) : undefined;
    const deserialized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      // Coerce NUMERIC/INTEGER string values back to JS numbers.
      // Bun SQL returns NUMERIC columns as strings to preserve arbitrary precision;
      // for Lucent's number/integer fields we want native JS numbers.
      if (value instanceof Date) {
        deserialized[key] = value.toISOString();
      } else if (numericSet?.has(key) && typeof value === "string") {
        const n = Number(value);
        deserialized[key] = Number.isFinite(n) ? n : value;
      } else if (jsonSet?.has(key) && typeof value === "string") {
        // Parse JSON fields back from stored strings into JS objects/arrays.
        try {
          deserialized[key] = JSON.parse(value);
        } catch {
          deserialized[key] = value;
        }
      } else {
        deserialized[key] = value;
      }
    }

    return deserialized;
  }

  /**
   * Serializes data for database storage.
   */
  serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return value;
  }

  /**
   * Converts JavaScript arrays in a document to PostgreSQL array literal strings
   * so that TEXT[] (and other array) columns are populated correctly.
   * e.g. ["news", "tutorial"] → "{\"news\",\"tutorial\"}"
   */
  private serializeDocForPg(data: Record<string, unknown>, collection?: string): Record<string, unknown> {
    const jsonSet = collection ? this._jsonFields.get(collection) : undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (jsonSet?.has(key)) {
        // JSON fields: stringify the value so it's stored as JSONB/JSON, not PG array
        out[key] = value != null ? JSON.stringify(value) : null;
      } else if (Array.isArray(value)) {
        // Escape double-quotes inside each element and wrap in PG array literal
        const escaped = value.map((item) =>
          typeof item === "string" ? `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : String(item),
        );
        out[key] = `{${escaped.join(",")}}`;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  /**
   * Recursively builds a SQL WHERE expression supporting flat field conditions
   * plus compound `or` / `and` arrays.
   * Dot-notation (e.g. `author.role`) is translated to a correlated subquery:
   *   "author" IN (SELECT id FROM <relatedTable> WHERE "role" <op> $N)
   */
  private buildPgWhere(
    where: Record<string, unknown>,
    ctx: { params: unknown[]; paramIndex: number },
    collection?: string,
  ): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(where)) {
      // Compound operators
      if (key === "or" || key === "and") {
        const sub = value as Record<string, unknown>[];
        if (!Array.isArray(sub) || sub.length === 0) continue;
        const parts = sub.map((clause) => this.buildPgWhere(clause, ctx, collection)).filter(Boolean);
        if (parts.length > 0) {
          const joiner = key === "or" ? " OR " : " AND ";
          conditions.push(`(${parts.join(joiner)})`);
        }
        continue;
      }

      // Dot-notation: filter by related field (e.g. "author.role" → subquery)
      // or by JSON path (e.g. "metadata.color" → JSONB extraction)
      if (key.includes(".") && collection) {
        const dotIdx = key.indexOf(".");
        const rootField = key.slice(0, dotIdx);
        const nestedPath = key.slice(dotIdx + 1);

        // Check if it's a relationship dot-notation → subquery
        const relatedTable = this._relationshipTargets.get(`${collection}.${rootField}`);
        if (relatedTable && typeof value === "object" && value !== null && !Array.isArray(value)) {
          for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
            const subCtx = { params: ctx.params, paramIndex: ctx.paramIndex };
            const subCond = this.buildPgOp(nestedPath, op, opValue, subCtx);
            ctx.paramIndex = subCtx.paramIndex;
            if (subCond) {
              conditions.push(
                `${pgIdentifier(rootField)} IN (SELECT id FROM ${pgIdentifier(relatedTable)} WHERE ${subCond})`,
              );
            }
          }
          continue;
        }

        // Check if it's a JSON field dot-notation → JSONB extraction
        const jsonSet = this._jsonFields.get(collection);
        if (jsonSet?.has(rootField) && typeof value === "object" && value !== null && !Array.isArray(value)) {
          // Build JSONB path: "metadata"->'nested'->>'leaf'
          const pathSegments = nestedPath.split(".");
          for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
            const cond = this.buildPgJsonOp(rootField, pathSegments, op, opValue, ctx);
            if (cond) conditions.push(cond);
          }
          continue;
        }

        continue;
      }

      // Regular field condition
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
          const cond = this.buildPgOp(key, op, opValue, ctx);
          if (cond) conditions.push(cond);
        }
      } else {
        // Simple equality
        conditions.push(`${pgIdentifier(key)} = $${ctx.paramIndex}`);
        ctx.params.push(value);
        ctx.paramIndex++;
      }
    }

    return conditions.length > 0 ? conditions.join(" AND ") : "";
  }

  private buildPgOp(
    field: string,
    op: string,
    value: unknown,
    ctx: { params: unknown[]; paramIndex: number },
  ): string | null {
    switch (op) {
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const sym = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
        const s = `${pgIdentifier(field)} ${sym} $${ctx.paramIndex}`;
        ctx.params.push(value);
        ctx.paramIndex++;
        return s;
      }
      case "in":
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => `$${ctx.paramIndex++}`).join(", ");
          ctx.params.push(...value);
          return `${pgIdentifier(field)} IN (${placeholders})`;
        }
        return null;
      case "nin":
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => `$${ctx.paramIndex++}`).join(", ");
          ctx.params.push(...value);
          return `${pgIdentifier(field)} NOT IN (${placeholders})`;
        }
        return null;
      case "exists":
        return value === true || value === "true"
          ? `${pgIdentifier(field)} IS NOT NULL`
          : `${pgIdentifier(field)} IS NULL`;
      case "like": {
        const s = `${pgIdentifier(field)} ILIKE $${ctx.paramIndex}`;
        ctx.params.push(`%${value}%`);
        ctx.paramIndex++;
        return s;
      }
      case "contains": {
        // Array field contains scalar value: $val = ANY(field)
        const s = `$${ctx.paramIndex} = ANY(${pgIdentifier(field)})`;
        ctx.params.push(value);
        ctx.paramIndex++;
        return s;
      }
      case "notContains": {
        // Array field does NOT contain scalar value
        const s = `NOT ($${ctx.paramIndex} = ANY(${pgIdentifier(field)}))`;
        ctx.params.push(value);
        ctx.paramIndex++;
        return s;
      }
      case "any": {
        // Array field overlaps with the given values (contains any of them)
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => `$${ctx.paramIndex++}`).join(", ");
          ctx.params.push(...value);
          return `${pgIdentifier(field)} && ARRAY[${placeholders}]`;
        }
        return null;
      }
      case "all": {
        // Array field contains all of the given values
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => `$${ctx.paramIndex++}`).join(", ");
          ctx.params.push(...value);
          return `${pgIdentifier(field)} @> ARRAY[${placeholders}]`;
        }
        return null;
      }
      case "between": {
        // Range shorthand: [start, end] → field >= start AND field <= end
        if (Array.isArray(value) && value.length === 2) {
          const s = `${pgIdentifier(field)} >= $${ctx.paramIndex} AND ${pgIdentifier(field)} <= $${ctx.paramIndex + 1}`;
          ctx.params.push(value[0], value[1]);
          ctx.paramIndex += 2;
          return s;
        }
        return null;
      }
      case "search": {
        // Full-text search using PostgreSQL tsvector/tsquery
        if (typeof value === "string" && value.trim().length > 0) {
          const s = `to_tsvector('english', ${pgIdentifier(field)}) @@ plainto_tsquery('english', $${ctx.paramIndex})`;
          ctx.params.push(value);
          ctx.paramIndex++;
          return s;
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Builds a JSONB extraction + comparison expression.
   * e.g. for path ["color"] → "metadata"->>'color' = $1
   * e.g. for path ["theme", "mode"] → "metadata"->'theme'->>'mode' = $1
   */
  private buildPgJsonOp(
    column: string,
    pathSegments: string[],
    op: string,
    value: unknown,
    ctx: { params: unknown[]; paramIndex: number },
  ): string | null {
    if (pathSegments.length === 0) return null;

    // Build the extraction path: all but last use ->, last uses ->> (text extraction)
    let extraction: string;
    if (pathSegments.length === 1) {
      extraction = `${pgIdentifier(column)}->>${pgLiteral(pathSegments[0]!)}`;
    } else {
      const intermediate = pathSegments
        .slice(0, -1)
        .map((s) => pgLiteral(s))
        .join("->");
      extraction = `${pgIdentifier(column)}->${intermediate}->>${pgLiteral(pathSegments[pathSegments.length - 1]!)}`;
    }

    // For numeric operators, cast the extracted text to numeric
    const numericOps = new Set(["gt", "gte", "lt", "lte", "between"]);
    if (numericOps.has(op)) {
      extraction = `(${extraction})::numeric`;
    }

    switch (op) {
      case "eq": {
        const s = `${extraction} = $${ctx.paramIndex}`;
        ctx.params.push(String(value));
        ctx.paramIndex++;
        return s;
      }
      case "neq": {
        const s = `${extraction} != $${ctx.paramIndex}`;
        ctx.params.push(String(value));
        ctx.paramIndex++;
        return s;
      }
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const sym = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
        const s = `${extraction} ${sym} $${ctx.paramIndex}`;
        ctx.params.push(value);
        ctx.paramIndex++;
        return s;
      }
      case "like": {
        const s = `${extraction} ILIKE $${ctx.paramIndex}`;
        ctx.params.push(`%${value}%`);
        ctx.paramIndex++;
        return s;
      }
      case "in": {
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => `$${ctx.paramIndex++}`).join(", ");
          ctx.params.push(...value.map(String));
          return `${extraction} IN (${placeholders})`;
        }
        return null;
      }
      case "exists": {
        // Check if the JSON key exists
        if (pathSegments.length === 1) {
          return value === true || value === "true"
            ? `${pgIdentifier(column)} ? ${pgLiteral(pathSegments[0]!)}`
            : `NOT (${pgIdentifier(column)} ? ${pgLiteral(pathSegments[0]!)})`;
        }
        // For deep paths, check if the extraction is non-null
        const baseExtraction = `${pgIdentifier(column)}->>${pgLiteral(pathSegments[0]!)}`;
        return value === true || value === "true" ? `${baseExtraction} IS NOT NULL` : `${baseExtraction} IS NULL`;
      }
      case "between": {
        if (Array.isArray(value) && value.length === 2) {
          const s = `${extraction} >= $${ctx.paramIndex} AND ${extraction} <= $${ctx.paramIndex + 1}`;
          ctx.params.push(value[0], value[1]);
          ctx.paramIndex += 2;
          return s;
        }
        return null;
      }
      default:
        return null;
    }
  }
}

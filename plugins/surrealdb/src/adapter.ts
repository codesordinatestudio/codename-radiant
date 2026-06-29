// SurrealDB Adapter
// Version: 0.0.4

import type { LucentAdapter, QueryArgs, QueryResult, Collection } from "@codesordinatestudio/lucent-core";
import { logger, generateId } from "@codesordinatestudio/lucent-core";
import {
  generateSystemTablesSurreal,
  generateCreateTableSurreal,
  generateAddColumnSurreal,
  generateRenameColumnSurreal,
  type TableDefinition,
  type ColumnDefinition,
} from "@codesordinatestudio/lucent-core";

// Type-only import — no runtime cost, no bundling of surrealdb.
import type { Surreal, RecordId as RecordIdType } from "surrealdb";

// Lazy-loaded surrealdb module (only resolved the first time connect() is called)
let _surrealModule: typeof import("surrealdb") | null = null;
async function loadSurrealDB(): Promise<typeof import("surrealdb")> {
  if (_surrealModule) return _surrealModule;
  try {
    _surrealModule = await import("surrealdb");
    return _surrealModule;
  } catch {
    throw new Error("surrealdb is not installed. Run: bun add surrealdb");
  }
}

const SURREAL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function surrealIdentifier(identifier: string): string {
  if (!SURREAL_IDENTIFIER_RE.test(identifier)) {
    throw new Error(`Invalid SurrealDB identifier '${identifier}'`);
  }
  return identifier;
}

function surrealPath(path: string): string {
  return path.split(".").map(surrealIdentifier).join(".");
}

export type SurrealDBOptions = {
  url: string;
  namespace?: string;
  database?: string;
  auth?: {
    username: string;
    password: string;
  };
};

/**
 * SurrealDB adapter using the official SurrealDB JavaScript SDK v3.
 */
export class SurrealDBAdapter implements LucentAdapter {
  readonly adapterType = "surrealdb";
  readonly supportsGeneratedConstraintSQL = false;
  private _connection: Surreal | null = null;
  private _RecordId: typeof RecordIdType | null = null;

  private get db(): Surreal {
    if (!this._connection) throw new Error("SurrealDB not connected. Call connect() first.");
    return this._connection;
  }
  private options: SurrealDBOptions;
  /** slug → ordered list of field names known from the Lucent config */
  private _collectionFields: Map<string, string[]> = new Map();

  constructor(options: SurrealDBOptions) {
    this.options = options;
  }

  private async _getRecordId(): Promise<typeof RecordIdType> {
    if (this._RecordId) return this._RecordId;
    const sdk = await loadSurrealDB();
    this._RecordId = sdk.RecordId;
    return this._RecordId;
  }

  /**
   * Register collection field names so that `normalizeRecord` can hydrate
   * fields that SurrealDB omits when their value is NONE.
   */
  configureCollections(collections: Collection[]): void {
    for (const col of collections) {
      const names: string[] = col.fields.map((f) => f.name);
      if (col.timestamps) names.push("createdAt", "updatedAt");
      if (col.softDelete) names.push("deletedAt");
      if (col.auth && col.requireEmailVerification) names.push("emailVerified", "verifyToken");
      if (col.auth && col.lockout) names.push("loginAttempts", "lockedUntil");
      this._collectionFields.set(col.slug, names);
    }
  }

  registerCollections(collections: Collection[]): void {
    this.configureCollections(collections);
  }

  async connect(): Promise<void> {
    const sdk = await loadSurrealDB();
    if (!this._connection) {
      this._connection = new sdk.Surreal();
    }
    this._RecordId = sdk.RecordId;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`SurrealDB connection timed out after 5s — is the server running at ${this.options.url}?`)),
        5000,
      ),
    );

    await Promise.race([this._connectInner(), timeout]);
  }

  private async _connectInner(): Promise<void> {
    await this.db.connect(this.options.url);

    if (this.options.auth) {
      await this.db.signin({
        username: this.options.auth.username,
        password: this.options.auth.password,
      });
    }

    await this.db.use({
      namespace: this.options.namespace ?? "lucent",
      database: this.options.database ?? "lucent",
    });

    // Verify the connection is alive
    await this.db.query("RETURN true");
    logger.info("Connected to SurrealDB");
  }

  async disconnect(): Promise<void> {
    if (this._connection) await this._connection.close();
    this._connection = null;
  }

  async ping(): Promise<void> {
    await this.db.query("RETURN true");
  }

  getSystemTableStatements(): string[] {
    return generateSystemTablesSurreal();
  }

  async getCurrentSchema(): Promise<{ tables: string[]; columns: Record<string, string[]> }> {
    const schema: { tables: string[]; columns: Record<string, string[]> } = {
      tables: [],
      columns: {},
    };

    const dbInfo = (await this.raw("INFO FOR DB")) as Record<string, unknown>;
    const tablesMap = (dbInfo as { tables?: Record<string, unknown> }).tables ?? {};
    schema.tables = Object.keys(tablesMap).filter((name) => !name.startsWith("lucent_") && name !== "undefined" && name !== "null");

    for (const tableName of schema.tables) {
      const tableInfo = (await this.raw(`INFO FOR TABLE ${tableName}`)) as Record<string, unknown>;
      const fieldsMap = (tableInfo as { fields?: Record<string, unknown> }).fields ?? {};
      schema.columns[tableName] = Object.keys(fieldsMap).map((field) => `${field} string`);
    }

    return schema;
  }

  async recordMigration(version: string, description: string): Promise<void> {
    const existing = await this.find("lucent_migrations", {
      where: { version: { eq: version } },
      limit: 1,
      page: 1,
    });

    if (existing.docs.length > 0) return;

    await this.create("lucent_migrations", {
      version,
      description,
      applied_at: new Date().toISOString(),
    });
  }

  async getCurrentMigrationVersion(): Promise<string | null> {
    const result = await this.find("lucent_migrations", {
      sort: "-applied_at",
      limit: 1,
      page: 1,
    });

    return (result.docs[0]?.version as string | undefined) ?? null;
  }

  createTableDDL(table: unknown): string {
    return generateCreateTableSurreal(table as TableDefinition);
  }

  renameColumnDDL(table: string, oldName: string, _newName: string, column: unknown): string {
    return generateRenameColumnSurreal(table, oldName, column as ColumnDefinition);
  }

  addColumnDDL(table: string, column: unknown): string | null {
    return generateAddColumnSurreal(table, column as ColumnDefinition);
  }

  dropColumnDDL(table: string, column: string): string {
    return `REMOVE FIELD ${surrealPath(column)} ON TABLE ${surrealIdentifier(table)};`;
  }

  dropTableDDL(table: string): string {
    return `REMOVE TABLE ${surrealIdentifier(table)};`;
  }

  async find(collection: string, query: QueryArgs): Promise<QueryResult> {
    const { where, sort, limit = 10, page = 1, cursor } = query;

    let whereSql = "";
    const params: Record<string, unknown> = {};

    if (where) {
      const ctx = { params, pIdx: 0 };
      const sql = this.buildSurrealWhere(where as Record<string, unknown>, ctx);
      if (sql) whereSql = " WHERE " + sql;
    }

    let orderSql = "";
    if (sort) {
      const parts = sort
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const orderParts = parts.map((part) => {
        const desc = part.startsWith("-");
        const field = desc ? part.slice(1) : part;
        return `${surrealPath(field)} ${desc ? "DESC" : "ASC"}`;
      });
      if (orderParts.length > 0) orderSql = ` ORDER BY ${orderParts.join(", ")}`;
    }

    // ---- cursor-based pagination ----
    if (cursor) {
      let decoded: { id: string; sortValue?: unknown };
      try {
        decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
      } catch {
        throw new Error("Invalid cursor");
      }

      const primarySort = sort ? sort.split(",")[0].trim() : "id";
      const desc = primarySort.startsWith("-");
      const sortField = desc ? primarySort.slice(1) : primarySort;
      const op = desc ? "<" : ">";

      const cursorCondition =
        sortField === "id"
          ? `meta::id(id) ${op} $__cursorId`
          : `(${surrealPath(sortField)}, meta::id(id)) ${op} ($__cursorSortValue, $__cursorId)`;

      params.__cursorId = decoded.id;
      if (sortField !== "id") params.__cursorSortValue = decoded.sortValue;

      whereSql = whereSql ? `${whereSql} AND ${cursorCondition}` : ` WHERE ${cursorCondition}`;

      params.__limit = limit + 1;
      const dataSql = `SELECT * FROM ${surrealIdentifier(collection)}${whereSql}${orderSql} LIMIT $__limit`;

      logger.debug({ dataSql, params }, "Executing SurrealDB cursor find query");

      const [docs] = await this.db.query<[Record<string, unknown>[]]>(dataSql, params);
      const normalizedDocs = (docs ?? []).map((doc) => this.normalizeRecord(collection, doc));
      const hasNextPage = normalizedDocs.length > limit;
      const resultDocs = hasNextPage ? normalizedDocs.slice(0, limit) : normalizedDocs;

      let nextCursor: string | null = null;
      if (hasNextPage && resultDocs.length > 0) {
        const lastDoc = resultDocs[resultDocs.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({ id: lastDoc.id, sortValue: sortField !== "id" ? lastDoc[sortField] : undefined }),
        ).toString("base64url");
      }

      return {
        docs: resultDocs,
        totalDocs: 0,
        limit,
        page: 0,
        totalPages: 0,
        hasNextPage,
        hasPrevPage: true,
        nextCursor,
        prevCursor: null,
      };
    }

    // ---- offset-based pagination (default) ----
    const offset = (page - 1) * limit;

    // SurrealDB uses LIMIT and START (not OFFSET)
    const dataSql = `SELECT * FROM ${surrealIdentifier(collection)}${whereSql}${orderSql} LIMIT $__limit START $__offset`;
    const countSql = `SELECT count() AS total FROM ${surrealIdentifier(collection)}${whereSql} GROUP ALL`;

    params.__limit = limit;
    params.__offset = offset;

    logger.debug({ dataSql, countSql, params }, "Executing SurrealDB find query");

    const [countResult] = await this.db.query<[{ total: number }[]]>(countSql, params);
    const totalDocs = countResult?.[0]?.total ?? 0;

    const [docs] = await this.db.query<[Record<string, unknown>[]]>(dataSql, params);
    const normalizedDocs = (docs ?? []).map((doc) => this.normalizeRecord(collection, doc));

    const totalPages = Math.ceil(totalDocs / limit);

    return {
      docs: normalizedDocs,
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number> {
    let whereSql = "";
    const params: Record<string, unknown> = {};

    if (query?.where) {
      const ctx = { params, pIdx: 0 };
      const sql = this.buildSurrealWhere(query.where as Record<string, unknown>, ctx);
      if (sql) whereSql = " WHERE " + sql;
    }

    const countSql = `SELECT count() AS total FROM ${surrealIdentifier(collection)}${whereSql} GROUP ALL`;
    logger.debug({ countSql, params }, "Executing SurrealDB count query");

    const [result] = await this.db.query<[{ total: number }[]]>(countSql, params);
    return result?.[0]?.total ?? 0;
  }

  async findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
    logger.debug({ collection, id }, "Executing SurrealDB findById query");

    const recordId = new (await this._getRecordId())(collection, id);
    const result = await this.db.select<Record<string, unknown>>(recordId);

    if (!result) return null;

    return this.normalizeRecord(collection, result);
  }

  async findByIds(collection: string, ids: string[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];

    logger.debug({ collection, count: ids.length }, "Executing SurrealDB findByIds query");

    const RecordId = await this._getRecordId();
    const recordIds = ids.map((id) => new RecordId(collection, id));
    const [results] = await this.db.query<[Record<string, unknown>[]]>(`SELECT * FROM $ids`, { ids: recordIds });

    return (results ?? []).map((doc) => this.normalizeRecord(collection, doc));
  }

  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const now = new Date();
    const knownFields = new Set(this._collectionFields.get(collection) ?? []);
    const { id: providedId, ...rest } = data;
    const id = (providedId as string | undefined) ?? generateId();
    const doc: Record<string, unknown> = { ...rest };
    if (knownFields.size === 0 || knownFields.has("createdAt")) doc.createdAt = doc.createdAt ?? now;
    if (knownFields.size === 0 || knownFields.has("updatedAt")) doc.updatedAt = now;

    logger.debug({ collection, id, fields: Object.keys(doc) }, "Executing SurrealDB create");

    const recordId = new (await this._getRecordId())(collection, id);
    const result = await this.db.create<Record<string, unknown>>(recordId).content(doc);

    return this.normalizeRecord(collection, result);
  }

  async createMany(collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (docs.length === 0) return [];

    const now = new Date();
    const results: Record<string, unknown>[] = [];
    const knownFields = new Set(this._collectionFields.get(collection) ?? []);

    for (const data of docs) {
      const { id: providedId, ...rest } = data;
      const id = (providedId as string | undefined) ?? generateId();
      const doc: Record<string, unknown> = { ...rest };
      if (knownFields.size === 0 || knownFields.has("createdAt")) doc.createdAt = doc.createdAt ?? now;
      if (knownFields.size === 0 || knownFields.has("updatedAt")) doc.updatedAt = now;
      const recordId = new (await this._getRecordId())(collection, id);
      const result = await this.db.create<Record<string, unknown>>(recordId).content(doc);
      results.push(this.normalizeRecord(collection, result));
    }

    return results;
  }

  async update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const now = new Date();
    const knownFields = new Set(this._collectionFields.get(collection) ?? []);
    const updateData = { ...data } as Record<string, unknown>;
    if (knownFields.size === 0 || knownFields.has("updatedAt")) updateData.updatedAt = now;

    logger.debug({ collection, id, fields: Object.keys(updateData) }, "Executing SurrealDB update");

    const recordId = new (await this._getRecordId())(collection, id);
    const result = await this.db.update<Record<string, unknown>>(recordId).merge(updateData);

    if (!result) {
      throw new Error(`Document with id '${id}' not found in collection '${collection}'`);
    }

    return this.normalizeRecord(collection, result);
  }

  async delete(collection: string, id: string): Promise<void> {
    logger.debug({ collection, id }, "Executing SurrealDB delete");

    const recordId = new (await this._getRecordId())(collection, id);
    const result = await this.db.delete<Record<string, unknown>>(recordId);

    if (!result) {
      throw new Error(`Document with id '${id}' not found in collection '${collection}'`);
    }
  }

  async deleteMany(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    logger.debug({ collection, count: ids.length }, "Executing SurrealDB bulk delete");

    const RecordId = await this._getRecordId();
    const recordIds = ids.map((id) => new RecordId(collection, id));
    await this.db.query(`DELETE $ids`, { ids: recordIds });
  }

  async raw(query: string, params?: unknown[]): Promise<unknown> {
    // SurrealDB uses named params, but for compatibility with the raw() interface
    // that uses positional params, we convert $1, $2 etc. to named params
    let surrealQuery = query;
    const namedParams: Record<string, unknown> = {};

    if (params && params.length > 0) {
      for (let i = 0; i < params.length; i++) {
        const positional = `$${i + 1}`;
        const named = `__raw_${i}`;
        surrealQuery = surrealQuery.replaceAll(positional, `$${named}`);
        namedParams[named] = params[i];
      }
    }

    const results = await this.db.query(surrealQuery, namedParams);
    // Return the last statement's result (matches typical raw query expectations)
    return results[results.length - 1];
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Normalizes a SurrealDB record to a plain object with a string `id` field.
   * SurrealDB returns `id` as a RecordId object (table:uuid) — we extract just the ID part.
   */
  private normalizeRecord(collection: string, record: Record<string, unknown>): Record<string, unknown> {
    // Pre-seed known fields with null so NONE/missing SurrealDB values are explicit
    const normalized: Record<string, unknown> = {};
    const knownFields = this._collectionFields.get(collection);
    if (knownFields) {
      for (const field of knownFields) {
        normalized[field] = null;
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (key === "id") {
        if (this._RecordId && value instanceof this._RecordId) {
          // Standard instanceof check using the loaded RecordId class
          normalized.id = String(value.id);
        } else if (value !== null && typeof value === "object" && "id" in value && value.id !== undefined) {
          // Duck-type fallback: RecordId from a different module scope (bun test isolation)
          normalized.id = String((value as Record<string, unknown>).id);
        } else if (typeof value === "string" && value.includes(":")) {
          // Handle string-formatted record IDs like "collection:uuid"
          normalized.id = value.split(":").slice(1).join(":");
        } else {
          normalized[key] = value;
        }
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Recursively builds a SurrealQL WHERE expression supporting flat field
   * conditions plus compound `or` / `and` arrays.
   */
  private buildSurrealWhere(
    where: Record<string, unknown>,
    ctx: { params: Record<string, unknown>; pIdx: number },
  ): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(where)) {
      if (key === "or" || key === "and") {
        const sub = value as Record<string, unknown>[];
        if (!Array.isArray(sub) || sub.length === 0) continue;
        const parts = sub.map((clause) => this.buildSurrealWhere(clause, ctx)).filter(Boolean);
        if (parts.length > 0) {
          const joiner = key === "or" ? " OR " : " AND ";
          conditions.push(`(${parts.join(joiner)})`);
        }
        continue;
      }

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
          const cond = this.buildSurrealOp(key, op, opValue, ctx);
          if (cond) conditions.push(cond);
        }
      } else {
        const p = `p${ctx.pIdx++}`;
        const fieldExpr = key === "id" ? "meta::id(id)" : surrealPath(key);
        conditions.push(`${fieldExpr} = $${p}`);
        ctx.params[p] = value;
      }
    }

    return conditions.length > 0 ? conditions.join(" AND ") : "";
  }

  private buildSurrealOp(
    field: string,
    op: string,
    value: unknown,
    ctx: { params: Record<string, unknown>; pIdx: number },
  ): string | null {
    const p = `p${ctx.pIdx++}`;
    // SurrealDB stores id as a RecordId; use meta::id(id) to compare the string part
    const fieldExpr = field === "id" ? "meta::id(id)" : surrealPath(field);
    switch (op) {
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const sym = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
        ctx.params[p] = value;
        return `${fieldExpr} ${sym} $${p}`;
      }
      case "in":
        if (Array.isArray(value) && value.length > 0) {
          ctx.params[p] = value;
          return `${fieldExpr} IN $${p}`;
        }
        return null;
      case "nin":
        if (Array.isArray(value) && value.length > 0) {
          ctx.params[p] = value;
          return `${fieldExpr} NOT IN $${p}`;
        }
        return null;
      case "exists":
        ctx.pIdx--; // no param needed
        return value === true || value === "true"
          ? `${fieldExpr} != NONE`
          : `(${fieldExpr} = NONE OR ${fieldExpr} IS NULL)`;
      case "like":
        ctx.params[p] = value;
        return `string::contains(string::lowercase(${fieldExpr}), string::lowercase($${p}))`;
      case "contains":
        // Array field contains scalar value: field CONTAINS $val
        ctx.params[p] = value;
        return `${fieldExpr} CONTAINS $${p}`;
      case "notContains":
        // Array field does NOT contain scalar value
        ctx.params[p] = value;
        return `${fieldExpr} CONTAINSNOT $${p}`;
      case "any":
        // Array field contains any of the provided values
        if (Array.isArray(value) && value.length > 0) {
          ctx.params[p] = value;
          return `${fieldExpr} CONTAINSANY $${p}`;
        }
        ctx.pIdx--; // no param consumed
        return null;
      case "all":
        // Array field contains all of the provided values
        if (Array.isArray(value) && value.length > 0) {
          ctx.params[p] = value;
          return `${fieldExpr} CONTAINSALL $${p}`;
        }
        ctx.pIdx--; // no param consumed
        return null;
      case "between": {
        // Range shorthand: [start, end] → field >= start AND field <= end
        if (Array.isArray(value) && value.length === 2) {
          const p2 = `p${ctx.pIdx++}`;
          ctx.params[p] = value[0];
          ctx.params[p2] = value[1];
          return `${fieldExpr} >= $${p} AND ${fieldExpr} <= $${p2}`;
        }
        ctx.pIdx--; // no param consumed
        return null;
      }
      default:
        return null;
    }
  }
}

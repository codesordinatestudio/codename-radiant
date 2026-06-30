// MongoDB Adapter
// Version: 0.0.4

import type { RadiantAdapter, QueryArgs, PaginatedResult, CollectionConfig } from "@codesordinatestudio/radiant-bun/core";

interface ColumnDefinition {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  foreignKey?: { table: string; column: string; onDelete?: string };
  fieldType?: string;
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey: string[];
}

function buildTable(collection: any): TableDefinition {
  return { name: typeof collection === "string" ? collection : collection.name, columns: [], primaryKey: ["id"] };
}

let _mongodbModule: any | null = null;
async function loadMongoDB(): Promise<any> {
  if (_mongodbModule) return _mongodbModule;
  try {
    _mongodbModule = await import("mongodb");
    return _mongodbModule;
  } catch {
    throw new Error("mongodb is not installed. Run: bun add mongodb");
  }
}

export type MongoDBOptions = {
  url: string;
  database?: string;
};

type MongoDDLCommand =
  | { op: "createRadiantCollection"; table: TableDefinition }
  | { op: "addColumn"; table: string; column: ColumnDefinition }
  | { op: "renameColumn"; table: string; oldName: string; newName: string; column: ColumnDefinition }
  | { op: "dropColumn"; table: string; column: string }
  | { op: "dropTable"; table: string };

const DDL_MARKER = "--__radiant-bun_mongo__:";

const SCHEMA_TO_STORE_FIELD: Record<string, string> = {
  id: "_id",
  deleted_at: "deletedAt",
  email_verified: "emailVerified",
  verify_token: "verifyToken",
  login_attempts: "loginAttempts",
  locked_until: "lockedUntil",
};

const STORE_TO_SCHEMA_FIELD = new Map<string, string>(
  Object.entries(SCHEMA_TO_STORE_FIELD).map(([schema, store]) => [store, schema]),
);

function assertMongoRadiantCollectionName(name: string): string {
  if (!name || name.startsWith("$") || name.includes("\0")) {
    throw new Error(`Invalid MongoDB collection name '${name}'`);
  }
  return name;
}

function assertMongoFieldPath(path: string): string {
  const parts = path.split(".");
  if (parts.some((part) => !part || part.startsWith("$") || part.includes("\0"))) {
    throw new Error(`Invalid MongoDB field path '${path}'`);
  }
  return path;
}

function encodeDDL(prefix: string, command: MongoDDLCommand): string {
  return `${prefix} ${DDL_MARKER}${Buffer.from(JSON.stringify(command)).toString("base64url")}`;
}

function decodeDDL(query: string): MongoDDLCommand | null {
  const idx = query.indexOf(DDL_MARKER);
  if (idx === -1) return null;
  const encoded = query.slice(idx + DDL_MARKER.length).trim();
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as MongoDDLCommand;
}

/**
 * MongoDB adapter using the official MongoDB Node driver.
 */
export class MongoDBAdapter implements RadiantAdapter {
  readonly adapterType = "mongodb";
  readonly supportsGeneratedConstraintSQL = false;

  private client: any | null = null;
  private database: any | null = null;
  private options: MongoDBOptions;
  private _collectionFields = new Map<string, Set<string>>();
  private _relationshipTargets = new Map<string, string>();
  private _databaseName: string;

  constructor(options: MongoDBOptions) {
    this.options = options;
    this._databaseName = this.resolveDatabaseName(options);
  }

  configureRadiantCollections(collections: CollectionConfig[]): void {
    for (const colDef of collections) {
      const col = colDef as any;
      const fields = new Set<string>(["id"]);
      for (const fieldDef of col.fields) {
        const field = fieldDef as any;
        fields.add(field.name);
        if (field.type === "relationship" && field.relationTo) {
          this._relationshipTargets.set(`${col.slug}.${field.name}`, field.relationTo);
        }
      }
      if (col.timestamps) fields.add("createdAt"), fields.add("updatedAt");
      if (col.softDelete) fields.add("deletedAt");
      if (col.auth && col.requireEmailVerification) fields.add("emailVerified"), fields.add("verifyToken");
      if (col.auth && col.lockout) fields.add("loginAttempts"), fields.add("lockedUntil");
      this._collectionFields.set(col.slug, fields);
    }
  }

  async connect(): Promise<void> {
    const { MongoClient } = await loadMongoDB();
    this.client = new MongoClient(this.options.url);
    await this.client.connect();
    this.database = this.client.db(this._databaseName);
    await this.database.command({ ping: 1 });
    console.info({ database: this._databaseName }, "Connected to MongoDB");
  }

  async disconnect(): Promise<void> {
    if (this.client) await this.client.close();
    this.client = null;
    this.database = null;
  }

  async ping(): Promise<void> {
    await this.db().command({ ping: 1 });
  }

  getStartupInfo(): { createdResourceName?: string | null } {
    return { createdResourceName: this._databaseName };
  }

  getSystemTableStatements(): string[] {
    return ["_radiant_migrations"].map((collection) => this.createTableDDL(buildTable(collection)));
  }

  async getCurrentSchema(): Promise<{ tables: string[]; columns: Record<string, string[]> }> {
    const schema: { tables: string[]; columns: Record<string, string[]> } = { tables: [], columns: {} };
    const collections = await this.db().listRadiantCollections({}, { nameOnly: false }).toArray();

    for (const info of collections) {
      const name = String(info.name ?? "");
      if (!name || name.startsWith("radiant-bun_")) continue;
      schema.tables.push(name);

      const fields = new Set<string>();
      const props = info.options?.validator?.$jsonSchema?.properties ?? {};
      for (const key of Object.keys(props)) {
        fields.add(this.storeFieldToSchema(name, key));
      }

      const sample = await this.db().collection(name).findOne({}, { projection: { _id: 1 } });
      if (sample && typeof sample === "object") {
        for (const key of Object.keys(sample)) {
          fields.add(this.storeFieldToSchema(name, key));
        }
      }

      if (fields.size === 0) fields.add("id");
      schema.columns[name] = [...fields].map((field) => `${field} string`);
    }

    return schema;
  }

  async recordMigration(version: string, description: string): Promise<void> {
    const existing = await this.find("radiant-bun_migrations", {
      where: { version: { eq: version } },
      limit: 1,
      page: 1,
    });
    if (existing.docs.length > 0) return;

    await this.create("radiant-bun_migrations", {
      version,
      description,
      applied_at: new Date().toISOString(),
    });
  }

  async getCurrentMigrationVersion(): Promise<string | null> {
    const result = await this.find("radiant-bun_migrations", {
      sort: "-applied_at",
      limit: 1,
      page: 1,
    });
    return (result.docs[0]?.version as string | undefined) ?? null;
  }

  createTableDDL(table: unknown): string {
    const t = table as TableDefinition;
    return encodeDDL(`CREATE TABLE IF NOT EXISTS ${t.name};`, { op: "createRadiantCollection", table: t });
  }

  renameColumnDDL(table: string, oldName: string, newName: string, column: unknown): string {
    return encodeDDL(`ALTER TABLE ${table} RENAME COLUMN "${oldName}" TO "${newName}";`, {
      op: "renameColumn",
      table,
      oldName,
      newName,
      column: column as ColumnDefinition,
    });
  }

  addColumnDDL(table: string, column: unknown): string | null {
    const c = column as ColumnDefinition;
    return encodeDDL(`ALTER TABLE ${table} ADD COLUMN ${c.name};`, {
      op: "addColumn",
      table,
      column: c,
    });
  }

  dropColumnDDL(table: string, column: string): string {
    return encodeDDL(`ALTER TABLE ${table} DROP COLUMN "${column}";`, { op: "dropColumn", table, column });
  }

  dropTableDDL(table: string): string {
    return encodeDDL(`DROP TABLE ${table};`, { op: "dropTable", table });
  }

  async find(collection: string, query: QueryArgs): Promise<PaginatedResult> {
    const { where, sort, limit = 10, page = 1, cursor } = query as any;
    const coll = this.collection(collection);
    let filter = await this.buildMongoWhere((where as Record<string, unknown> | undefined) ?? {}, collection);
    const sortSpec = this.buildSort(collection, sort);

    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      const primarySort = sort ? ((sort as string).split(",")[0] as string).trim() : "id";
      const desc = primarySort.startsWith("-");
      const sortField = desc ? primarySort.slice(1) : primarySort;
      const storeSortField = this.runtimeFieldToStore(collection, sortField);
      const op = desc ? "$lt" : "$gt";
      const cursorFilter =
        sortField === "id"
          ? { _id: { [op]: decoded.id } }
          : {
              $or: [
                { [storeSortField]: { [op]: decoded.sortValue } },
                { [storeSortField]: decoded.sortValue, _id: { [op]: decoded.id } },
              ],
            };
      filter = Object.keys(filter).length === 0 ? cursorFilter : { $and: [filter, cursorFilter] };
      const docs = await coll.find(filter).sort(sortSpec).limit(limit + 1).toArray();
      const normalized = docs.map((doc: Record<string, unknown>) => this.normalizeDoc(doc));
      const hasNextPage = normalized.length > limit;
      const resultDocs = hasNextPage ? normalized.slice(0, limit) : normalized;
      const last = resultDocs[resultDocs.length - 1];
      return {
        docs: resultDocs,
        totalDocs: 0,
        limit,
        page: 0,
        totalPages: 0,
        hasNextPage,
        hasPrevPage: true,
        nextCursor:
          hasNextPage && last
            ? Buffer.from(
                JSON.stringify({ id: last.id, sortValue: sortField === "id" ? undefined : last[sortField] }),
              ).toString("base64url")
            : null,
        prevCursor: null,
      } as PaginatedResult;
    }

    const offset = (page - 1) * limit;
    const [docs, totalDocs] = await Promise.all([
      coll.find(filter).sort(sortSpec).skip(offset).limit(limit).toArray(),
      coll.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalDocs / limit);
    return {
      docs: docs.map((doc: Record<string, unknown>) => this.normalizeDoc(doc)),
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number> {
    const filter = await this.buildMongoWhere((query?.where as Record<string, unknown> | undefined) ?? {}, collection);
    return this.collection(collection).countDocuments(filter);
  }

  async findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.collection(collection).findOne({ _id: id });
    return doc ? this.normalizeDoc(doc) : null;
  }

  async findByIds(collection: string, ids: string[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection(collection).find({ _id: { $in: ids } }).toArray();
    const normalized = docs.map((doc: Record<string, unknown>) => this.normalizeDoc(doc));
    const byId = new Map<string, Record<string, unknown>>(
      normalized.map((doc: Record<string, unknown>) => [String(doc.id), doc]),
    );
    const ordered: Record<string, unknown>[] = [];
    for (const id of ids) {
      const doc = byId.get(id);
      if (doc) ordered.push(doc);
    }
    return ordered;
  }

  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const knownFields = this._collectionFields.get(collection);
    const now = new Date().toISOString();
    const { id: providedId, ...rest } = data;
    const doc = this.translateDocForStorage(collection, rest);
    doc._id = (providedId as string | undefined) ?? crypto.randomUUID();
    if (!knownFields || knownFields.has("createdAt")) doc.createdAt = doc.createdAt ?? now;
    if (!knownFields || knownFields.has("updatedAt")) doc.updatedAt = now;
    await this.collection(collection).insertOne(doc);
    return this.normalizeDoc(doc);
  }

  async createMany(collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (docs.length === 0) return [];
    const created: Record<string, unknown>[] = [];
    for (const doc of docs) created.push(await this.create(collection, doc));
    return created;
  }

  async update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const knownFields = this._collectionFields.get(collection);
    const { id: _ignored, ...rest } = data;
    const update = this.translateDocForStorage(collection, rest);
    if (!knownFields || knownFields.has("updatedAt")) update.updatedAt = new Date().toISOString();

    const result = await this.collection(collection).findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: "after" },
    );

    const doc = result?.value ?? result;
    if (!doc) throw new Error(`Document with id '${id}' not found in collection '${collection}'`);
    return this.normalizeDoc(doc);
  }

  async delete(collection: string, id: string): Promise<void> {
    const result = await this.collection(collection).deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new Error(`Document with id '${id}' not found in collection '${collection}'`);
    }
  }

  async deleteMany(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.collection(collection).deleteMany({ _id: { $in: ids } });
  }

  async raw(query: string, _params?: unknown[]): Promise<unknown> {
    const command = decodeDDL(query);
    if (!command) {
      throw new Error("MongoDB adapter raw() only supports Lucent migration statements");
    }

    switch (command.op) {
      case "createRadiantCollection":
        await this.applyRadiantCollectionDefinition(command.table);
        return { ok: 1 };
      case "addColumn":
        await this.applyColumnDefinition(command.table, command.column);
        return { ok: 1 };
      case "renameColumn":
        await this.renameColumn(command.table, command.oldName, command.newName, command.column);
        return { ok: 1 };
      case "dropColumn":
        await this.dropColumn(command.table, command.column);
        return { ok: 1 };
      case "dropTable":
        await this.db().collection(command.table).drop().catch(() => {});
        return { ok: 1 };
      default:
        return { ok: 1 };
    }
  }

  private db(): any {
    if (!this.database) throw new Error("MongoDB not connected");
    return this.database;
  }

  private collection(name: string): any {
    return this.db().collection(assertMongoRadiantCollectionName(name));
  }

  private resolveDatabaseName(options: MongoDBOptions): string {
    if (options.database) return options.database;
    try {
      const parsed = new URL(options.url);
      const fromPath = parsed.pathname.replace(/^\//, "");
      return fromPath || "radiant-bun";
    } catch {
      return "radiant-bun";
    }
  }

  private normalizeDoc(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, ...rest } = doc;
    return {
      id: typeof _id === "string" ? _id : _id != null ? String(_id) : undefined,
      ...rest,
    };
  }

  private translateDocForStorage(collection: string, doc: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc)) {
      out[this.runtimeFieldToStore(collection, key)] = value;
    }
    return out;
  }

  private runtimeFieldToStore(collection: string, field: string): string {
    if (field.includes(".")) {
      const [root, ...rest] = field.split(".");
      return assertMongoFieldPath(`${this.runtimeFieldToStore(collection, root as string)}.${rest.join(".")}`);
    }
    if (field === "id") return "_id";
    if (collection.startsWith("radiant-bun_")) return assertMongoFieldPath(field);
    if (STORE_TO_SCHEMA_FIELD.has(field)) return field;
    return assertMongoFieldPath(SCHEMA_TO_STORE_FIELD[field] ?? field);
  }

  private schemaFieldToStore(collection: string, field: string): string {
    if (field === "id") return "_id";
    if (collection.startsWith("radiant-bun_")) return assertMongoFieldPath(field);
    return assertMongoFieldPath(SCHEMA_TO_STORE_FIELD[field] ?? field);
  }

  private storeFieldToSchema(collection: string, field: string): string {
    if (field === "_id") return "id";
    if (collection.startsWith("radiant-bun_")) return field;
    return STORE_TO_SCHEMA_FIELD.get(field) ?? field;
  }

  private buildSort(collection: string, sort?: string): Record<string, 1 | -1> {
    if (!sort) return { _id: 1 };
    const out: Record<string, 1 | -1> = {};
    for (const part of sort.split(",").map((s) => s.trim()).filter(Boolean)) {
      const desc = part.startsWith("-");
      const field = desc ? part.slice(1) : part;
      out[this.runtimeFieldToStore(collection, field)] = desc ? -1 : 1;
    }
    if (!("_id" in out)) out._id = 1;
    return out;
  }

  private decodeCursor(cursor: string): { id: string; sortValue?: unknown } {
    try {
      return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    } catch {
      throw new Error("Invalid cursor");
    }
  }

  private async buildMongoWhere(where: Record<string, unknown>, collection: string): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = [];

    for (const [key, value] of Object.entries(where)) {
      if (key === "or" || key === "and") {
        const clauses = Array.isArray(value) ? value : [];
        const built = await Promise.all(
          clauses.map((clause) => this.buildMongoWhere((clause as Record<string, unknown>) ?? {}, collection)),
        );
        const filtered = built.filter((clause) => Object.keys(clause).length > 0);
        if (filtered.length > 0) {
          conditions.push({ [key === "or" ? "$or" : "$and"]: filtered });
        }
        continue;
      }

      if (key.includes(".")) {
        const [rootField, ...rest] = key.split(".");
        const relatedRadiantCollection = this._relationshipTargets.get(`${collection}.${rootField}`);
        if (relatedRadiantCollection && value && typeof value === "object" && !Array.isArray(value)) {
          const nestedWhere = await this.buildMongoWhere({ [rest.join(".")]: value }, relatedRadiantCollection);
          const relatedDocs = await this.collection(relatedRadiantCollection)
            .find(nestedWhere, { projection: { _id: 1 } })
            .toArray();
          conditions.push({
            [this.runtimeFieldToStore(collection, rootField as string)]: { $in: relatedDocs.map((doc: any) => doc._id) },
          });
          continue;
        }
      }

      const field = this.runtimeFieldToStore(collection, key);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const op = this.buildMongoOperator(field, value as Record<string, unknown>);
        if (op) conditions.push(op);
      } else {
        conditions.push({ [field]: value });
      }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0]!;
    return { $and: conditions };
  }

  private buildMongoOperator(field: string, condition: Record<string, unknown>): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};

    for (const [op, value] of Object.entries(condition)) {
      switch (op) {
        case "eq":
          out[field] = value;
          break;
        case "neq":
          out[field] = { ...(out[field] as object), $ne: value };
          break;
        case "gt":
          out[field] = { ...(out[field] as object), $gt: value };
          break;
        case "gte":
          out[field] = { ...(out[field] as object), $gte: value };
          break;
        case "lt":
          out[field] = { ...(out[field] as object), $lt: value };
          break;
        case "lte":
          out[field] = { ...(out[field] as object), $lte: value };
          break;
        case "in":
          if (Array.isArray(value) && value.length > 0) out[field] = { ...(out[field] as object), $in: value };
          break;
        case "nin":
          if (Array.isArray(value) && value.length > 0) out[field] = { ...(out[field] as object), $nin: value };
          break;
        case "exists":
          out[field] = { ...(out[field] as object), $exists: value === true || value === "true" };
          break;
        case "like":
          out[field] = { ...(out[field] as object), $regex: String(value), $options: "i" };
          break;
        case "contains":
          out[field] = value;
          break;
        case "notContains":
          out[field] = { ...(out[field] as object), $ne: value };
          break;
        case "any":
          if (Array.isArray(value) && value.length > 0) out[field] = { ...(out[field] as object), $in: value };
          break;
        case "all":
          if (Array.isArray(value) && value.length > 0) out[field] = { ...(out[field] as object), $all: value };
          break;
        case "between":
          if (Array.isArray(value) && value.length === 2) {
            out[field] = { ...(out[field] as object), $gte: value[0], $lte: value[1] };
          }
          break;
        case "search":
          out[field] = { ...(out[field] as object), $regex: String(value), $options: "i" };
          break;
      }
    }

    return Object.keys(out).length > 0 ? out : null;
  }

  private async applyRadiantCollectionDefinition(table: TableDefinition): Promise<void> {
    const exists = await this.db()
      .listRadiantCollections({ name: table.name }, { nameOnly: false })
      .toArray();
    const options = this.buildRadiantCollectionOptions(table);
    if (exists.length === 0) {
      await this.db().createRadiantCollection(table.name, options);
    } else {
      await this.db().command({
        collMod: table.name,
        validator: options.validator,
        validationLevel: "moderate",
      });
    }
    await this.ensureIndexes(table.name, table.columns);
  }

  private async applyColumnDefinition(table: string, column: ColumnDefinition): Promise<void> {
    const nextSchema = await this.getExistingTableDefinition(table);
    nextSchema.columns = [
      ...nextSchema.columns.filter((existing) => existing.name !== column.name),
      column,
    ];
    await this.applyRadiantCollectionDefinition(nextSchema);
  }

  private async renameColumn(
    table: string,
    oldName: string,
    newName: string,
    column: ColumnDefinition,
  ): Promise<void> {
    const oldStore = this.schemaFieldToStore(table, oldName);
    const newStore = this.schemaFieldToStore(table, newName);
    if (oldStore !== newStore) {
      await this.collection(table).updateMany({ [oldStore]: { $exists: true } }, { $rename: { [oldStore]: newStore } });
    }

    const nextSchema = await this.getExistingTableDefinition(table);
    nextSchema.columns = nextSchema.columns
      .filter((existing) => existing.name !== oldName && existing.name !== newName)
      .concat([{ ...column, name: newName }]);

    await this.dropFieldIndexes(table, oldName);
    await this.applyRadiantCollectionDefinition(nextSchema);
  }

  private async dropColumn(table: string, column: string): Promise<void> {
    const storeField = this.schemaFieldToStore(table, column);
    await this.collection(table).updateMany({}, { $unset: { [storeField]: "" } });
    const nextSchema = await this.getExistingTableDefinition(table);
    nextSchema.columns = nextSchema.columns.filter((existing) => existing.name !== column);
    await this.dropFieldIndexes(table, column);
    await this.applyRadiantCollectionDefinition(nextSchema);
  }

  private buildRadiantCollectionOptions(table: TableDefinition): Record<string, unknown> {
    return {
      validator: this.buildValidator(table),
      validationLevel: "moderate",
    };
  }

  private buildValidator(table: TableDefinition): Record<string, unknown> {
    const required: string[] = ["_id"];
    const properties: Record<string, unknown> = {
      _id: { bsonType: "string" },
    };

    for (const column of table.columns) {
      if (column.name === "id") continue;
      const field = this.schemaFieldToStore(table.name, column.name);
      properties[field] = {
        bsonType: this.columnToBsonType(column),
      };
      if (column.required) required.push(field);
    }

    return {
      $jsonSchema: {
        bsonType: "object",
        required,
        properties,
        additionalProperties: true,
      },
    };
  }

  private columnToBsonType(column: ColumnDefinition): string | string[] {
    const base = (() => {
      switch (column.fieldType) {
        case "number":
          return "double";
        case "integer":
          return "int";
        case "boolean":
          return "bool";
        case "multiselect":
        case "array":
          return "array";
        case "json":
        case "richtext":
        case "upload":
          return "object";
        default:
          if (column.type === "JSONB") return "object";
          if (column.type === "TEXT[]") return "array";
          return "string";
      }
    })();

    return column.required ? base : [base, "null"];
  }

  private async ensureIndexes(table: string, columns: ColumnDefinition[]): Promise<void> {
    const coll = this.collection(table);
    for (const column of columns) {
      if (column.name === "id") continue;
      const field = this.schemaFieldToStore(table, column.name);
      if (column.unique) {
        await coll.createIndex(
          { [field]: 1 },
          {
            name: `${table}_${field}_unique`,
            unique: true,
            partialFilterExpression: { [field]: { $exists: true, $ne: null } },
          },
        );
      } else if (column.foreignKey) {
        await coll.createIndex({ [field]: 1 }, { name: `${table}_${field}_idx` });
      }
    }
  }

  private async dropFieldIndexes(table: string, column: string): Promise<void> {
    const field = this.schemaFieldToStore(table, column);
    const coll = this.collection(table);
    for (const name of [`${table}_${field}_unique`, `${table}_${field}_idx`, `${table}_${field}_text_idx`]) {
      await coll.dropIndex(name).catch(() => {});
    }
  }

  private async getExistingTableDefinition(table: string): Promise<TableDefinition> {
    const collections = await this.db()
      .listRadiantCollections({ name: table }, { nameOnly: false })
      .toArray();
    const properties = collections[0]?.options?.validator?.$jsonSchema?.properties ?? {};
    const required = new Set<string>(collections[0]?.options?.validator?.$jsonSchema?.required ?? []);
    const columns: ColumnDefinition[] = [{ name: "id", type: "TEXT", required: true, unique: false }];

    for (const key of Object.keys(properties)) {
      if (key === "_id") continue;
      columns.push({
        name: this.storeFieldToSchema(table, key),
        type: "TEXT",
        required: required.has(key),
        unique: false,
      });
    }

    return {
      name: table,
      columns,
      primaryKey: ["id"],
    };
  }
}

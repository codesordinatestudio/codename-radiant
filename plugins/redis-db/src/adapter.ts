import { RedisClient } from "bun";
import type { LucentAdapter, QueryArgs } from "@codesordinatestudio/lucent";

function matchesWhere(doc: Record<string, unknown>, where?: QueryArgs["where"]): boolean {
  if (!where) return true;

  for (const [field, condition] of Object.entries(where)) {
    if (field === "and" && Array.isArray(condition)) {
      if (!condition.every((clause) => matchesWhere(doc, clause as QueryArgs["where"]))) return false;
      continue;
    }
    if (field === "or" && Array.isArray(condition)) {
      if (!condition.some((clause) => matchesWhere(doc, clause as QueryArgs["where"]))) return false;
      continue;
    }

    if (!condition || typeof condition !== "object") {
      if (doc[field] !== condition) return false;
      continue;
    }

    for (const [operator, value] of Object.entries(condition as Record<string, unknown>)) {
      if (operator === "eq" && doc[field] !== value) return false;
      if (operator === "neq" && doc[field] === value) return false;
      if (operator === "gt" && !((doc[field] as number) > (value as number))) return false;
      if (operator === "gte" && !((doc[field] as number) >= (value as number))) return false;
      if (operator === "lt" && !((doc[field] as number) < (value as number))) return false;
      if (operator === "lte" && !((doc[field] as number) <= (value as number))) return false;
      if (operator === "in" && Array.isArray(value) && !value.includes(doc[field])) return false;
      if (operator === "exists") {
        const exists = doc[field] !== undefined && doc[field] !== null;
        if (Boolean(value) !== exists) return false;
      }
    }
  }

  return true;
}

function sortDocs(docs: Record<string, unknown>[], sort?: string): Record<string, unknown>[] {
  if (!sort) return docs;
  const parts = sort.split(",").map((part) => part.trim()).filter(Boolean);
  return [...docs].sort((left, right) => {
    for (const part of parts) {
      const desc = part.startsWith("-");
      const field = desc ? part.slice(1) : part;
      const l = left[field] as string | number;
      const r = right[field] as string | number;
      if (l === r) continue;
      return (l > r ? 1 : -1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

export class RedisAdapter implements LucentAdapter {
  public readonly adapterType = "redis";
  private client: RedisClient;
  private prefix?: string;

  constructor(url: string, prefix?: string) {
    this.client = new RedisClient(url);
    this.prefix = prefix;
  }

  async connect() {}
  async disconnect() {
    this.client.close();
  }
  async ping() {
    await this.client.ping();
  }

  configureCollections() {}

  async getCurrentSchema() {
    return { tables: [], columns: {} };
  }

  getSystemTableStatements() {
    return [];
  }

  createTableDDL(table: unknown) {
    return `CREATE TABLE ${String((table as { name: string }).name)}`;
  }

  async recordMigration() {}

  private getDocKey(collection: string, id: string) {
    return this.prefix ? `${this.prefix}:${collection}:${id}` : `${collection}:${id}`;
  }

  private getCollectionIdsKey(collection: string) {
    return this.prefix ? `${this.prefix}:${collection}:ids` : `${collection}:ids`;
  }

  async find(collection: string, query: QueryArgs = {}) {
    const limit = query.limit ?? 10;
    const page = query.page ?? 1;

    // Get all IDs
    const ids = await this.client.smembers(this.getCollectionIdsKey(collection));
    
    // Fetch all docs
    const docs = await this.findByIds(collection, ids);

    // Filter and sort
    const filtered = sortDocs(docs.filter((doc) => matchesWhere(doc, query.where)), query.sort);
    
    // Paginate
    const offset = (page - 1) * limit;
    const paginatedDocs = filtered.slice(offset, offset + limit);
    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

    return {
      docs: paginatedDocs,
      totalDocs: filtered.length,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
    const raw = await this.client.get(this.getDocKey(collection, id));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async findByIds(collection: string, ids: string[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const keys = ids.map(id => this.getDocKey(collection, id));
    
    // Fallback if mget is not fully supported or we want to do multiple gets
    const results: Record<string, unknown>[] = [];
    for (const key of keys) {
      const raw = await this.client.get(key);
      if (raw) {
        try {
          results.push(JSON.parse(raw));
        } catch {}
      }
    }
    return results;
  }

  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = String(data.id ?? Bun.randomUUIDv7());
    const doc = { ...data, id };
    
    await this.client.set(this.getDocKey(collection, id), JSON.stringify(doc));
    await this.client.sadd(this.getCollectionIdsKey(collection), id);
    
    return doc;
  }

  async createMany(collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const results = [];
    for (const doc of docs) {
      results.push(await this.create(collection, doc));
    }
    return results;
  }

  async update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.findById(collection, id) ?? {};
    const doc = { ...existing, ...data, id };
    
    await this.client.set(this.getDocKey(collection, id), JSON.stringify(doc));
    // sadd just in case it wasn't there
    await this.client.sadd(this.getCollectionIdsKey(collection), id);
    
    return doc;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.client.del(this.getDocKey(collection, id));
    await this.client.srem(this.getCollectionIdsKey(collection), id);
  }

  async deleteMany(collection: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.delete(collection, id);
    }
  }

  async count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number> {
    const ids = await this.client.smembers(this.getCollectionIdsKey(collection));
    const docs = await this.findByIds(collection, ids);
    return docs.filter((doc) => matchesWhere(doc, query?.where)).length;
  }

  async raw(): Promise<unknown[]> {
    return [];
  }
}

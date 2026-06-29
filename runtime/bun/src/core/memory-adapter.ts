import type { RadiantAdapter, QueryArgs, PaginatedResult } from "./";

export class MemoryAdapter implements RadiantAdapter {
  name = "memory";
  readonly adapterType = "memory";
  private store: Record<string, Record<string, unknown>[]> = {};

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async ping(): Promise<void> {}

  async find(collection: string, query: QueryArgs): Promise<PaginatedResult> {
    const docs = this.store[collection] || [];
    let result = [...docs];

    // Simple filtering based on query.where
    if (query.where) {
      for (const [key, filter] of Object.entries(query.where)) {
        if (filter?.eq !== undefined) {
          result = result.filter(d => d[key] === filter.eq);
        }
      }
    }

    return {
      docs: result,
      totalDocs: result.length,
      limit: 10,
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false
    };
  }

  async findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
    const docs = this.store[collection] || [];
    return docs.find((d) => d.id === id) || null;
  }

  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.store[collection]) this.store[collection] = [];
    
    // Auto-generate id if not provided
    const doc = {
      ...data,
      id: data.id || Math.random().toString(36).substr(2, 9),
    };
    this.store[collection].push(doc);
    return doc;
  }

  async update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const docs = this.store[collection] || [];
    const index = docs.findIndex((d) => d.id === id);
    if (index === -1) throw new Error(`Document not found`);

    const updated = { ...docs[index], ...data };
    this.store[collection][index] = updated;
    return updated;
  }

  async delete(collection: string, id: string): Promise<void> {
    if (!this.store[collection]) return;
    this.store[collection] = this.store[collection].filter((d) => d.id !== id);
  }

  async count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number> {
    const res = await this.find(collection, { where: query?.where });
    return res.totalDocs;
  }
}

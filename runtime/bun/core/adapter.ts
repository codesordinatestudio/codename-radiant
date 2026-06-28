export interface RadiantAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  find(collection: string, query: QueryArgs): Promise<PaginatedResult>;
  findById(collection: string, id: string): Promise<Record<string, unknown> | null>;
  create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(collection: string, id: string): Promise<void>;
  count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number>;
}

export interface QueryArgs {
  where?: Record<string, any>;
  sort?: string;
  limit?: number;
  page?: number;
}

export interface PaginatedResult {
  docs: Record<string, unknown>[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

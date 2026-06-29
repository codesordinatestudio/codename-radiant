export type ConstraintType = "foreign_key" | "unique" | "not_null" | "check";

export interface ParsedConstraintError {
  type: ConstraintType;
  table?: string;
  column?: string;
  constraint?: string;
  referencedTable?: string;
  referencedColumn?: string;
  rawMessage: string;
}

export interface RadiantAdapter {
  readonly adapterType: string;
  name?: string; // Kept for backwards compatibility with earlier Radiant code
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping?(): Promise<void>;
  configureCollections?(collections: any[]): void;
  getStartupInfo?(): { createdResourceName?: string | null };
  getSystemTableStatements?(): string[];
  getCurrentSchema?(): Promise<{ tables: string[]; columns: Record<string, string[]> }>;
  recordMigration?(version: string, description: string): Promise<void>;
  getCurrentMigrationVersion?(): Promise<string | null>;
  parseConstraintError?(error: unknown): ParsedConstraintError | null;
  createTableDDL?(table: unknown): string;
  renameColumnDDL?(table: string, oldName: string, newName: string, column?: unknown): string;
  addColumnDDL?(table: string, column: unknown): string | null;
  dropColumnDDL?(table: string, column: string): string;
  dropTableDDL?(table: string): string;
  supportsGeneratedConstraintSQL?: boolean;
  find(collection: string, query: QueryArgs): Promise<PaginatedResult>;
  findById(collection: string, id: string): Promise<Record<string, unknown> | null>;
  findByIds?(collection: string, ids: string[]): Promise<Record<string, unknown>[]>;
  create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  createMany?(collection: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]>;
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(collection: string, id: string): Promise<void>;
  deleteMany?(collection: string, ids: string[]): Promise<void>;
  count(collection: string, query?: Pick<QueryArgs, "where">): Promise<number>;
  raw?(sql: string, params?: unknown[]): Promise<unknown>;
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

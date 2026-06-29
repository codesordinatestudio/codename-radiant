import type { CollectionConfig, FieldConfig } from "@codesordinatestudio/radiant-bun/core";

export type SQLiteType = "TEXT" | "INTEGER" | "REAL" | "BLOB";

export interface ColumnDefinition {
  name: string;
  type: SQLiteType;
  required: boolean;
  unique: boolean;
  defaultValue?: any;
  foreignKey?: { table: string; column: string; onDelete?: string };
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey: string[];
}

export function fieldTypeToSQLite(field: FieldConfig): SQLiteType {
  switch (field.type) {
    case "boolean":
    case "integer":
      return "INTEGER";
    case "number":
      return "REAL";
    default:
      return "TEXT";
  }
}

export function buildColumns(collection: CollectionConfig): ColumnDefinition[] {
  const columns: ColumnDefinition[] = [];

  columns.push({
    name: "id",
    type: "TEXT",
    required: true,
    unique: false,
  });

  for (const field of collection.fields) {
    const col: ColumnDefinition = {
      name: field.name,
      type: fieldTypeToSQLite(field),
      required: !field.optional,
      unique: field.unique || false,
      defaultValue: field.default,
    };

    if (field.type === "relationship" && field.target) {
      col.foreignKey = {
        table: field.target,
        column: "id",
        onDelete: "SET NULL",
      };
    }
    
    columns.push(col);
  }

  columns.push({
    name: "createdAt",
    type: "TEXT",
    required: true,
    unique: false,
    defaultValue: "CURRENT_TIMESTAMP",
  });
  
  columns.push({
    name: "updatedAt",
    type: "TEXT",
    required: true,
    unique: false,
    defaultValue: "CURRENT_TIMESTAMP",
  });

  return columns;
}

export function buildTable(collection: CollectionConfig): TableDefinition {
  return {
    name: collection.slug,
    columns: buildColumns(collection),
    primaryKey: ["id"],
  };
}

function formatDefaultValue(value: unknown): string {
  if (value === "CURRENT_TIMESTAMP") return "CURRENT_TIMESTAMP";
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

function generateColumnDefinition(column: ColumnDefinition): string {
  let def = `"${column.name}" ${column.type}`;
  if (column.required) def += " NOT NULL";
  if (column.defaultValue !== undefined) {
    def += ` DEFAULT ${formatDefaultValue(column.defaultValue)}`;
  }
  if (column.unique) def += " UNIQUE";
  return def;
}

export function generateCreateTable(table: TableDefinition): string {
  const columnDefs = table.columns.map((col) => generateColumnDefinition(col)).join(",\n  ");
  const fkConstraints = table.columns
    .filter((col) => col.foreignKey)
    .map((col) => {
      const fk = col.foreignKey!;
      return `  CONSTRAINT ${table.name}_${col.name}_fkey FOREIGN KEY ("${col.name}") REFERENCES ${fk.table}("${fk.column}") ON DELETE ${fk.onDelete || "SET NULL"}`;
    });

  const allDefs = [
    `  ${columnDefs}`,
    `  PRIMARY KEY (${table.primaryKey.map((pk) => `"${pk}"`).join(", ")})`,
    ...fkConstraints,
  ].join(",\n");

  const fkIndexes = table.columns
    .filter((col) => col.foreignKey)
    .map((col) => `CREATE INDEX IF NOT EXISTS ${table.name}_${col.name}_idx ON ${table.name}("${col.name}");`);

  return [
    `CREATE TABLE IF NOT EXISTS ${table.name} (\n${allDefs}\n);`,
    ...fkIndexes,
  ].join("\n");
}

export function generateRenameColumn(tableName: string, oldName: string, newName: string): string {
  return `ALTER TABLE ${tableName} RENAME COLUMN "${oldName}" TO "${newName}";`;
}

export function generateAddColumn(tableName: string, column: ColumnDefinition): string {
  return `ALTER TABLE ${tableName} ADD COLUMN ${generateColumnDefinition(column)};`;
}

export function generateSystemTables(): string[] {
  const statements: string[] = [];

  statements.push(`CREATE TABLE IF NOT EXISTS radiant_migrations (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);`);

  return statements;
}

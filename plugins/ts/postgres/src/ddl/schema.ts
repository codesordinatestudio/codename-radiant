import type { CollectionConfig, FieldConfig } from "@codesordinatestudio/radiant-bun/core";

export type PostgresType = "TEXT" | "BOOLEAN" | "INTEGER" | "NUMERIC" | "TIMESTAMPTZ" | "JSONB" | "UUID" | "TEXT[]";

export interface ColumnDefinition {
  name: string;
  type: PostgresType;
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

export function fieldTypeToPostgres(field: FieldConfig): PostgresType {
  switch (field.type) {
    case "text":
    case "textarea":
    case "email":
    case "password":
    case "select":
      return "TEXT";
    case "multiselect":
      return "TEXT[]";
    case "boolean":
      return "BOOLEAN";
    case "integer":
      return "INTEGER";
    case "number":
      return "NUMERIC";
    case "date":
      return "TIMESTAMPTZ";
    case "array":
    case "json":
    case "richtext":
    case "upload":
      return "JSONB";
    case "relationship":
      return "UUID";
    default:
      return "TEXT";
  }
}

export function buildColumns(collection: CollectionConfig): ColumnDefinition[] {
  const columns: ColumnDefinition[] = [];

  // Add primary key
  columns.push({
    name: "id",
    type: "UUID",
    required: true,
    unique: false,
  });

  // Add fields
  for (const field of collection.fields) {
    const col: ColumnDefinition = {
      name: field.name,
      type: fieldTypeToPostgres(field),
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

  // System fields
  columns.push({
    name: "createdAt",
    type: "TIMESTAMPTZ",
    required: true,
    unique: false,
    defaultValue: "now()",
  });
  
  columns.push({
    name: "updatedAt",
    type: "TIMESTAMPTZ",
    required: true,
    unique: false,
    defaultValue: "now()",
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
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "string" && value.includes("()")) return value;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT now(),
  description TEXT
);`);

  return statements;
}

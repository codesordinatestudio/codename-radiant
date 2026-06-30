import { Type, type TSchema } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { RadiantError } from "../utils/error";
import type { CollectionConfig, FieldConfig } from "./types";

// System fields that should never be accepted from client input
const SYSTEM_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

/**
 * Build a TypeBox object schema for creating a document in the given collection.
 * - Required fields (non-optional, non-password) are marked required
 * - `password` is required on create
 * - System fields (id, createdAt, updatedAt) are omitted from input
 * - Undeclared fields are not allowed (TypeCompiler strict mode)
 */
export function buildCollectionCreateSchema(collection: CollectionConfig): TSchema {
  const properties: Record<string, TSchema> = {};
  const required: string[] = [];

  for (const field of collection.fields) {
    if (SYSTEM_FIELDS.has(field.name)) continue;

    const schema = fieldToTypeBox(field);
    properties[field.name] = schema;

    // Required unless explicitly optional or has a default value
    // (fields with defaults are filled by the adapter, not the client)
    if (!field.optional && field.default === undefined && field.type !== "password") {
      required.push(field.name);
    }
    // password is required on create for auth collections
    if (field.type === "password" && collection.auth) {
      required.push(field.name);
    }
  }

  return Type.Object(properties, { additionalProperties: false, required });
}

/**
 * Build a TypeBox object schema for updating a document in the given collection.
 * - All fields are optional (partial update)
 * - System fields (id, createdAt, updatedAt) are omitted from input
 * - Undeclared fields are not allowed
 */
export function buildCollectionUpdateSchema(collection: CollectionConfig): TSchema {
  const properties: Record<string, TSchema> = {};

  for (const field of collection.fields) {
    if (SYSTEM_FIELDS.has(field.name)) continue;

    const schema = fieldToTypeBox(field);
    // Make all fields optional for update
    properties[field.name] = Type.Optional(schema);
  }

  return Type.Object(properties, { additionalProperties: false });
}

/**
 * Map a Radiant field type to a TypeBox schema.
 */
function fieldToTypeBox(field: FieldConfig): TSchema {
  let schema: TSchema;

  switch (field.type) {
    case "string":
    case "text":
    case "textarea":
    case "richtext":
    case "email":
    case "password":
      schema = Type.String();
      break;
    case "boolean":
      schema = Type.Boolean();
      break;
    case "number":
    case "integer":
      schema = Type.Number();
      break;
    case "date":
      schema = Type.String({ format: "date-time" });
      break;
    case "json":
      schema = Type.Unknown();
      break;
    case "select":
    case "multiselect":
      if (field.values && field.values.length > 0) {
        schema = Type.Union(field.values.map((v) => Type.Literal(v)));
      } else {
        schema = Type.String();
      }
      break;
    case "enum":
      if (field.values && field.values.length > 0) {
        schema = Type.Union(field.values.map((v) => Type.Literal(v)));
      } else {
        schema = Type.String();
      }
      break;
    case "relationship":
      schema = Type.String();
      break;
    case "upload":
      schema = Type.String();
      break;
    case "array":
      // Arrays of objects or scalars — accept any array shape for now
      schema = Type.Array(Type.Unknown());
      break;
    case "object":
      schema = Type.Record(Type.String(), Type.Unknown());
      break;
    default:
      schema = Type.Unknown();
  }

  // Wrap in array if field.isArray
  if ((field as any).isArray) {
    schema = Type.Array(schema);
  }

  // Make optional if flagged or has a default value
  // (fields with defaults are filled by the adapter, not the client)
  if (field.optional || field.default !== undefined) {
    schema = Type.Optional(schema);
  }

  return schema;
}

/**
 * Compiled validator cache — avoids recompiling TypeBox schemas on every request.
 */
const compiledCreateCache = new Map<string, ReturnType<typeof TypeCompiler.Compile>>();
const compiledUpdateCache = new Map<string, ReturnType<typeof TypeCompiler.Compile>>();

/**
 * Validate data against the collection's create schema.
 * Throws RadiantError.BadRequest on validation failure.
 * If the collection has no fields defined, validation is skipped (cannot validate against nothing).
 */
export function validateCreate(collection: CollectionConfig, data: unknown): Record<string, unknown> {
  // Skip validation if the collection has no declared fields
  if (!collection.fields || collection.fields.length === 0) {
    return data as Record<string, unknown>;
  }

  let check = compiledCreateCache.get(collection.slug);
  if (!check) {
    const schema = buildCollectionCreateSchema(collection);
    check = TypeCompiler.Compile(schema);
    compiledCreateCache.set(collection.slug, check);
  }

  if (!check.Check(data)) {
    const firstError = check.Errors(data).First();
    const path = firstError?.path ? ` at ${firstError.path}` : "";
    const message = firstError?.message
      ? `Validation error${path}: ${firstError.message}`
      : `Validation error${path}`;
    throw RadiantError.BadRequest(message);
  }

  return data as Record<string, unknown>;
}

/**
 * Validate data against the collection's update schema.
 * Throws RadiantError.BadRequest on validation failure.
 * If the collection has no fields defined, validation is skipped.
 */
export function validateUpdate(collection: CollectionConfig, data: unknown): Record<string, unknown> {
  // Skip validation if the collection has no declared fields
  if (!collection.fields || collection.fields.length === 0) {
    return data as Record<string, unknown>;
  }

  let check = compiledUpdateCache.get(collection.slug);
  if (!check) {
    const schema = buildCollectionUpdateSchema(collection);
    check = TypeCompiler.Compile(schema);
    compiledUpdateCache.set(collection.slug, check);
  }

  if (!check.Check(data)) {
    const firstError = check.Errors(data).First();
    const path = firstError?.path ? ` at ${firstError.path}` : "";
    const message = firstError?.message
      ? `Validation error${path}: ${firstError.message}`
      : `Validation error${path}`;
    throw RadiantError.BadRequest(message);
  }

  return data as Record<string, unknown>;
}
import type { IToken } from "chevrotain";

// ─── Error Class ────────────────────────────────────────────────────────────

export class SemanticError extends Error {
  public token: IToken;
  public uri?: string;
  constructor(message: string, token: IToken, uri?: string) {
    super(message);
    this.token = token;
    this.uri = uri;
    this.name = "SemanticError";
  }
}

// ─── Allowed-Key Registries ─────────────────────────────────────────────────

const ALLOWED_CONFIG = new Set(["core", "security", "monitoring", "adminUI", "apiPrefix", "migrate", "output"]);
const ALLOWED_CORE = new Set(["api", "openapi", "upload"]);
const ALLOWED_SECURITY = new Set(["auth", "cors", "rateLimit", "headers", "secrets", "audit"]);
const ALLOWED_AUTH = new Set(["strategies", "jwt", "session", "apiKey", "passwordPolicy", "lockout"]);
const ALLOWED_MONITORING = new Set(["healthCheck", "requestId", "apiKey", "enabled"]);
const ALLOWED_COLLECTION = new Set(["auth", "fields", "realtime", "cache", "hooks", "admin"]);
const ALLOWED_MIGRATE = new Set(["dropOrphan"]);

const ALLOWED_FIELD_TYPES = new Set([
  "array",
  "boolean",
  "date",
  "email",
  "enum",
  "integer",
  "json",
  "multiselect",
  "number",
  "password",
  "relationship",
  "richtext",
  "select",
  "text",
  "textarea",
  "upload",
]);

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validates that `prop.value` is an object block, then checks each of its
 * child properties against an allowed-key set.  Optionally runs a nested
 * validator on specific child properties (used for security → auth).
 */
function validateObjectBlock(
  prop: any,
  allowedKeys: Set<string>,
  blockLabel: string,
  uri: string | undefined,
  errors: SemanticError[],
  nestedValidators?: Record<string, (childProp: any) => void>,
): void {
  if (!prop.value || prop.value.type !== "object" || !Array.isArray(prop.value.properties)) {
    errors.push(new SemanticError(`Expected an object block for '${prop.name}'`, prop.nameToken, uri));
    return;
  }

  for (const child of prop.value.properties) {
    if (!allowedKeys.has(child.name)) {
      errors.push(
        new SemanticError(`Unknown property '${child.name}' in ${blockLabel} block.`, child.nameToken, uri),
      );
    }
    nestedValidators?.[child.name]?.(child);
  }
}

// ─── Block Compilers ────────────────────────────────────────────────────────

/**
 * Validates and compiles a `config { … }` block.
 * Returns the compiled key-value pairs to merge into the root schema.
 */
function compileConfigBlock(body: any[], uri: string | undefined, errors: SemanticError[]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const prop of body) {
    // Top-level key check
    if (!ALLOWED_CONFIG.has(prop.name)) {
      errors.push(new SemanticError(`Unknown property '${prop.name}' in config block.`, prop.nameToken, uri));
    }

    // Nested object validation for specific sub-blocks
    if (prop.name === "core") {
      validateObjectBlock(prop, ALLOWED_CORE, "core", uri, errors);
    }

    if (prop.name === "security") {
      validateObjectBlock(prop, ALLOWED_SECURITY, "security", uri, errors, {
        // security.auth gets its own nested validation
        auth(authProp: any) {
          validateObjectBlock(authProp, ALLOWED_AUTH, "auth", uri, errors);
        },
      });
    }

    if (prop.name === "monitoring") {
      validateObjectBlock(prop, ALLOWED_MONITORING, "monitoring", uri, errors);
    }

    if (prop.name === "migrate") {
      validateObjectBlock(prop, ALLOWED_MIGRATE, "migrate", uri, errors);
    }

    result[prop.name] = compileValue(prop.value);
  }

  return result;
}

/**
 * Compiles a `collection` or `global` block into a schema entity.
 * Both block types share the same structure (slug, uri, fields, extra props).
 */
function compileEntityBlock(
  block: any,
  uri: string | undefined,
  entityType: "collection" | "global",
  errors: SemanticError[],
): any {
  const entity: any = {
    slug: block.name,
    uri,
    fields: [],
  };

  for (const prop of block.body) {
    if (!ALLOWED_COLLECTION.has(prop.name)) {
      errors.push(
        new SemanticError(`Unknown property '${prop.name}' in ${entityType} block.`, prop.nameToken, uri),
      );
    }

    if (prop.name === "fields") {
      if (prop.value && prop.value.type === "object") {
        for (const field of prop.value.properties) {
          entity.fields.push(compileField(field));
        }
      }
    } else {
      entity[prop.name] = compileValue(prop.value);
    }
  }

  return entity;
}

// ─── Field Validation ───────────────────────────────────────────────────────

/**
 * Validates compiled fields (type existence, relationship targets, select options)
 * for both collections and globals in a single pass.
 */
function validateFields(
  entities: any[],
  entityType: "collection" | "global",
  seenCollections: Map<string, IToken>,
  errors: SemanticError[],
): void {
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (!ALLOWED_FIELD_TYPES.has(field.type)) {
        errors.push(
          new SemanticError(
            `Validation Error: Unknown field type '${field.type}' in ${entityType} '${entity.slug}'.`,
            field.typeToken || field.nameToken,
            entity.uri,
          ),
        );
      }

      if (field.type === "relationship" && !seenCollections.has(field.target)) {
        const label = entityType === "collection" ? "Collection" : "Global";
        errors.push(
          new SemanticError(
            `Validation Error: ${label} '${entity.slug}' relates to a non-existent collection '${field.target}'.`,
            field.targetToken,
            entity.uri,
          ),
        );
      }

      if (field.type === "select" && (!field.options || field.options.length === 0)) {
        errors.push(
          new SemanticError(
            `Validation Error: 'select' requires at least one option. Example: select("draft", "published")`,
            field.typeToken || field.nameToken,
            entity.uri,
          ),
        );
      }
    }
  }
}

// ─── Main Compiler ──────────────────────────────────────────────────────────

export function compile(rawAsts: any[]): { schema: any; errors: SemanticError[] } {
  const schema: any = {
    collections: [],
    globals: [],
  };
  const errors: SemanticError[] = [];
  const seenCollections = new Map<string, IToken>();
  const seenGlobals = new Map<string, IToken>();

  // Phase 1: Traverse ASTs and compile each block
  for (const ast of rawAsts) {
    if (!ast || !ast.blocks) continue;

    for (const block of ast.blocks) {
      if (block.type === "config") {
        Object.assign(schema, compileConfigBlock(block.body, ast.uri, errors));
      } else if (block.type === "collection") {
        if (seenCollections.has(block.name)) {
          errors.push(
            new SemanticError(`Duplicate collection name '${block.name}' defined.`, block.nameToken, ast.uri),
          );
        } else {
          seenCollections.set(block.name, block.nameToken);
        }
        schema.collections.push(compileEntityBlock(block, ast.uri, "collection", errors));
      } else if (block.type === "global") {
        if (seenGlobals.has(block.name)) {
          errors.push(
            new SemanticError(`Duplicate global name '${block.name}' defined.`, block.nameToken, ast.uri),
          );
        } else {
          seenGlobals.set(block.name, block.nameToken);
        }
        schema.globals.push(compileEntityBlock(block, ast.uri, "global", errors));
      }
    }
  }

  // Phase 2: Validate field types and relationship targets
  validateFields(schema.collections, "collection", seenCollections, errors);
  validateFields(schema.globals, "global", seenCollections, errors);

  // Phase 3: Auto-inject system collections if features are enabled
  if (schema.security?.audit?.enabled) {
    schema.collections.push({
      slug: "radiant_audit_log",
      uri: "internal://system",
      fields: [
        { name: "action", type: "text" },
        { name: "collection", type: "text", optional: true },
        { name: "recordId", type: "text", optional: true },
        { name: "userId", type: "text", optional: true },
        { name: "metadata", type: "json", optional: true },
        { name: "hmac", type: "text" },
        { name: "prevHmac", type: "text", optional: true },
        { name: "createdAt", type: "date" }
      ]
    });
  }

  return { schema, errors };
}

// ─── Value & Field Compilers ────────────────────────────────────────────────

function compileValue(val: any): any {
  if (val && typeof val === "object") {
    if (val.type === "object") {
      const obj: any = {};
      val.properties.forEach((p: any) => {
        obj[p.name] = compileValue(p.value);
      });
      return obj;
    }
    if (val.type === "array") {
      return val.elements.map(compileValue);
    }
    if (val.type === "identifier") {
      return val.name;
    }
    if (val.type === "function" && val.name === "env") {
      if (!val.args || val.args.length === 0 || typeof val.args[0] !== "string") {
        throw new Error("env() manipulator requires at least one string argument for the environment variable name.");
      }
      return {
        $env: val.args[0],
        $default: val.args[1] !== undefined ? val.args[1] : null,
      };
    }
  }
  return val;
}

function compileField(field: any): any {
  const result: any = {
    name: field.name,
    nameToken: field.nameToken,
    typeToken: field.value?.token || field.nameToken,
  };

  if (field.value && typeof field.value === "object") {
    if (field.value.type === "identifier") {
      result.type = field.value.name;
    } else if (field.value.type === "function") {
      result.type = field.value.name; // e.g. "relationship"
      if (field.value.name === "relationship" && field.value.args.length > 0) {
        result.target = field.value.args[0]; // Wait, if args is a string literal, we don't have its token!
        // But we attached token to functionOrIdentifier itself! Let's use the function token.
        result.targetToken = field.value.token;
      }
      if (field.value.name === "select") {
        result.options = field.value.args || [];
      }
    } else if (field.value.type === "array") {
      result.type = "enum";
      result.values = field.value.elements;
    } else if (field.value.type === "object") {
      result.type = "object";
      result.fields = [];
      field.value.properties.forEach((p: any) => result.fields.push(compileField(p)));
    }
  } else {
    result.type = field.value;
  }

  if (field.isArray) {
    result.isArray = true;
  }

  if (field.decorators && field.decorators.length > 0) {
    field.decorators.forEach((dec: any) => {
      if (dec.name === "unique") result.unique = true;
      else if (dec.name === "optional") result.optional = true;
      else if (dec.name === "default") result.default = dec.args[0];
    });
  }

  return result;
}

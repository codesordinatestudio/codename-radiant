import type { RadiantAST, CollectionConfig, FieldConfig } from "./types";

export type OpenAPIRouteDetail = Record<string, unknown> & {
  description?: string;
  summary?: string;
  tags?: string[];
};

export type OpenAPIRouteHooks = Record<string, unknown> & {
  body?: unknown;
  detail?: OpenAPIRouteDetail;
  query?: unknown;
  response?: unknown;
  tags?: string[];
};

export type OpenAPIRoute = {
  hooks?: OpenAPIRouteHooks;
  method?: string;
  path?: string;
};

export type OpenAPIRouteApp = {
  routes?: Iterable<OpenAPIRoute>;
};

export function generateScalarHTML(specUrl: string, title: string = "Radiant API"): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <title>${title} - API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; }
      * { font-family: 'Inter', sans-serif !important; }
    </style>
  </head>
  <body>
    <!-- Mount Scalar UI -->
    <script
      id="api-reference"
      data-url="${specUrl}"
      data-theme="purple"
      data-layout="modern"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
  `;
}

function fieldToSchema(field: FieldConfig): any {
  let type = "string";
  let format = undefined;

  switch (field.type) {
    case "string":
    case "text":
      type = "string";
      break;
    case "email":
      type = "string";
      format = "email";
      break;
    case "password":
      type = "string";
      format = "password";
      break;
    case "boolean":
      type = "boolean";
      break;
    case "number":
    case "integer":
      type = "number";
      break;
    case "date":
      type = "string";
      format = "date-time";
      break;
  }

  const schema: any = { type };
  if (format) schema.format = format;
  if (field.values) schema.enum = field.values;
  if (field.optional) schema.nullable = true;
  if (field.default !== undefined) schema.default = field.default;

  return schema;
}

function buildCollectionSchema(collection: CollectionConfig, isInput = false): any {
  const properties: Record<string, any> = {
    id: { type: "string", format: "uuid" },
  };
  const required: string[] = [];

  for (const field of collection.fields) {
    if (field.type === "password" && !isInput) continue; // Hide passwords in output
    
    properties[field.name] = fieldToSchema(field);
    if (!field.optional && !isInput) required.push(field.name);
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

const _TB_KIND = Symbol.for("TypeBox.Kind");
const _TB_MODIFIER = Symbol.for("TypeBox.Modifier");

function typeboxToOpenAPISchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return {};
  const s = schema as Record<string | symbol, unknown>;
  const kind = s[_TB_KIND] as string | undefined;

  switch (kind) {
    case "String":
    case "RegExp":
    case "TemplateLiteral":
      return { type: "string" };
    case "Number":
      return { type: "number" };
    case "Integer":
      return { type: "integer" };
    case "Boolean":
      return { type: "boolean" };
    case "Null":
      return { type: "null" };
    case "Any":
    case "Unknown":
      return {};
    case "Void":
      return {};
    case "Date":
      return { type: "string", format: "date-time" };
    case "File":
    case "Blob":
      return { type: "string", format: "binary" };
    case "Literal": {
      const val = s["const"];
      const t = typeof val;
      return t === "string"
        ? { type: "string", enum: [val] }
        : t === "number"
          ? { type: "number", enum: [val] }
          : { type: "boolean", enum: [val] };
    }
    case "Array":
      return { type: "array", items: typeboxToOpenAPISchema(s["items"]) };
    case "Tuple": {
      const items = (s["items"] as unknown[]) ?? [];
      return { type: "array", prefixItems: items.map(typeboxToOpenAPISchema), maxItems: items.length };
    }
    case "Union": {
      const variants = (s["anyOf"] as unknown[]) ?? [];
      return { oneOf: variants.map(typeboxToOpenAPISchema) };
    }
    case "Intersect": {
      const variants = (s["allOf"] as unknown[]) ?? [];
      return { allOf: variants.map(typeboxToOpenAPISchema) };
    }
    case "Object": {
      const properties = (s["properties"] as Record<string, unknown>) ?? {};
      const required = (s["required"] as string[]) ?? [];
      const props: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(properties)) {
        props[key] = typeboxToOpenAPISchema(val);
      }
      return {
        type: "object",
        properties: props,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    default: {
      if (s[_TB_MODIFIER] === "Optional") {
        const { [_TB_MODIFIER]: _m, ...rest } = s;
        return typeboxToOpenAPISchema(rest);
      }
      try {
        const clean = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
        delete clean["$schema"];
        return clean;
      } catch {
        return {};
      }
    }
  }
}

function schemaHasFileField(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string | symbol, unknown>;
  const kind = s[_TB_KIND] as string | undefined;
  if (kind === "File" || kind === "Blob") return true;
  if (kind === "Object") {
    const props = (s["properties"] as Record<string, unknown>) ?? {};
    return Object.values(props).some(schemaHasFileField);
  }
  return false;
}

function buildRequestBody(bodySchema: unknown): Record<string, unknown> {
  const oaSchema = typeboxToOpenAPISchema(bodySchema);
  const contentType = schemaHasFileField(bodySchema) ? "multipart/form-data" : "application/json";
  return {
    required: true,
    content: { [contentType]: { schema: oaSchema } },
  };
}

function buildQueryParameters(querySchema: unknown): Record<string, unknown>[] {
  if (!querySchema || typeof querySchema !== "object") return [];
  const s = querySchema as Record<string | symbol, unknown>;
  if ((s[_TB_KIND] as string) !== "Object") return [];
  const properties = (s["properties"] as Record<string, unknown>) ?? {};
  const required = new Set<string>((s["required"] as string[]) ?? []);
  return Object.entries(properties).map(([name, val]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema: typeboxToOpenAPISchema(val),
  }));
}

function buildResponsesFromSchema(responseSchema: unknown): Record<string, unknown> {
  if (!responseSchema || typeof responseSchema !== "object") {
    return { "200": { description: "OK" } };
  }
  const s = responseSchema as Record<string | symbol, unknown>;
  const kind = s[_TB_KIND] as string | undefined;

  if (kind) {
    const oaSchema = typeboxToOpenAPISchema(responseSchema);
    const isEmpty = Object.keys(oaSchema).length === 0;
    return {
      "200": {
        description: "OK",
        ...(!isEmpty ? { content: { "application/json": { schema: oaSchema } } } : {}),
      },
    };
  }

  const responses: Record<string, unknown> = {};
  for (const [statusCode, val] of Object.entries(s as Record<string, unknown>)) {
    if (!/^\d{3}$/.test(statusCode)) continue;
    const valSchema = typeboxToOpenAPISchema(val);
    const isEmpty = Object.keys(valSchema).length === 0;
    responses[statusCode] = {
      description: httpStatusDescription(Number(statusCode)),
      ...(!isEmpty ? { content: { "application/json": { schema: valSchema } } } : {}),
    };
  }
  return Object.keys(responses).length > 0 ? responses : { "200": { description: "OK" } };
}

function httpStatusDescription(code: number): string {
  const map: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
  };
  return map[code] ?? "Response";
}

export function generateOpenAPISpec(schema: RadiantAST, serverUrl: string, prefix: string, app?: OpenAPIRouteApp): any {
  const paths: Record<string, any> = {};
  const components: Record<string, any> = { schemas: {} };

  for (const collection of schema.collections) {
    const slug = collection.slug;
    const tag = slug.charAt(0).toUpperCase() + slug.slice(1);
    const schemaRefName = tag;

    components.schemas[schemaRefName] = buildCollectionSchema(collection);
    components.schemas[`${schemaRefName}Input`] = buildCollectionSchema(collection, true);

    const basePath = `${prefix}/${slug}`;
    const itemPath = `${basePath}/{id}`;

    paths[basePath] = {
      get: {
        tags: [tag],
        summary: `List ${slug}`,
        responses: {
          "200": {
            description: "List of documents",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: `#/components/schemas/${schemaRefName}` } }
              }
            }
          }
        }
      },
      post: {
        tags: [tag],
        summary: `Create ${slug}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaRefName}Input` }
            }
          }
        },
        responses: {
          "201": {
            description: "Document created",
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${schemaRefName}` }
              }
            }
          }
        }
      }
    };

    paths[itemPath] = {
      get: {
        tags: [tag],
        summary: `Get ${slug} by ID`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Document",
            content: {
              "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}` } }
            }
          }
        }
      },
      patch: {
        tags: [tag],
        summary: `Update ${slug}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}Input` } }
          }
        },
        responses: {
          "200": {
            description: "Document updated",
            content: {
              "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}` } }
            }
          }
        }
      },
      delete: {
        tags: [tag],
        summary: `Delete ${slug}`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Document deleted" }
        }
      }
    };

    if (collection.auth) {
      const registerRequired = ["email", "password"];
      const registerProperties: Record<string, any> = {
        email: { type: "string", format: "email" },
        password: { type: "string", format: "password" }
      };

      for (const field of collection.fields) {
        if (field.name !== "email" && field.name !== "password") {
          registerProperties[field.name] = fieldToSchema(field);
          if (!field.optional) registerRequired.push(field.name);
        }
      }

      const authSuccessSchema = {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              user: { $ref: `#/components/schemas/${schemaRefName}` },
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
              message: { type: "string" }
            }
          }
        }
      };

      paths[`${basePath}/register`] = {
        post: {
          tags: ["Auth"],
          summary: "Register",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: registerRequired,
                  properties: registerProperties
                }
              }
            }
          },
          responses: {
            "201": {
              description: "Registration successful",
              content: { "application/json": { schema: authSuccessSchema } }
            }
          }
        }
      };

      paths[`${basePath}/login`] = {
        post: {
          tags: ["Auth"],
          summary: "Login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password" }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Login successful",
              content: { "application/json": { schema: authSuccessSchema } }
            }
          }
        }
      };

      paths[`${basePath}/refresh`] = {
        post: {
          tags: ["Auth"],
          summary: "Refresh token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["refreshToken"],
                  properties: { refreshToken: { type: "string" } }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Tokens refreshed",
              content: { "application/json": { schema: authSuccessSchema } }
            }
          }
        }
      };

      paths[`${basePath}/logout`] = {
        post: {
          tags: ["Auth"],
          summary: "Logout",
          responses: {
            "200": { description: "Logged out successfully" }
          }
        }
      };

      paths[`${basePath}/forgot-password`] = {
        post: {
          tags: ["Auth"],
          summary: "Forgot Password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: { email: { type: "string", format: "email" } }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Password reset email sent (if account exists)"
            }
          }
        }
      };

      paths[`${basePath}/reset-password`] = {
        post: {
          tags: ["Auth"],
          summary: "Reset Password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token", "newPassword"],
                  properties: {
                    token: { type: "string" },
                    newPassword: { type: "string", format: "password" }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Password reset successfully"
            },
            "400": {
              description: "Invalid or expired token"
            }
          }
        }
      };
    }
  }

  if (schema.globals) {
    for (const glob of schema.globals) {
      const slug = glob.slug;
      const tag = "Globals";
      const schemaRefName = slug.charAt(0).toUpperCase() + slug.slice(1) + "Global";

      components.schemas[schemaRefName] = buildCollectionSchema(glob);
      components.schemas[`${schemaRefName}Input`] = buildCollectionSchema(glob, true);

      const basePath = `${prefix}/globals/${slug}`;

      paths[basePath] = {
        get: {
          tags: [tag],
          summary: `Get global configuration: ${slug}`,
          responses: {
            "200": {
              description: "Global document",
              content: {
                "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}` } }
              }
            }
          }
        },
        post: {
          tags: [tag],
          summary: `Create or Update global configuration: ${slug}`,
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}Input` } }
            }
          },
          responses: {
            "200": {
              description: "Global document updated",
              content: {
                "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}` } }
              }
            }
          }
        },
        patch: {
          tags: [tag],
          summary: `Patch global configuration: ${slug}`,
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}Input` } }
            }
          },
          responses: {
            "200": {
              description: "Global document updated",
              content: {
                "application/json": { schema: { $ref: `#/components/schemas/${schemaRefName}` } }
              }
            }
          }
        }
      };
    }
  }

  if (app?.routes) {
    for (const route of app.routes) {
      const method = route.method?.toLowerCase();
      const rawPath = route.path;
      if (!method || !rawPath) continue;
      const routePath = rawPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
      const detail = route.hooks?.detail;
      const routeTags = detail?.tags ?? route.hooks?.tags ?? [];

      if (method === "options" || paths[routePath]?.[method]) continue;

      const isInternalPath = rawPath.startsWith(`${prefix}/docs`);
      if (isInternalPath) continue;

      const operationTags = routeTags.length ? routeTags : ["Custom"];
      const operation: Record<string, unknown> = {
        ...(detail ?? {}),
        tags: operationTags,
      };

      const bodySchema = route.hooks?.body;
      const querySchema = route.hooks?.query;
      const responseSchema = route.hooks?.response;

      if (bodySchema && !operation.requestBody && ["post", "put", "patch"].includes(method)) {
        operation.requestBody = buildRequestBody(bodySchema);
      }

      if (querySchema) {
        const generatedParams = buildQueryParameters(querySchema);
        if (generatedParams.length > 0) {
          operation.parameters = [
            ...generatedParams,
            ...((operation.parameters as unknown[]) ?? []),
          ];
        }
      }

      if (responseSchema && !operation.responses) {
        operation.responses = buildResponsesFromSchema(responseSchema);
      } else if (!operation.responses) {
        operation.responses = { "200": { description: "OK" } };
      }

      paths[routePath] ??= {};
      paths[routePath][method] = operation;
    }
  }

  return {
    openapi: "3.0.3",
    info: { title: "Radiant API", version: "1.0.0" },
    servers: [{ url: serverUrl }],
    paths,
    components,
  };
}

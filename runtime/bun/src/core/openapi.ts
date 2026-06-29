import type { RadiantAST, CollectionConfig, FieldConfig } from "./types";

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

export function generateOpenAPISpec(schema: RadiantAST, serverUrl: string, prefix: string): any {
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

  return {
    openapi: "3.0.3",
    info: { title: "Radiant API", version: "1.0.0" },
    servers: [{ url: serverUrl }],
    paths,
    components,
  };
}

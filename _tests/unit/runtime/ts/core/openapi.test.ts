import { describe, test, expect } from "bun:test";
import { generateScalarHTML, generateOpenAPISpec } from "../../../../../runtime/bun/src/core/openapi";
import type { RadiantAST, CollectionConfig } from "../../../../../runtime/bun/src/core/types";

describe("core/openapi", () => {
  describe("generateScalarHTML()", () => {
    test("returns HTML containing Scalar script with specUrl", () => {
      const html = generateScalarHTML("/api/spec.json", "My API");
      expect(html).toContain("My API - API Reference");
      expect(html).toContain('data-url="/api/spec.json"');
      expect(html).toContain('data-theme="purple"');
    });
  });

  describe("generateOpenAPISpec()", () => {
    const mockCollection: CollectionConfig = {
      slug: "users",
      auth: false,
      fields: [
        { name: "name", type: "string", optional: false },
        { name: "age", type: "number", optional: true },
        { name: "email", type: "email", optional: false },
        { name: "status", type: "string", values: ["active", "inactive"], default: "active", optional: false },
      ],
    };

    const mockAuthCollection: CollectionConfig = {
      slug: "admins",
      auth: true,
      fields: [
        { name: "email", type: "email", optional: false },
        { name: "password", type: "password", optional: false },
        { name: "level", type: "number", optional: true },
      ],
    };

    const mockAst: RadiantAST = {
      core: { api: { prefix: "/api" } },
      security: {},
      collections: [mockCollection],
      globals: [
        {
          slug: "website",
          fields: [
            { name: "title", type: "string", optional: false },
            { name: "description", type: "string", optional: true },
          ],
        },
      ],
    };

    test("generates basic OpenAPI document structure", () => {
      const spec = generateOpenAPISpec(mockAst, "http://localhost:3000", "/api");

      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Radiant API");
      expect(spec.servers[0].url).toBe("http://localhost:3000");
    });

    test("generates components and schemas for collections", () => {
      const spec = generateOpenAPISpec(mockAst, "http://localhost:3000", "/api");

      const schemas = spec.components.schemas;
      expect(schemas.Users).toBeDefined();
      expect(schemas.UsersInput).toBeDefined();

      // Check standard schema properties
      const usersProps = schemas.Users.properties;
      expect(usersProps.id.type).toBe("string");
      expect(usersProps.id.format).toBe("uuid");
      expect(usersProps.name.type).toBe("string");
      expect(usersProps.age.type).toBe("number");
      expect(usersProps.age.nullable).toBe(true);
      expect(usersProps.email.format).toBe("email");
      expect(usersProps.status.enum).toEqual(["active", "inactive"]);
      expect(schemas.Users.required).toContain("name");
      expect(schemas.Users.required).toContain("email");
      expect(schemas.Users.required).not.toContain("age");
    });

    test("generates standard CRUD paths", () => {
      const spec = generateOpenAPISpec(mockAst, "http://localhost:3000", "/api");

      // GET /api/users
      expect(spec.paths["/api/users"].get).toBeDefined();
      expect(spec.paths["/api/users"].post).toBeDefined();

      // GET /api/users/{id}
      expect(spec.paths["/api/users/{id}"].get).toBeDefined();
      expect(spec.paths["/api/users/{id}"].patch).toBeDefined();
      expect(spec.paths["/api/users/{id}"].delete).toBeDefined();
    });

    test("hides passwords from output schemas but requires them in input", () => {
      const authAst: RadiantAST = {
        core: mockAst.core,
        collections: [mockAuthCollection],
      };

      const spec = generateOpenAPISpec(authAst, "http://localhost", "/api");
      const schemas = spec.components.schemas;

      // Output schema shouldn't have password
      expect(schemas.Admins.properties.password).toBeUndefined();

      // Input schema should have password
      expect(schemas.AdminsInput.properties.password).toBeDefined();
      expect(schemas.AdminsInput.properties.password.format).toBe("password");
    });

    test("generates auth endpoints if collection has auth: true", () => {
      const authAst: RadiantAST = {
        core: mockAst.core,
        collections: [mockAuthCollection],
      };

      const spec = generateOpenAPISpec(authAst, "http://localhost", "/api");
      const paths = spec.paths;

      expect(paths["/api/admins/register"]).toBeDefined();
      expect(paths["/api/admins/login"]).toBeDefined();
      expect(paths["/api/admins/refresh"]).toBeDefined();
      expect(paths["/api/admins/logout"]).toBeDefined();
      expect(paths["/api/admins/forgot-password"]).toBeDefined();
      expect(paths["/api/admins/reset-password"]).toBeDefined();

      // Check register schema requires email and password and extra fields
      const registerSchema = paths["/api/admins/register"].post.requestBody.content["application/json"].schema;
      expect(registerSchema.required).toContain("email");
      expect(registerSchema.required).toContain("password");
      expect(registerSchema.properties.level.type).toBe("number");
    });

    test("generates endpoints and schemas for globals", () => {
      const spec = generateOpenAPISpec(mockAst, "http://localhost:3000", "/api");
      const schemas = spec.components.schemas;
      const paths = spec.paths;

      // Check schemas
      expect(schemas.WebsiteGlobal).toBeDefined();
      expect(schemas.WebsiteGlobalInput).toBeDefined();

      const websiteProps = schemas.WebsiteGlobal.properties;
      expect(websiteProps.title.type).toBe("string");
      expect(websiteProps.description.type).toBe("string");

      // Check paths
      const globalPath = "/api/globals/website";
      expect(paths[globalPath]).toBeDefined();
      expect(paths[globalPath].get).toBeDefined();
      expect(paths[globalPath].post).toBeDefined();
      expect(paths[globalPath].patch).toBeDefined();

      // Global endpoints should use the correct tags
      expect(paths[globalPath].get.tags).toEqual(["Globals"]);
    });

    test("generates custom endpoints from app.routes using TypeBox schemas", async () => {
      // We import Type dynamically so it doesn't break the rest of the file
      const { Type } = await import("@sinclair/typebox");
      const appRoutes = {
        routes: [
          {
            method: "post",
            path: "/api/custom/hello",
            hooks: {
              detail: {
                summary: "Say hello",
                tags: ["Custom Tag"],
              },
              body: Type.Object({
                name: Type.String(),
              }),
              query: Type.Object({
                shout: Type.Optional(Type.Boolean()),
              }),
              response: {
                200: Type.Object({
                  message: Type.String(),
                }),
                400: Type.Object({
                  error: Type.String(),
                }),
              },
            },
          },
        ],
      };

      const spec = generateOpenAPISpec(mockAst, "http://localhost", "/api", appRoutes);
      const customPath = spec.paths["/api/custom/hello"];
      expect(customPath).toBeDefined();
      expect(customPath.post).toBeDefined();

      const op = customPath.post;
      expect(op.summary).toBe("Say hello");
      expect(op.tags).toEqual(["Custom Tag"]);

      // Request Body
      const bodySchema = op.requestBody.content["application/json"].schema;
      expect(bodySchema.type).toBe("object");
      expect(bodySchema.properties.name.type).toBe("string");
      expect(bodySchema.required).toContain("name");

      // Query Params
      expect(op.parameters).toBeArray();
      const shoutParam = op.parameters.find((p: any) => p.name === "shout");
      expect(shoutParam).toBeDefined();
      expect(shoutParam.in).toBe("query");
      expect(shoutParam.schema.type).toBe("boolean");
      expect(shoutParam.required).toBe(false);

      // Responses
      console.log(JSON.stringify(op.responses, null, 2));
      expect(op.responses["200"]).toBeDefined();
      const res200Schema = op.responses["200"].content["application/json"].schema;
      expect(res200Schema.type).toBe("object");
      expect(res200Schema.properties.message.type).toBe("string");

      expect(op.responses["400"]).toBeDefined();
      const res400Schema = op.responses["400"].content["application/json"].schema;
      expect(res400Schema.properties.error.type).toBe("string");
    });
  });
});

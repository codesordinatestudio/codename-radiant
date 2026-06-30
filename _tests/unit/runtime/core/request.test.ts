import { describe, test, expect } from "bun:test";
import { parseQuery, createRouteContext } from "../../../../runtime/bun/src/core/request";
import type { RadiantRuntime } from "../../../../runtime/bun/src/main/runtime";
import type { AuthUser } from "../../../../runtime/bun/src/main/access";

describe("core/request", () => {
  describe("parseQuery()", () => {
    test("parses flat query strings", () => {
      const search = new URLSearchParams("?foo=bar&baz=123");
      const query = parseQuery(search);
      expect(query).toEqual({ foo: "bar", baz: "123" });
    });

    test("handles duplicate keys as arrays", () => {
      const search = new URLSearchParams("?tags=a&tags=b&tags=c");
      const query = parseQuery(search);
      expect(query).toEqual({ tags: ["a", "b", "c"] });
    });

    test("parses object-like bracket syntax", () => {
      const search = new URLSearchParams("?user[name]=John&user[age]=30");
      const query = parseQuery(search);
      expect(query).toEqual({
        user: { name: "John", age: "30" }
      });
    });

    test("parses deeply nested bracket syntax", () => {
      const search = new URLSearchParams("?a[b][c]=1&a[b][d]=2");
      const query = parseQuery(search);
      expect(query).toEqual({
        a: { b: { c: "1", d: "2" } }
      });
    });

    test("parses array-like bracket syntax", () => {
      const search = new URLSearchParams("?items[0]=a&items[1]=b");
      const query = parseQuery(search);
      expect(query).toEqual({
        items: ["a", "b"] // since indices are numbers, parser logic creates an array or object?
      });
    });

    test("handles mixed bracket and array values", () => {
      const search = new URLSearchParams("?filter[tags]=a&filter[tags]=b");
      const query = parseQuery(search);
      expect(query).toEqual({
        filter: { tags: ["a", "b"] }
      });
    });
  });

  describe("createRouteContext()", () => {
    test("creates a properly structured context", () => {
      const req = new Request("http://localhost:3000/api/users?sort=desc");
      const params = { id: "123" };
      const user: AuthUser = { id: "user-1", email: "test@test.com", collection: "users" };
      const body = { name: "Test" };
      const radiantMock = {} as RadiantRuntime;
      const state = { custom: true };

      const ctx = createRouteContext(req, params, state, user, body, radiantMock);

      expect(ctx.request).toBe(req);
      expect(ctx.url.pathname).toBe("/api/users");
      expect(ctx.query).toEqual({ sort: "desc" });
      expect(ctx.params).toEqual({ id: "123" });
      expect(ctx.user).toEqual(user);
      expect(ctx.body).toEqual(body);
      expect(ctx.radiant).toBe(radiantMock);
      expect(ctx.state).toEqual(state);
    });

    test("provides defaults for optional arguments", () => {
      const req = new Request("http://localhost:3000/api");
      const ctx = createRouteContext(req);

      expect(ctx.request).toBe(req);
      expect(ctx.params).toEqual({});
      expect(ctx.query).toEqual({});
      expect(ctx.user).toBeNull();
      expect(ctx.body).toBeUndefined();
      expect(ctx.state).toBeUndefined();
    });
  });
});

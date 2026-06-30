import { describe, test, expect } from "bun:test";
import {
  json,
  empty,
  redirect,
  error,
  notFound,
  methodNotAllowed,
  file,
  toResponse,
  routeErrorToResponse,
  UPGRADED
} from "../../../../runtime/bun/src/core/response";

describe("core/response", () => {
  describe("json()", () => {
    test("returns JSON response with default headers", async () => {
      const res = json({ hello: "world" });
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(await res.json()).toEqual({ hello: "world" });
    });

    test("merges custom headers and status", async () => {
      const res = json({ success: true }, { status: 201, headers: { "X-Custom": "Value" } });
      expect(res.status).toBe(201);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(res.headers.get("X-Custom")).toBe("Value");
      expect(await res.json()).toEqual({ success: true });
    });
  });

  describe("empty()", () => {
    test("returns 204 no content by default", () => {
      const res = empty();
      expect(res.status).toBe(204);
      expect(res.body).toBeNull();
    });

    test("allows overriding status and headers", () => {
      const res = empty(201, { headers: { "X-Foo": "Bar" } });
      expect(res.status).toBe(201);
      expect(res.headers.get("X-Foo")).toBe("Bar");
    });
  });

  describe("redirect()", () => {
    test("returns 302 redirect by default", () => {
      const res = redirect("/login");
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/login");
    });

    test("allows overriding status to 301", () => {
      const res = redirect("/moved", 301);
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe("/moved");
    });
  });

  describe("error()", () => {
    test("returns 500 formatted error by default", async () => {
      const res = error("Something went wrong");
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: "INTERNAL_ERROR",
        message: "Something went wrong"
      });
    });

    test("allows custom status and error code", async () => {
      const res = error("Unauthorized access", 403, "FORBIDDEN");
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "FORBIDDEN",
        message: "Unauthorized access"
      });
    });
  });

  describe("notFound()", () => {
    test("returns 404 NOT_FOUND", async () => {
      const res = notFound();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "NOT_FOUND",
        message: "Not found"
      });
    });
  });

  describe("methodNotAllowed()", () => {
    test("returns 405 with Allow header", async () => {
      const res = methodNotAllowed(["GET", "POST"]);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
      expect(await res.json()).toEqual({
        error: "METHOD_NOT_ALLOWED",
        message: "Method not allowed"
      });
    });
  });

  describe("file()", () => {
    test("returns Bun file for string path", async () => {
      const res = file("package.json");
      expect(res.status).toBe(200);
      expect(res).toBeInstanceOf(Response);
    });

    test("returns ArrayBuffer for Uint8Array", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const res = file(data, { status: 200 });
      expect(res.status).toBe(200);
      const buffer = await res.arrayBuffer();
      expect(new Uint8Array(buffer)).toEqual(data);
    });
  });

  describe("toResponse()", () => {
    test("returns undefined for UPGRADED", () => {
      expect(toResponse(UPGRADED)).toBeUndefined();
    });

    test("returns the response as-is if it's already a Response", () => {
      const original = new Response("Raw");
      expect(toResponse(original)).toBe(original);
    });

    test("returns empty() if undefined", () => {
      const res = toResponse(undefined);
      expect(res?.status).toBe(204);
    });

    test("returns Response with string body if string", async () => {
      const res = toResponse("Hello Text");
      expect(res?.status).toBe(200);
      expect(await res?.text()).toBe("Hello Text");
    });

    test("returns json() for objects", async () => {
      const res = toResponse({ nested: true });
      expect(res?.status).toBe(200);
      expect(await res?.json()).toEqual({ nested: true });
    });
  });

  describe("routeErrorToResponse()", () => {
    test("converts standard Error", async () => {
      const err = new Error("Broken code");
      const res = routeErrorToResponse(err);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: "INTERNAL_ERROR",
        message: "Broken code"
      });
    });

    test("includes path if request provided", async () => {
      const err = new Error("Failed route");
      const req = new Request("http://localhost/api/test");
      const res = routeErrorToResponse(err, req);
      expect(res.headers.get("X-Radiant-Path")).toBe("/api/test");
    });

    test("handles non-Error objects safely", async () => {
      const res = routeErrorToResponse({ weird: "object" });
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({
        error: "INTERNAL_ERROR",
        message: "[object Object]"
      });
    });
  });
});

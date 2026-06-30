import { describe, test, expect } from "bun:test";
import { SurrealDBAdapter } from "../../../../plugins/ts/surrealdb/src/adapter";

describe("SurrealDBAdapter", () => {
  test("builds simple equality conditions", () => {
    const adapter = new SurrealDBAdapter("http://localhost:8000");
    const ctx = { params: {}, pIdx: 1 };
    
    // Using any to test private query builder
    const where = (adapter as any).buildSurrealWhere({
      username: "Alice",
      age: 25
    }, ctx);
    
    expect(where).toBe("username = $p1 AND age = $p2");
    expect(ctx.params).toEqual({ p1: "Alice", p2: 25 });
  });

  test("builds operator conditions", () => {
    const adapter = new SurrealDBAdapter("http://localhost:8000");
    const ctx = { params: {}, pIdx: 1 };
    
    const where = (adapter as any).buildSurrealWhere({
      price: { gte: 100, lt: 500 }
    }, ctx);
    
    expect(where).toBe("price >= $p1 AND price < $p2");
    expect(ctx.params).toEqual({ p1: 100, p2: 500 });
  });

  test("builds IN/ANY conditions", () => {
    const adapter = new SurrealDBAdapter("http://localhost:8000");
    const ctx = { params: {}, pIdx: 1 };
    
    const where = (adapter as any).buildSurrealWhere({
      status: { in: ["active", "pending"] },
      tags: { any: ["tech", "science"] }
    }, ctx);
    
    expect(where).toBe("status IN $p1 AND tags CONTAINSANY $p2");
    expect(ctx.params).toEqual({
      p1: ["active", "pending"],
      p2: ["tech", "science"]
    });
  });

  test("builds boolean OR conditions", () => {
    const adapter = new SurrealDBAdapter("http://localhost:8000");
    const ctx = { params: {}, pIdx: 1 };
    
    const where = (adapter as any).buildSurrealWhere({
      or: [
        { type: "A" },
        { type: "B" }
      ]
    }, ctx);
    
    expect(where).toBe("(type = $p1 OR type = $p2)");
  });
});

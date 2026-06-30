import { describe, test, expect } from "bun:test";
import { PostgresAdapter } from "../../../../plugins/ts/postgres/src/adapter";

describe("PostgresAdapter", () => {
  test("builds basic operators", () => {
    const adapter = new PostgresAdapter("postgres://localhost");
    
    // Using private method via any for testing internal query builder
    const ctx = { params: [], paramIndex: 1 };
    const query = (adapter as any).buildPgOp("age", "gte", 18, ctx);
    
    expect(query).toBe('"age" >= $1');
    expect(ctx.params).toEqual([18]);
    expect(ctx.paramIndex).toBe(2);
  });

  test("builds IN operators", () => {
    const adapter = new PostgresAdapter("postgres://localhost");
    const ctx = { params: [], paramIndex: 1 };
    const query = (adapter as any).buildPgOp("status", "in", ["active", "pending"], ctx);
    
    expect(query).toBe('"status" IN ($1, $2)');
    expect(ctx.params).toEqual(["active", "pending"]);
    expect(ctx.paramIndex).toBe(3);
  });

  test("builds JSON operators", () => {
    const adapter = new PostgresAdapter("postgres://localhost");
    const ctx = { params: [], paramIndex: 1 };
    
    const query = (adapter as any).buildPgJsonOp("metadata", ["theme", "color"], "eq", "dark", ctx);
    
    expect(query).toBe('"metadata"->\'theme\'->>\'color\' = $1');
    expect(ctx.params).toEqual(["dark"]);
    expect(ctx.paramIndex).toBe(2);
  });
});

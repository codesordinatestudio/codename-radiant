import { describe, test, expect } from "bun:test";
import { MongoDBAdapter } from "../src/adapter";

describe("MongoDBAdapter", () => {
  test("builds simple equality filters", async () => {
    const adapter = new MongoDBAdapter("mongodb://localhost");
    
    // Using any to test private query builder method
    const filter = await (adapter as any).buildMongoWhere({
      name: "Alice",
      age: 30
    }, "users");
    
    expect(filter).toEqual({
      $and: [
        { name: "Alice" },
        { age: 30 }
      ]
    });
  });

  test("builds operator filters", async () => {
    const adapter = new MongoDBAdapter("mongodb://localhost");
    
    const filter = await (adapter as any).buildMongoWhere({
      price: { gt: 100, lte: 500 },
      status: { in: ["active", "pending"] }
    }, "products");
    
    expect(filter).toEqual({
      $and: [
        { price: { $gt: 100, $lte: 500 } },
        { status: { $in: ["active", "pending"] } }
      ]
    });
  });

  test("builds boolean OR/AND conditions", async () => {
    const adapter = new MongoDBAdapter("mongodb://localhost");
    
    const filter = await (adapter as any).buildMongoWhere({
      or: [
        { category: "A" },
        { category: "B" }
      ]
    }, "items");
    
    expect(filter).toEqual({
      $or: [
        { category: "A" },
        { category: "B" }
      ]
    });
  });
});

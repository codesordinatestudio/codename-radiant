import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryAdapter } from "../../src/core/memory-adapter";

describe("core/memory-adapter", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  test("initializes correctly", async () => {
    expect(adapter.name).toBe("memory");
    expect(adapter.adapterType).toBe("memory");
    
    // Test abstract promises
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
    await expect(adapter.ping()).resolves.toBeUndefined();
  });

  test("creates and finds a document by id", async () => {
    const doc = await adapter.create("users", { name: "Alice", age: 30 });
    
    expect(doc).toHaveProperty("id");
    expect(doc.name).toBe("Alice");

    const found = await adapter.findById("users", doc.id as string);
    expect(found).toEqual(doc);
  });

  test("findById returns null if not found", async () => {
    const found = await adapter.findById("users", "non-existent");
    expect(found).toBeNull();
  });

  test("finds multiple documents and applies eq filters", async () => {
    await adapter.create("users", { name: "Alice", role: "admin" });
    await adapter.create("users", { name: "Bob", role: "user" });
    await adapter.create("users", { name: "Charlie", role: "admin" });

    const all = await adapter.find("users", {});
    expect(all.totalDocs).toBe(3);
    expect(all.docs.length).toBe(3);

    const admins = await adapter.find("users", { where: { role: { eq: "admin" } } });
    expect(admins.totalDocs).toBe(2);
    expect(admins.docs.map(d => d.name)).toEqual(["Alice", "Charlie"]);
  });

  test("updates an existing document", async () => {
    const doc = await adapter.create("users", { name: "Alice", active: false });
    
    const updated = await adapter.update("users", doc.id as string, { active: true });
    expect(updated.active).toBe(true);
    expect(updated.name).toBe("Alice"); // Preserves old fields
    expect(updated.id).toBe(doc.id);

    // Verify in store
    const found = await adapter.findById("users", doc.id as string);
    expect(found?.active).toBe(true);
  });

  test("update throws if document not found", async () => {
    expect(adapter.update("users", "missing", { a: 1 })).rejects.toThrow("Document not found");
  });

  test("deletes a document", async () => {
    const doc = await adapter.create("users", { name: "Alice" });
    
    await adapter.delete("users", doc.id as string);
    
    const found = await adapter.findById("users", doc.id as string);
    expect(found).toBeNull();
  });

  test("delete ignores non-existent documents and empty collections safely", async () => {
    await expect(adapter.delete("nonexistent_collection", "123")).resolves.toBeUndefined();
    await expect(adapter.delete("users", "123")).resolves.toBeUndefined();
  });

  test("count returns correct number of documents", async () => {
    await adapter.create("items", { status: "pending" });
    await adapter.create("items", { status: "done" });
    await adapter.create("items", { status: "pending" });

    const total = await adapter.count("items");
    expect(total).toBe(3);

    const pendingCount = await adapter.count("items", { where: { status: { eq: "pending" } } });
    expect(pendingCount).toBe(2);
  });
});

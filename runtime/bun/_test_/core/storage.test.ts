import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { LocalStorageProvider } from "../../src/core/storage";

const TEST_DIR = path.join(process.cwd(), ".radiant_test_uploads");

describe("core/storage", () => {
  let storage: LocalStorageProvider;

  beforeAll(() => {
    // Ensure clean state
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    storage = new LocalStorageProvider(".radiant_test_uploads", "/test-api");
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test("initializes directory if it doesn't exist", () => {
    expect(fs.existsSync(TEST_DIR)).toBe(true);
  });

  test("saves a File correctly and returns metadata", async () => {
    const fileContent = "Hello, Radiant Storage!";
    const file = new File([fileContent], "hello.txt", { type: "text/plain" });

    const uploaded = await storage.saveFile(file);

    expect(uploaded.originalName).toBe("hello.txt");
    expect(uploaded.mimetype).toContain("text/plain");
    expect(uploaded.size).toBe(file.size);
    expect(uploaded.url).toMatch(/^\/test-api\/uploads\/.*\.txt$/);

    // Verify file on disk
    const savedPath = path.join(TEST_DIR, uploaded.filename);
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(fs.readFileSync(savedPath, "utf-8")).toBe(fileContent);
  });

  test("respects custom filename option", async () => {
    const file = new File(["data"], "data.csv", { type: "text/csv" });
    const uploaded = await storage.saveFile(file, { filename: "custom-name.csv" });

    expect(uploaded.filename).toBe("custom-name.csv");
    expect(uploaded.url).toBe("/test-api/uploads/custom-name.csv");

    const savedPath = path.join(TEST_DIR, "custom-name.csv");
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test("deletes an existing file", async () => {
    const file = new File(["delete me"], "delete.txt", { type: "text/plain" });
    const uploaded = await storage.saveFile(file);
    
    const savedPath = path.join(TEST_DIR, uploaded.filename);
    expect(fs.existsSync(savedPath)).toBe(true);

    await storage.deleteFile(uploaded.filename);
    expect(fs.existsSync(savedPath)).toBe(false);
  });

  test("deleteFile gracefully ignores missing files", async () => {
    // Should not throw
    await expect(storage.deleteFile("nonexistent.txt")).resolves.toBeUndefined();
  });
});

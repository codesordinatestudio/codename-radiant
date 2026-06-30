import { describe, expect, it, afterEach, beforeEach } from "bun:test";
import { existsSync, rmSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { scaffoldTsProject } from "../../../packages/cli/src/scaffolds/bun";

describe("CLI Scaffold - TS Project", () => {
  const testDir = join(process.cwd(), ".test-scaffold");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should scaffold with SQLite adapter by default", async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_CHOICE = "1";
    await scaffoldTsProject(testDir);

    const appTs = readFileSync(join(testDir, "src", "app.ts"), "utf-8");
    expect(appTs).toContain('import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite"');
    expect(appTs).toContain("adapter: sqlite({ url: process.env.DATABASE_URL! })");
  });

  it("should scaffold with Postgres adapter", async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_CHOICE = "2";
    await scaffoldTsProject(testDir);

    const appTs = readFileSync(join(testDir, "src", "app.ts"), "utf-8");
    expect(appTs).toContain('import { postgres } from "@codesordinatestudio/radiant-plugin-postgres"');
    expect(appTs).toContain("adapter: postgres({ url: process.env.DATABASE_URL! })");

    const env = readFileSync(join(testDir, ".env"), "utf-8");
    expect(env).toContain("DATABASE_URL=postgres://postgres:postgres@localhost:5432/radiant_app");
  });

  it("should scaffold with MongoDB adapter", async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_CHOICE = "3";
    await scaffoldTsProject(testDir);

    const appTs = readFileSync(join(testDir, "src", "app.ts"), "utf-8");
    expect(appTs).toContain('import { mongodb } from "@codesordinatestudio/radiant-plugin-mongodb"');
    expect(appTs).toContain("adapter: mongodb({ url: process.env.DATABASE_URL! })");
  });

  it("should scaffold with Redis adapter", async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_CHOICE = "4";
    await scaffoldTsProject(testDir);

    const appTs = readFileSync(join(testDir, "src", "app.ts"), "utf-8");
    expect(appTs).toContain('import { redis } from "@codesordinatestudio/radiant-plugin-redis-db"');
    expect(appTs).toContain("adapter: redis({ url: process.env.DATABASE_URL! })");
  });

  it("should scaffold with SurrealDB adapter", async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_CHOICE = "5";
    await scaffoldTsProject(testDir);

    const appTs = readFileSync(join(testDir, "src", "app.ts"), "utf-8");
    expect(appTs).toContain('import { surrealdb } from "@codesordinatestudio/radiant-plugin-surrealdb"');
    expect(appTs).toContain('adapter: surrealdb({ url: process.env.DATABASE_URL!, user: "root", pass: "root", ns: "test", db: "test" })');
  });
});

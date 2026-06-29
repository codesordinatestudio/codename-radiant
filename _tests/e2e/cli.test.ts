import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawnSync, spawn } from 'bun';
import { readFileSync, existsSync } from 'fs';

const TEST_DIR = join(__dirname, 'temp_e2e_dir');
const RADIANT_DIR = join(TEST_DIR, 'radiant');
const CLI_PATH = join(__dirname, '../../packages/cli/src/index.ts');

describe('E2E CLI Tests', () => {
  beforeAll(async () => {
    // Ensure clean state
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(RADIANT_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('successfully builds a valid radiant project', async () => {
    const validConfig = `
      config {
        apiPrefix: "/api"
      }
    `;
    const validCollection = `
      collection users {
        auth: true;
        fields: {
          name: string;
          email: email @unique;
        }
      }
    `;
    
    await writeFile(join(RADIANT_DIR, 'config.radiant'), validConfig);
    await writeFile(join(RADIANT_DIR, 'users.radiant'), validCollection);

    const result = spawnSync(['bun', 'run', CLI_PATH, 'build', '-d', RADIANT_DIR]);
    expect(result.exitCode).toBe(0);

    const schemaPath = join(TEST_DIR, 'schema.json');
    const typesPath = join(TEST_DIR, 'radiant-types.ts');
    
    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(typesPath)).toBe(true);

    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.apiPrefix).toBe('/api');
    expect(schema.collections.length).toBe(1);
    expect(schema.collections[0].slug).toBe('users');
    expect(schema.collections[0].fields.length).toBe(2);

    const typesContent = readFileSync(typesPath, 'utf8');
    expect(typesContent).toContain('export interface User');
    expect(typesContent).toContain('name: string');
  });

  test('successfully builds a project with global config and env manipulators', async () => {
    const validConfig = `
      config {
        security: {
          auth: {
            jwt: {
              accessTokenExpiry: env("TEST_EXPIRY", "15m")
            }
          }
        };
      }
    `;
    
    await writeFile(join(RADIANT_DIR, 'config.radiant'), validConfig);

    const result = spawnSync(['bun', 'run', CLI_PATH, 'build', '-d', RADIANT_DIR]);
    expect(result.exitCode).toBe(0);

    const schemaPath = join(TEST_DIR, 'schema.json');
    expect(existsSync(schemaPath)).toBe(true);

    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.security.auth.jwt.accessTokenExpiry.$env).toBe('TEST_EXPIRY');
    expect(schema.security.auth.jwt.accessTokenExpiry.$default).toBe('15m');
  });

  test('fails and exits with code 1 for syntax errors', async () => {
    // Overwrite with invalid syntax
    const invalidConfig = `
      config {
        apiPrefix: 
      }
    `;
    await writeFile(join(RADIANT_DIR, 'config.radiant'), invalidConfig);

    const result = spawnSync(['bun', 'run', CLI_PATH, 'build', '-d', RADIANT_DIR]);
    expect(result.exitCode).toBe(1);
    const output = result.stderr.toString();
    expect(output).toContain('Parsing errors');
  });

  test('fails and exits with code 1 for semantic errors', async () => {
    const semanticErrorConfig = `
      config {
        apiPrefix: "/api"
      }
      collection users {
        invalidColProp: true;
        fields: {
          name: string;
        }
      }
    `;
    await writeFile(join(RADIANT_DIR, 'config.radiant'), semanticErrorConfig);

    const result = spawn(['bun', 'run', CLI_PATH, 'build', '-d', RADIANT_DIR], { stdout: 'pipe', stderr: 'pipe' });
    const exitCode = await result.exited;
    expect(exitCode).toBe(1);
    const output = await new Response(result.stderr).text();
    expect(output).toContain('Semantic errors during compilation:');
    expect(output).toContain("Unknown property 'invalidColProp' in collection block");
  });
});


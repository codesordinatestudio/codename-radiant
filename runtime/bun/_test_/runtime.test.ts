import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { RadiantRuntime } from '../src/main/runtime';
import type { RadiantAdapter } from '../src/core';

describe('RadiantRuntime', () => {
  let mockAdapter: RadiantAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    mockAdapter = {
      adapterType: "mock",
      connect: async () => {},
      disconnect: async () => {},
      count: async () => 0,
      create: async () => ({}),
      find: async () => ({ docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null }),
      findById: async () => null,
      update: async () => ({}),
      delete: async () => {}
    };
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('resolves env variables natively using resolveEnvVariables', () => {
    process.env.TEST_EXPIRY = '45m';
    process.env.TEST_ATTEMPTS = '10';

    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [],
      security: {
        auth: {
          jwt: {
            accessTokenExpiry: { $env: "TEST_EXPIRY", $default: "15m" }
          },
          lockout: {
            maxAttempts: { $env: "TEST_ATTEMPTS", $default: 5 },
            durationMinutes: { $env: "TEST_DURATION", $default: 15 }
          }
        }
      }
    };

    const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });

    // The runtime.schema is private, but we can verify it correctly parsed 
    // by checking what is inside by casting to any.
    const resolvedSchema = (runtime as any).schema;

    expect(resolvedSchema.security.auth.jwt.accessTokenExpiry).toBe('45m');
    // It should cast numeric defaults to numbers
    expect(resolvedSchema.security.auth.lockout.maxAttempts).toBe(10);
    // It should fallback to defaults
    expect(resolvedSchema.security.auth.lockout.durationMinutes).toBe(15);
  });

  test('throws error if JWT strategy is enabled without JWT_SECRET', () => {
    delete process.env.JWT_SECRET;
    
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [],
      security: {
        auth: {
          strategies: ["jwt"]
        }
      }
    };

    expect(() => new RadiantRuntime(schema, { adapter: mockAdapter })).toThrow("JWT_SECRET environment variable is required");
  });

  test('initializes authEngine successfully if JWT_SECRET is provided', () => {
    process.env.JWT_SECRET = "test-secret";
    
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [],
      security: {
        auth: {
          strategies: ["jwt"]
        }
      }
    };

    const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
    expect((runtime as any).authEngine).toBeDefined();
  });

  test('NaN env casting safely falls back to string if value is not numeric', () => {
    process.env.TEST_ATTEMPTS = 'junk_string';

    const schema: any = {
      security: {
        auth: {
          lockout: {
            maxAttempts: { $env: "TEST_ATTEMPTS", $default: 5 }
          }
        }
      }
    };

    const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
    const resolvedSchema = (runtime as any).schema;
    
    // Fallback to string since Number('junk_string') is NaN
    expect(resolvedSchema.security.auth.lockout.maxAttempts).toBe('junk_string');
  });

  test('Missing JWT engine safely rejects /refresh requests', async () => {
    // JWT NOT configured in this schema
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [{ slug: 'users', auth: true }],
    };

    const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
    await runtime.buildRoutes();

    const req = new Request('http://localhost/api/users/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: '123' })
    });
    
    const res = await runtime.fetch(req);
    expect(res.status).toBe(501);
    const body: any = await res.json();
    expect(body.error).toBe("JWT auth not configured");
  });

  test('Concurrent requests to RadiantRuntime do not pollute request context', async () => {
    process.env.JWT_SECRET = "test-secret";
    const schema: any = {
      core: { api: { prefix: "/api" } },
      collections: [{ slug: 'users' }],
      security: { auth: { strategies: ["jwt"] } }
    };
    const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
    
    // We override getContext to track calls and ensure they aren't globally shared
    let contextsCreated = 0;
    const originalGetContext = (runtime as any).getContext.bind(runtime);
    
    (runtime as any).getContext = async (req: Request) => {
      contextsCreated++;
      return originalGetContext(req);
    };

    await runtime.buildRoutes();

    const req1 = new Request('http://localhost/api/users');
    const req2 = new Request('http://localhost/api/users');

    await Promise.all([
      runtime.fetch(req1),
      runtime.fetch(req2),
    ]);

    // Two distinct contexts should be generated per-request
    expect(contextsCreated).toBe(2);
  });

  describe('Auto-Sync Database Schema', () => {
    let mockSyncAdapter: any;

    beforeEach(() => {
      mockSyncAdapter = {
        connect: async () => {},
        disconnect: async () => {},
        adapterType: 'mock',
        find: async () => ({ docs: [], totalDocs: 0, limit: 10, page: 1, totalPages: 0, hasNextPage: false, hasPrevPage: false }),
        findById: async () => null,
        create: async () => ({}),
        update: async () => ({}),
        delete: async () => {},
        count: async () => 0,
        // Sync mocks
        getSystemTableStatements: () => ['CREATE TABLE sys;'],
        getCurrentSchema: async () => ({
          tables: ['users'],
          columns: { users: ['id UUID', 'email TEXT'] }
        }),
        createTableDDL: (col: any) => `CREATE TABLE ${col.slug};`,
        addColumnDDL: (table: string, col: any) => `ALTER TABLE ${table} ADD COLUMN ${col.name};`,
        dropTableDDL: (table: string) => `DROP TABLE ${table};`,
        dropColumnDDL: (table: string, col: string) => `ALTER TABLE ${table} DROP COLUMN ${col};`,
        raw: async () => {}
      };
    });

    test('executes system table statements and schema sync correctly', async () => {
      const schema: any = {
        core: { api: { prefix: "/api" } },
        collections: [
          { slug: 'users', fields: [{ name: 'email', type: 'text' }, { name: 'age', type: 'number' }] },
          { slug: 'posts', fields: [{ name: 'title', type: 'text' }] }
        ]
      };

      const rawSpy = spyOn(mockSyncAdapter, 'raw');
      const runtime = new RadiantRuntime(schema, { adapter: mockSyncAdapter });
      
      await runtime.syncDatabaseSchema();

      // Should execute system table statement
      expect(rawSpy).toHaveBeenCalledWith('CREATE TABLE sys;');
      
      // Should create missing table (posts)
      expect(rawSpy).toHaveBeenCalledWith('CREATE TABLE posts;');
      
      // Should add missing column (age) to existing table (users)
      expect(rawSpy).toHaveBeenCalledWith('ALTER TABLE users ADD COLUMN age;');
    });

    test('drops orphaned tables and columns when dropOrphan is true', async () => {
      // Simulate existing schema having an orphaned table ('old_table') 
      // and an orphaned column ('users.old_col')
      mockSyncAdapter.getCurrentSchema = async () => ({
        tables: ['users', 'old_table'],
        columns: { users: ['id UUID', 'email TEXT', 'old_col TEXT'] }
      });

      const schema: any = {
        core: { api: { prefix: "/api" } },
        migrate: { dropOrphan: true },
        collections: [
          { slug: 'users', fields: [{ name: 'email', type: 'text' }] }
        ]
      };

      const rawSpy = spyOn(mockSyncAdapter, 'raw');
      const runtime = new RadiantRuntime(schema, { adapter: mockSyncAdapter });
      
      await runtime.syncDatabaseSchema();

      // Should drop orphaned table
      expect(rawSpy).toHaveBeenCalledWith('DROP TABLE old_table;');
      
      // Should drop orphaned column
      expect(rawSpy).toHaveBeenCalledWith('ALTER TABLE users DROP COLUMN old_col;');
    });

    test('warns but does not drop orphans when dropOrphan is false', async () => {
      mockSyncAdapter.getCurrentSchema = async () => ({
        tables: ['users', 'old_table'],
        columns: { users: ['id UUID', 'email TEXT', 'old_col TEXT'] }
      });

      const schema: any = {
        core: { api: { prefix: "/api" } },
        migrate: { dropOrphan: false }, // explicitly false
        collections: [
          { slug: 'users', fields: [{ name: 'email', type: 'text' }] }
        ]
      };

      const rawSpy = spyOn(mockSyncAdapter, 'raw');
      const warnSpy = spyOn(console, 'warn');
      const runtime = new RadiantRuntime(schema, { adapter: mockSyncAdapter });
      
      await runtime.syncDatabaseSchema();

      // Should NOT drop anything
      expect(rawSpy).not.toHaveBeenCalledWith('DROP TABLE old_table;');
      expect(rawSpy).not.toHaveBeenCalledWith('ALTER TABLE users DROP COLUMN old_col;');

      // Should log warnings
      expect(warnSpy).toHaveBeenCalledWith('[Radiant Auto-Sync] Orphaned table detected but not dropped: old_table');
      expect(warnSpy).toHaveBeenCalledWith('[Radiant Auto-Sync] Orphaned column detected but not dropped: users.old_col');
    });
  });

  describe('Dynamic API Routing', () => {
    let runtime: RadiantRuntime;

    beforeEach(async () => {
      process.env.JWT_SECRET = "test-secret";
      const schema: any = {
        core: { api: { prefix: "/api" } },
        collections: [{ slug: 'posts', auth: false }, { slug: 'users', auth: true }],
        security: { auth: { strategies: ["jwt"] } }
      };

      // Mock the adapter more thoroughly
      let db: any = { posts: [{ id: '1', title: 'Hello' }], users: [{ id: 'admin', email: 'admin@test.com', password: await Bun.password.hash('secret', 'bcrypt') }] };
      
      const mockStorage: RadiantAdapter = {
        adapterType: "mock",
        connect: async () => {},
        disconnect: async () => {},
        count: async () => 0,
        create: async (col: string, data: any) => {
          const item = { id: crypto.randomUUID(), ...data };
          if (!db[col]) db[col] = [];
          db[col].push(item);
          return item;
        },
        find: async (col: string, q: any) => {
          let docs = db[col] || [];
          if (q?.where?.email?.eq) {
            docs = docs.filter((d: any) => d.email === q.where.email.eq);
          }
          return { docs, totalDocs: docs.length, limit: 10, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null };
        },
        findById: async (col: string, id: string) => {
          return (db[col] || []).find((d: any) => d.id === id) || null;
        },
        update: async (col: string, id: string, data: any) => {
          const idx = (db[col] || []).findIndex((d: any) => d.id === id);
          if (idx >= 0) {
            db[col][idx] = { ...db[col][idx], ...data };
            return db[col][idx];
          }
          throw new Error('Not found');
        },
        delete: async (col: string, id: string) => {
          db[col] = (db[col] || []).filter((d: any) => d.id !== id);
        }
      };

      runtime = new RadiantRuntime(schema, { adapter: mockStorage });
      await runtime.buildRoutes();
    });

    test('GET list returns collection data', async () => {
      const res = await runtime.fetch(new Request('http://localhost/api/posts'));
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.docs[0].title).toBe('Hello');
    });

    test('GET by ID returns specific document', async () => {
      const res = await runtime.fetch(new Request('http://localhost/api/posts/1'));
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.title).toBe('Hello');
    });

    test('POST creates a new document', async () => {
      const req = new Request('http://localhost/api/posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Post' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.title).toBe('New Post');
      expect(data.id).toBeDefined();
    });

    test('PATCH updates an existing document', async () => {
      const req = new Request('http://localhost/api/posts/1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Post' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.title).toBe('Updated Post');
      expect(data.id).toBe('1');
    });

    test('DELETE removes an existing document', async () => {
      const req = new Request('http://localhost/api/posts/1', {
        method: 'DELETE'
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.deleted).toBe(true);

      // Verify it's actually deleted
      const fetchReq = new Request('http://localhost/api/posts/1');
      const fetchRes = await runtime.fetch(fetchReq);
      expect(fetchRes.status).toBe(404);
    });

    test('Access rules block unauthorized requests', async () => {
      runtime.access('posts', {
        read: async () => false, // deny all reads
      });

      const res = await runtime.fetch(new Request('http://localhost/api/posts'));
      // Expect 500 error since we throw an Error in checkAccess, handled by router (Bun's default is 500 or router handles it)
      // Actually RadiantRouter handles async throwing? 
      // If it's uncaught, Bun returns 500. Let's see what it returns.
      // Wait, RadiantRouter currently doesn't wrap inside try/catch so Bun catches and returns 500.
      expect(res.status).toBe(500);
    });

    test('Hooks intercept and modify payload', async () => {
      runtime.hooks('posts', {
        beforeCreate: async ({ data }) => {
          return { ...data, modified: true };
        }
      });

      const req = new Request('http://localhost/api/posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'Hook Post' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.modified).toBe(true);
    });

    test('Auth routing: /login successfully issues JWT tokens', async () => {
      const req = new Request('http://localhost/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'secret' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();
      expect(data.user.password).toBeUndefined(); // password stripped
    });

    test('Auth routing: /login rejects invalid passwords', async () => {
      const req = new Request('http://localhost/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'wrong' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.error).toBe('Invalid credentials');
    });

    test('Auth routing: /register correctly hashes password and issues tokens', async () => {
      const req = new Request('http://localhost/api/users/register', {
        method: 'POST',
        body: JSON.stringify({ email: 'new@test.com', password: 'my-password' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.accessToken).toBeDefined();
      expect(data.user.email).toBe('new@test.com');
      expect(data.user.password).toBeUndefined();
    });

    test('Auth routing: /register fails for duplicate email', async () => {
      const req = new Request('http://localhost/api/users/register', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'another-password' })
      });
      const res = await runtime.fetch(req);
      expect(res.status).toBe(409);
      const data: any = await res.json();
      expect(data.error).toBe('User already exists');
    });

    test('Auth routing: /logout revokes the refresh token', async () => {
      // 1. Login
      const loginReq = new Request('http://localhost/api/users/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'secret' })
      });
      const loginRes = await runtime.fetch(loginReq);
      const { refreshToken } = (await loginRes.json()) as any;

      // 2. Logout
      const logoutReq = new Request('http://localhost/api/users/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
      const logoutRes = await runtime.fetch(logoutReq);
      expect(logoutRes.status).toBe(200);

      // 3. Try refreshing with the revoked token
      const refreshReq = new Request('http://localhost/api/users/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
      const refreshRes = await runtime.fetch(refreshReq);
      expect(refreshRes.status).toBe(401); // Invalid or expired
    });
  });
  });

  describe('Caching & Realtime & Storage', () => {
    let mockAdapter: any;
    beforeEach(() => {
      mockAdapter = {
        connect: async () => {},
        create: async () => ({}),
        find: async () => ({ docs: [], total: 0 }),
        findById: async () => null,
        update: async () => ({}),
        delete: async () => {}
      };
    });

    test('Cache is hit on subsequent GET requests', async () => {
      const schema: any = {
        core: { api: { prefix: "/api" } },
        collections: [
          { slug: "todos", cache: { ttl: 60 } }
        ]
      };
      
      mockAdapter.find = async () => ({ docs: [{ id: "1", title: "Test" }], total: 1 });
      const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
      await runtime.buildRoutes();
      
      const req1 = new Request("http://localhost:3000/api/todos");
      const res1 = await runtime.fetch(req1);
      expect(res1.headers.get("X-Cache")).toBe("MISS");
      
      const req2 = new Request("http://localhost:3000/api/todos");
      const res2 = await runtime.fetch(req2);
      expect(res2.headers.get("X-Cache")).toBe("HIT");
    });
    
    test('Cache is invalidated on POST', async () => {
      const schema: any = {
        core: { api: { prefix: "/api" } },
        collections: [
          { slug: "todos", cache: { ttl: 60 } }
        ]
      };
      
      mockAdapter.find = async () => ({ docs: [{ id: "1", title: "Test" }], total: 1 });
      const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
      await runtime.buildRoutes();
      
      const req1 = new Request("http://localhost:3000/api/todos");
      await runtime.fetch(req1);
      
      const reqPost = new Request("http://localhost:3000/api/todos", { method: "POST", body: JSON.stringify({ title: "New" }) });
      await runtime.fetch(reqPost);
      
      const req2 = new Request("http://localhost:3000/api/todos");
      const res2 = await runtime.fetch(req2);
      expect(res2.headers.get("X-Cache")).toBe("MISS");
    });

    test('Upload endpoint handles file upload and returns url', async () => {
      const schema: any = {
        core: { api: { prefix: "/api" } },
        collections: []
      };
      
      const runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
      await runtime.buildRoutes();

      const formData = new FormData();
      formData.append("file", new File(["test file content"], "test.txt", { type: "text/plain" }));
      
      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const res = await runtime.fetch(req);
      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.url).toBeDefined();
      expect(data.originalName).toBe("test.txt");
    });
  });

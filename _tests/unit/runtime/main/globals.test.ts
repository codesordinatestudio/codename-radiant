import { describe, test, expect, beforeEach } from 'bun:test';
import { RadiantRuntime } from '../../../../runtime/bun/src/main/runtime';
import type { RadiantAdapter } from '../../../../runtime/bun/src/core';

describe('Global Configuration Router', () => {
  let runtime: RadiantRuntime;
  let mockAdapter: RadiantAdapter;
  let db: any = {};

  beforeEach(async () => {
    db = {}; // reset db
    
    mockAdapter = {
      adapterType: "mock",
      connect: async () => {},
      disconnect: async () => {},
      count: async () => 0,
      create: async (col: string, data: any) => {
        if (!db[col]) db[col] = [];
        db[col].push(data);
        return data;
      },
      find: async (col: string, q: any) => {
        const docs = db[col] || [];
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

    const schema: any = {
      core: { api: { prefix: '/api' } },
      collections: [],
      globals: [
        {
          slug: 'siteSettings',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'theme', type: 'text' }
          ]
        }
      ]
    };

    runtime = new RadiantRuntime(schema, { adapter: mockAdapter });
    await runtime.buildRoutes();
  });

  test('GET /api/globals/siteSettings returns empty object if not created yet', async () => {
    const req = new Request('http://localhost/api/globals/siteSettings');
    const res = await runtime.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({});
  });

  test('POST /api/globals/siteSettings creates the global with id=slug', async () => {
    const req = new Request('http://localhost/api/globals/siteSettings', {
      method: 'POST',
      body: JSON.stringify({ title: 'My Site', theme: 'dark' })
    });
    const res = await runtime.fetch(req);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    
    expect(data.id).toBe('siteSettings');
    expect(data.title).toBe('My Site');
    expect(data.theme).toBe('dark');

    // Confirm it's stored
    const stored = await mockAdapter.findById('radiant_globals', 'siteSettings');
    expect((stored as any).title).toBe('My Site');
  });

  test('POST /api/globals/siteSettings updates the existing global', async () => {
    // 1. Create first
    await runtime.fetch(new Request('http://localhost/api/globals/siteSettings', {
      method: 'POST',
      body: JSON.stringify({ title: 'My Site', theme: 'dark' })
    }));

    // 2. Update it
    const req = new Request('http://localhost/api/globals/siteSettings', {
      method: 'POST',
      body: JSON.stringify({ title: 'Updated Site', theme: 'light' })
    });
    const res = await runtime.fetch(req);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    
    expect(data.title).toBe('Updated Site');
    expect(data.theme).toBe('light');

    // Confirm stored in DB
    const stored = await mockAdapter.findById('radiant_globals', 'siteSettings');
    expect((stored as any).title).toBe('Updated Site');
  });
});

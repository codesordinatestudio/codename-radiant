import { test, expect, describe } from 'bun:test';
import { generateTypeScript } from '../../packages/cli/src/generator/ts';

describe('TypeScript Generator', () => {
  test('generates basic core models, omitting password', () => {
    const schema = {
      collections: [
        {
          slug: 'users',
          fields: [
            { name: 'name', type: 'string' },
            { name: 'email', type: 'email' },
            { name: 'password', type: 'password' },
            { name: 'age', type: 'number', optional: true },
          ]
        }
      ]
    };

    const output = generateTypeScript(schema);
    
    // Core Model check
    expect(output).toContain('export interface Users {');
    const modelBlock = output.match(/export interface Users \{([^}]*)\}/)?.[1] || '';
    expect(modelBlock).toContain('  id: string;');
    expect(modelBlock).toContain('  name: string;');
    expect(modelBlock).toContain('  email: string;');
    expect(modelBlock).not.toContain('password'); // Password omitted in model
    expect(modelBlock).toContain('  age?: number;'); // Optional field

    // Create Input check
    expect(output).toContain('export interface UsersCreate {');
    expect(output).toContain('  name: string;');
    expect(output).toContain('  email: string;');
    expect(output).toContain('  password: string;'); // Password required in Create
    expect(output).toContain('  age?: number;');
  });

  test('generates accurate TypeScript types for relationships (Belongs-To, Has-Many)', () => {
    const schema = {
      collections: [
        {
          slug: 'posts',
          fields: [
            { name: 'title', type: 'string' },
            { name: 'tags', type: 'string', isArray: true },
            { name: 'role', type: 'enum', values: ['admin', 'user'] },
            { name: 'author', type: 'link', target: 'users' }
          ]
        }
      ]
    };

    const output = generateTypeScript(schema);
    expect(output).toContain('export interface Posts {');
    expect(output).toContain('  tags: string[];');
    expect(output).toContain('  role: "admin" | "user";');
    expect(output).toContain('  author: string;'); // Links resolve to strings (IDs)
  });

  test('handles inline objects', () => {
    const schema = {
      collections: [
        {
          slug: 'events',
          fields: [
            {
              name: 'metadata',
              type: 'object',
              fields: [
                { name: 'ip', type: 'string' },
                { name: 'browser', type: 'string' }
              ]
            }
          ]
        }
      ]
    };

    const output = generateTypeScript(schema);
    expect(output).toContain('  metadata: { ip: string; browser: string; };');
  });

  test('generates proper Where clauses based on field types', () => {
    const schema = {
      collections: [
        {
          slug: 'products',
          fields: [
            { name: 'price', type: 'number' },
            { name: 'name', type: 'string' },
            { name: 'category', type: 'link' }
          ]
        }
      ]
    };

    const output = generateTypeScript(schema);
    expect(output).toContain('export interface ProductsWhereClause {');
    
    // Number type where clause
    expect(output).toContain('price?: { eq?: number; neq?: number; in?: Array<number>; nin?: Array<number>; exists?: boolean };');
    
    // String type where clause (includes 'like')
    expect(output).toContain('name?: { eq?: string; neq?: string; like?: string; in?: string[]; nin?: string[]; exists?: boolean };');
    
    // Link type where clause (no 'like', just id strings)
    expect(output).toContain('category?: { eq?: string; neq?: string; in?: string[]; nin?: string[]; exists?: boolean };');
    
    // Standard logical combinators
    expect(output).toContain('and?: ProductsWhereClause[];');
    expect(output).toContain('or?: ProductsWhereClause[];');
  });

  test('generates global framework registry', () => {
    const schema = {
      collections: [
        { slug: 'users', fields: [] },
        { slug: 'posts', fields: [] }
      ]
    };

    const output = generateTypeScript(schema);
    expect(output).toContain('export type Collections = {');
    expect(output).toContain('  users: Users;');
    expect(output).toContain('  posts: Posts;');
    expect(output).toContain('};');
  });
});

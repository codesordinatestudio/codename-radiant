import { test, expect, describe } from 'bun:test';
import { compile, SemanticError } from '../../packages/cli/src/compiler';
import { IToken } from 'chevrotain';

describe('Compiler', () => {
  const dummyToken: IToken = { image: 'dummy', startOffset: 0, endOffset: 0, startLine: 1, endLine: 1, startColumn: 1, endColumn: 1, tokenTypeIdx: 1 };

  function mockRawAst(blocks: any[]) {
    return { blocks, uri: 'file://test.radiant' };
  }

  test('validates correct config block successfully', () => {
    const ast = mockRawAst([{
      type: 'config',
      token: dummyToken,
      body: [
        { name: 'core', nameToken: dummyToken, value: { type: 'object', properties: [{ name: 'api', nameToken: dummyToken, value: true }] } },
        { name: 'security', nameToken: dummyToken, value: { type: 'object', properties: [{ name: 'auth', nameToken: dummyToken, value: { type: 'object', properties: [{ name: 'jwt', nameToken: dummyToken, value: true }] } }] } }
      ]
    }]);

    const { schema, errors } = compile([ast]);
    expect(errors.length).toBe(0);
    expect(schema.core.api).toBe(true);
    expect(schema.security.auth.jwt).toBe(true);
  });

  test('reports errors for unknown config properties', () => {
    const ast = mockRawAst([{
      type: 'config',
      token: dummyToken,
      body: [
        { name: 'invalidProp', nameToken: dummyToken, value: true },
        { name: 'core', nameToken: dummyToken, value: { type: 'object', properties: [{ name: 'invalidCore', nameToken: dummyToken, value: true }] } },
        { name: 'security', nameToken: dummyToken, value: { type: 'object', properties: [{ name: 'invalidSec', nameToken: dummyToken, value: true }] } }
      ]
    }]);

    const { errors } = compile([ast]);
    expect(errors.length).toBe(3);
    expect(errors[0].message).toContain("Unknown property 'invalidProp' in config block");
    expect(errors[1].message).toContain("Unknown property 'invalidCore' in core block");
    expect(errors[2].message).toContain("Unknown property 'invalidSec' in security block");
  });

  test('reports errors for unknown monitoring properties', () => {
    const ast = mockRawAst([{
      type: 'config',
      token: dummyToken,
      body: [
        { name: 'monitoring', nameToken: dummyToken, value: { type: 'object', properties: [{ name: 'invalidMon', nameToken: dummyToken, value: true }] } }
      ]
    }]);

    const { errors } = compile([ast]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Unknown property 'invalidMon' in monitoring block");
  });

  test('reports error for duplicate collection names', () => {
    const ast = mockRawAst([
      { type: 'collection', name: 'users', nameToken: dummyToken, body: [] },
      { type: 'collection', name: 'users', nameToken: dummyToken, body: [] }
    ]);

    const { errors } = compile([ast]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Duplicate collection name 'users' defined");
  });

  test('reports errors for unknown collection properties', () => {
    const ast = mockRawAst([
      { type: 'collection', name: 'users', nameToken: dummyToken, body: [{ name: 'invalidColProp', nameToken: dummyToken, value: true }] }
    ]);

    const { errors } = compile([ast]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Unknown property 'invalidColProp' in collection block");
  });

  test('compiles collection fields and decorators correctly', () => {
    const ast = mockRawAst([{
      type: 'collection', name: 'users', nameToken: dummyToken, body: [
        {
          name: 'fields', nameToken: dummyToken, value: {
            type: 'object', properties: [
              { name: 'email', value: { type: 'identifier', name: 'text' }, decorators: [{ name: 'unique' }, { name: 'optional' }] },
              { name: 'role', value: { type: 'function', name: 'select', args: ['admin', 'user'], token: dummyToken }, decorators: [{ name: 'default', args: ['user'] }] },
            ]
          }
        }
      ]
    }]);

    const { schema, errors } = compile([ast]);
    expect(errors.length).toBe(0);
    expect(schema.collections[0].fields.length).toBe(2);
    
    const emailField = schema.collections[0].fields[0];
    expect(emailField.name).toBe('email');
    expect(emailField.type).toBe('text');
    expect(emailField.unique).toBe(true);
    expect(emailField.optional).toBe(true);

    const roleField = schema.collections[0].fields[1];
    expect(roleField.name).toBe('role');
    expect(roleField.type).toBe('select');
    expect(roleField.options).toEqual(['admin', 'user']);
    expect(roleField.default).toBe('user');
  });

  test('reports error when defining a relationship to a non-existent collection', () => {
    const ast = mockRawAst([{
      type: 'collection', name: 'posts', nameToken: dummyToken, body: [
        {
          name: 'fields', nameToken: dummyToken, value: {
            type: 'object', properties: [
              { name: 'author', value: { type: 'function', name: 'relationship', args: ['users'], token: dummyToken } }
            ]
          }
        }
      ]
    }]);

    const { errors } = compile([ast]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("relates to a non-existent collection 'users'");
  });

  test('compiles relationship fields successfully (One-to-One, Has-Many)', () => {
    const ast = mockRawAst([
      { type: 'collection', name: 'users', nameToken: dummyToken, body: [] },
      { type: 'collection', name: 'posts', nameToken: dummyToken, body: [
        {
          name: 'fields', nameToken: dummyToken, value: {
            type: 'object', properties: [
              { name: 'author', value: { type: 'function', name: 'relationship', args: ['users'], token: dummyToken } }
            ]
          }
        }
      ]}
    ]);

    const { errors } = compile([ast]);
    expect(errors.length).toBe(0);
  });

  test('compiles env() manipulator successfully', () => {
    const ast = mockRawAst([{
      type: 'config',
      token: dummyToken,
      body: [
        {
          name: 'security', nameToken: dummyToken, value: {
            type: 'object', properties: [{
              name: 'auth', nameToken: dummyToken, value: {
                type: 'object', properties: [{
                  name: 'jwt', nameToken: dummyToken, value: {
                    type: 'object', properties: [{
                      name: 'accessTokenExpiry', nameToken: dummyToken, value: {
                        type: 'function', name: 'env', args: ['JWT_EXPIRY', '30m'], token: dummyToken
                      }
                    }]
                  }
                }]
              }
            }]
          }
        }
      ]
    }]);

    const { schema, errors } = compile([ast]);
    expect(errors.length).toBe(0);
    expect(schema.security.auth.jwt.accessTokenExpiry).toEqual({
      $env: 'JWT_EXPIRY',
      $default: '30m'
    });
  });

  test('reports error for env() manipulator with no arguments', () => {
    const ast = mockRawAst([{
      type: 'config',
      token: dummyToken,
      body: [
        {
          name: 'security', nameToken: dummyToken, value: {
            type: 'object', properties: [{
              name: 'auth', nameToken: dummyToken, value: {
                type: 'object', properties: [{
                  name: 'jwt', nameToken: dummyToken, value: {
                    type: 'object', properties: [{
                      name: 'accessTokenExpiry', nameToken: dummyToken, value: {
                        type: 'function', name: 'env', args: [], token: dummyToken
                      }
                    }]
                  }
                }]
              }
            }]
          }
        }
      ]
    }]);

    expect(() => compile([ast])).toThrow("env() manipulator requires at least one string argument");
  });

  test('reports errors for deeply malformed blocks instead of crashing', () => {
    const ast = mockRawAst([{
      type: 'config',
      token: dummyToken,
      body: [
        { name: 'security', nameToken: dummyToken, value: { type: 'identifier', name: 'true' } }
      ]
    }]);

    const { errors } = compile([ast]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("Expected an object block for 'security'");
  });

  test('reports errors for cross-file duplicate collections', () => {
    const ast1 = { uri: 'file1.radiant', blocks: [{ type: 'collection', name: 'users', nameToken: dummyToken, body: [] }] };
    const ast2 = { uri: 'file2.radiant', blocks: [{ type: 'collection', name: 'users', nameToken: dummyToken, body: [] }] };
    
    const { errors } = compile([ast1, ast2]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Duplicate collection name 'users'");
  });
});


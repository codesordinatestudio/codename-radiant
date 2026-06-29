import { test, expect, describe, beforeEach } from 'bun:test';
import { RadiantLexer } from '../../packages/cli/src/parser/lexer';
import { parserInstance } from '../../packages/cli/src/parser/parser';
import { visitorInstance } from '../../packages/cli/src/parser/visitor';

describe('Parser', () => {
  beforeEach(() => {
    parserInstance.errors = [];
  });

  function parseCode(code: string) {
    const lexResult = RadiantLexer.tokenize(code);
    expect(lexResult.errors.length).toBe(0);
    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.radiantFile();
    const errors = parserInstance.errors;
    const ast = errors.length === 0 ? visitorInstance.visit(cst) : null;
    return { cst, ast, errors };
  }

  test('parses a basic config block', () => {
    const code = `
      config {
        apiPrefix: "/api";
        enabled: true,
        timeout: 5000
      }
    `;
    const { ast, errors } = parseCode(code);
    expect(errors.length).toBe(0);
    expect(ast.blocks.length).toBe(1);
    expect(ast.blocks[0].type).toBe('config');
    
    const props = ast.blocks[0].body;
    expect(props.length).toBe(3);
    
    expect(props[0].name).toBe('apiPrefix');
    expect(props[0].value).toBe('/api');
    
    expect(props[1].name).toBe('enabled');
    expect(props[1].value).toBe(true);
    
    expect(props[2].name).toBe('timeout');
    expect(props[2].value).toBe(5000);
  });

  test('parses nested object literals inside config', () => {
    const code = `
      config {
        security: {
          auth: true;
          jwt: {
            expiresIn: "15m"
          }
        }
      }
    `;
    const { ast, errors } = parseCode(code);
    expect(errors.length).toBe(0);
    const securityProp = ast.blocks[0].body[0];
    expect(securityProp.name).toBe('security');
    expect(securityProp.value.type).toBe('object');
    expect(securityProp.value.properties[0].name).toBe('auth');
    expect(securityProp.value.properties[0].value).toBe(true);
    expect(securityProp.value.properties[1].name).toBe('jwt');
    expect(securityProp.value.properties[1].value.properties[0].name).toBe('expiresIn');
    expect(securityProp.value.properties[1].value.properties[0].value).toBe('15m');
  });

  test('parses collection blocks with fields and decorators', () => {
    const code = `
      collection users {
        auth: true;
        fields: {
          name: string;
          email: email @unique;
          role: ["admin", "user"] @default("user");
          age: int @min(18) @max(99);
        }
      }
    `;
    const { ast, errors } = parseCode(code);
    expect(errors.length).toBe(0);
    expect(ast.blocks[0].type).toBe('collection');
    expect(ast.blocks[0].name).toBe('users');
    
    const fieldsProp = ast.blocks[0].body.find((p: any) => p.name === 'fields');
    expect(fieldsProp.value.type).toBe('object');
    
    const fields = fieldsProp.value.properties;
    expect(fields.length).toBe(4);
    
    expect(fields[0].name).toBe('name');
    expect(fields[0].value.type).toBe('identifier');
    expect(fields[0].value.name).toBe('string');
    
    expect(fields[1].name).toBe('email');
    expect(fields[1].value.name).toBe('email');
    expect(fields[1].decorators.length).toBe(1);
    expect(fields[1].decorators[0].name).toBe('unique');
    
    expect(fields[2].name).toBe('role');
    expect(fields[2].value.type).toBe('array');
    expect(fields[2].value.elements).toEqual(['admin', 'user']);
    expect(fields[2].decorators[0].name).toBe('default');
    expect(fields[2].decorators[0].args).toEqual(['user']);
    
    expect(fields[3].decorators.length).toBe(2);
    expect(fields[3].decorators[0].name).toBe('min');
    expect(fields[3].decorators[0].args).toEqual([18]);
  });

  test('parses relationship fields (One-to-One, One-to-Many, Self-relations)', () => {
    const code = `
      collection posts {
        fields: {
          tags: string[];
          author: link("users");
          comments: link("comments")[];
        }
      }
    `;
    const { ast, errors } = parseCode(code);
    expect(errors.length).toBe(0);
    
    const fields = ast.blocks[0].body[0].value.properties;
    expect(fields[0].name).toBe('tags');
    expect(fields[0].isArray).toBe(true);
    expect(fields[0].value.name).toBe('string');
    
    expect(fields[1].name).toBe('author');
    expect(fields[1].isArray).toBe(false);
    expect(fields[1].value.type).toBe('function');
    expect(fields[1].value.name).toBe('link');
    expect(fields[1].value.args).toEqual(['users']);
    
    expect(fields[2].name).toBe('comments');
    expect(fields[2].isArray).toBe(true);
    expect(fields[2].value.type).toBe('function');
    expect(fields[2].value.name).toBe('link');
  });

  test('reports syntax errors for invalid structures', () => {
    const code = `
      config {
        apiPrefix: 
      }
    `;
    const lexResult = RadiantLexer.tokenize(code);
    parserInstance.input = lexResult.tokens;
    parserInstance.radiantFile();
    expect(parserInstance.errors.length).toBeGreaterThan(0);
    expect(parserInstance.errors[0].message).toContain('Expecting: one of these possible Token sequences');
  });

  test('reports syntax errors for unclosed blocks', () => {
    const code = `
      config {
        security: {
          auth: true
        // missing closing braces
    `;
    const lexResult = RadiantLexer.tokenize(code);
    parserInstance.input = lexResult.tokens;
    parserInstance.radiantFile();
    expect(parserInstance.errors.length).toBeGreaterThan(0);
  });
});

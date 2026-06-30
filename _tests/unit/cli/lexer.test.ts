import { test, expect, describe } from 'bun:test';
import { RadiantLexer, allTokens } from '../../../packages/cli/src/parser/lexer';

describe('Lexer', () => {
  test('tokenizes keywords correctly', () => {
    const code = `config collection fields true false`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBe(0);
    const tokens = result.tokens.map(t => t.image);
    expect(tokens).toEqual(['config', 'collection', 'fields', 'true', 'false']);
    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toEqual(['Config', 'Collection', 'Fields', 'True', 'False']);
  });

  test('tokenizes identifiers correctly', () => {
    const code = `users _privateRole myVariable123`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBe(0);
    expect(result.tokens.map(t => t.image)).toEqual(['users', '_privateRole', 'myVariable123']);
    expect(result.tokens.map(t => t.tokenType.name)).toEqual(['Identifier', 'Identifier', 'Identifier']);
  });

  test('tokenizes decorators correctly', () => {
    const code = `@unique @default @is_valid_123`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBe(0);
    expect(result.tokens.map(t => t.image)).toEqual(['@unique', '@default', '@is_valid_123']);
    expect(result.tokens.map(t => t.tokenType.name)).toEqual(['Decorator', 'Decorator', 'Decorator']);
  });

  test('tokenizes literals correctly', () => {
    const code = `"hello world" "string with \\"quotes\\"" 42 -3.14 0.5`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBe(0);
    expect(result.tokens.map(t => t.image)).toEqual(['"hello world"', '"string with \\"quotes\\""', '42', '-3.14', '0.5']);
    expect(result.tokens.map(t => t.tokenType.name)).toEqual(['StringLiteral', 'StringLiteral', 'NumberLiteral', 'NumberLiteral', 'NumberLiteral']);
  });

  test('tokenizes punctuation correctly', () => {
    const code = `{ } [ ] ( ) : , ;`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBe(0);
    expect(result.tokens.map(t => t.tokenType.name)).toEqual([
      'LCurly', 'RCurly', 'LSquare', 'RSquare', 'LParen', 'RParen', 'Colon', 'Comma', 'SemiColon'
    ]);
  });

  test('skips whitespace and comments', () => {
    const code = `
      // This is a comment
      config {
        // Another comment
        auth: true;
      }
    `;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBe(0);
    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toEqual(['Config', 'LCurly', 'Identifier', 'Colon', 'True', 'SemiColon', 'RCurly']);
  });

  test('reports errors for invalid tokens', () => {
    const code = `config $invalidToken`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("unexpected character");
  });

  test('recovers or errors gracefully on unterminated strings', () => {
    const code = `config { name: "unterminated string }`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('handles zero-width spaces and garbage gracefully without crashing', () => {
    const code = `config \u200B { \u0000 garbage \uFFFF }`;
    const result = RadiantLexer.tokenize(code);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

import { describe, test, expect } from 'bun:test';
import { RadiantLexer } from '../src/parser/lexer';
import { parserInstance } from '../src/parser/parser';
import { visitorInstance } from '../src/parser/visitor';
import { compile } from '../src/compiler';

describe('CLI Globals Compiler', () => {
  test('Parses and compiles a global block', () => {
    const code = `
      global Settings {
        fields: {
          title: text @default("My App"),
          theme: select("light", "dark")
        }
      }
    `;

    const lexResult = RadiantLexer.tokenize(code);
    expect(lexResult.errors.length).toBe(0);

    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.radiantFile();
    expect(parserInstance.errors.length).toBe(0);

    const ast = visitorInstance.visit(cst);
    ast.uri = "test.radiant";

    const { schema, errors } = compile([ast]);
    expect(errors.length).toBe(0);
    expect(schema.globals.length).toBe(1);
    
    const settings = schema.globals[0];
    expect(settings.slug).toBe('Settings');
    expect(settings.fields.length).toBe(2);
    expect(settings.fields[0].name).toBe('title');
    expect(settings.fields[0].type).toBe('text');
  });

  test('Validates global fields', () => {
    const code = `
      global Site {
        fields: {
          invalidField: nonexistentType
        }
      }
    `;

    const lexResult = RadiantLexer.tokenize(code);
    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.radiantFile();
    const ast = visitorInstance.visit(cst);
    
    const { errors } = compile([ast]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Unknown field type 'nonexistentType'");
  });
});

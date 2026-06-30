import { test, expect } from 'bun:test';
import { RadiantLexer } from '../../../packages/cli/src/parser/lexer';
import { parserInstance } from '../../../packages/cli/src/parser/parser';
import { visitorInstance } from '../../../packages/cli/src/parser/visitor';
import { compile } from '../../../packages/cli/src/compiler';

test('parses a basic radiant schema', () => {
  const code = `
    config {
      apiPrefix: "/api"
    }

    collection users {
      auth: true;
      fields: {
        name: text;
        email: email @unique;
        role: ["admin", "user"] @default("user");
        posts: relationship("posts")[];
      }
    }
    
    collection posts {
      fields: {
        title: text;
        author: relationship("users");
      }
    }
  `;

  const lexResult = RadiantLexer.tokenize(code);
  expect(lexResult.errors.length).toBe(0);

  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.radiantFile();
  if (parserInstance.errors.length > 0) {
    console.log(parserInstance.errors);
  }
  expect(parserInstance.errors.length).toBe(0);

  const rawAst = visitorInstance.visit(cst);
  expect(rawAst.blocks.length).toBe(3); // 1 config, 2 collections

  const { schema: finalSchema, errors } = compile([rawAst]);
  expect(errors.length).toBe(0);
  
  // Snapshot test to catch any overall structural changes to the AST
  expect(finalSchema).toMatchSnapshot();
  
  expect(finalSchema.apiPrefix).toBe("/api");
  expect(finalSchema.collections.length).toBe(2);
  
  const usersCol = finalSchema.collections[0];
  expect(usersCol.slug).toBe("users");
  expect(usersCol.auth).toBe(true);
  expect(usersCol.fields.length).toBe(4);
  
  const emailField = usersCol.fields[1];
  expect(emailField.name).toBe("email");
  expect(emailField.type).toBe("email");
  expect(emailField.unique).toBe(true);
  
  const roleField = usersCol.fields[2];
  expect(roleField.name).toBe("role");
  expect(roleField.type).toBe("enum");
  expect(roleField.values).toEqual(["admin", "user"]);
  expect(roleField.default).toBe("user");
  
  const postsField = usersCol.fields[3];
  expect(postsField.name).toBe("posts");
  expect(postsField.type).toBe("relationship");
  expect(postsField.target).toBe("posts");
  expect(postsField.isArray).toBe(true);
});

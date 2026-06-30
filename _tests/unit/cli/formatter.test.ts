import { test, expect, describe } from 'bun:test';
import { formatRadiant } from '../../../packages/cli/src/lsp/formatter';

describe('Formatter', () => {
  test('formats empty or blank files safely', () => {
    expect(formatRadiant('')).toBe('\n');
    expect(formatRadiant('   \n  \n')).toBe('\n');
  });

  test('formats basic block indentation', () => {
    const raw = `config{
apiPrefix: "/api"
}`;
    const expected = `config {
  apiPrefix: "/api"
}
`;
    expect(formatRadiant(raw)).toBe(expected);
  });

  test('formats nested block indentation properly', () => {
    const raw = `collection users {
auth: true;
fields: {
name: string;
}
}`;
    const expected = `collection users {
  auth: true;
  fields: {
    name: string;
  }
}
`;
    expect(formatRadiant(raw)).toBe(expected);
  });

  test('handles inline opening brace and trailing semicolons/commas', () => {
    // The formatter handles closing braces with or without semicolons.
    const raw = `config {
security: {
auth: {
jwt: true
};
cors: true,
}
}`;
    const expected = `config {
  security: {
    auth: {
      jwt: true
    }
    cors: true
  }
}
`;
    expect(formatRadiant(raw)).toBe(expected);
  });
});

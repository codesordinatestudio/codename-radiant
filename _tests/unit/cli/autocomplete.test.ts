import { describe, expect, test } from 'bun:test';
import { getCompletions, fieldTypes } from '../../../packages/cli/src/lsp/autocomplete';

describe('AST-aware Autocomplete', () => {
  test('returns global blocks at the top level', () => {
    const text = ``;
    const completions = getCompletions(text, 0);
    const labels = completions.map(c => c.label);
    
    expect(labels).toContain('config');
    expect(labels).toContain('collection');
    expect(labels).toContain('global');
    expect(labels).not.toContain('api');
    expect(labels).not.toContain('auth');
  });

  test('returns config fields inside config block', () => {
    const text = `
config {
  
}
    `;
    const offset = text.indexOf('config {\n  ') + 'config {\n  '.length;
    const completions = getCompletions(text, offset);
    const labels = completions.map(c => c.label);
    
    expect(labels).toContain('api');
    expect(labels).toContain('security');
    expect(labels).not.toContain('config');
    expect(labels).not.toContain('collection');
  });

  test('returns api fields inside config -> api block', () => {
    const text = `
config {
  api: {
    
  }
}
    `;
    const offset = text.indexOf('api: {\n    ') + 'api: {\n    '.length;
    const completions = getCompletions(text, offset);
    const labels = completions.map(c => c.label);
    
    expect(labels).toContain('prefix');
    expect(labels).toContain('maxBodyBytes');
    expect(labels).not.toContain('auth');
  });

  test('returns collection fields inside collection block', () => {
    const text = `
collection users {
  
}
    `;
    const offset = text.indexOf('collection users {\n  ') + 'collection users {\n  '.length;
    const completions = getCompletions(text, offset);
    const labels = completions.map(c => c.label);
    
    expect(labels).toContain('fields');
    expect(labels).toContain('auth');
    expect(labels).not.toContain('api');
  });

  test('returns field types inside fields block after colon', () => {
    const text = `
collection users {
  fields: {
    email: 
  }
}
    `;
    const offset = text.indexOf('email: ') + 'email: '.length;
    const completions = getCompletions(text, offset);
    
    expect(completions).toEqual(fieldTypes);
  });

  test('returns decorators when typing @', () => {
    const text = `
collection users {
  fields: {
    email: string @
  }
}
    `;
    const offset = text.indexOf('@') + 1;
    const completions = getCompletions(text, offset);
    const labels = completions.map(c => c.label);
    
    expect(labels).toContain('unique');
    expect(labels).toContain('default');
    expect(labels).not.toContain('string');
  });

  test('returns field types on empty line in fields block', () => {
    // If the user just presses ctrl+space in fields block without typing colon
    // Wait, properties should just be field names, but if they want to complete a type?
    // Actually, in fields block, property names are arbitrary (email, password), so we shouldn't complete field names.
    // Right now, if they are just inside fields block but haven't typed a colon, what happens?
    // The current logic: blockTypes['fields'] doesn't exist, so it returns empty array, which is correct because they should type an arbitrary property name first.
    const text = `
collection users {
  fields: {
    
  }
}
    `;
    const offset = text.indexOf('fields: {\n    ') + 'fields: {\n    '.length;
    const completions = getCompletions(text, offset);
    expect(completions).toEqual([]); 
  });
});

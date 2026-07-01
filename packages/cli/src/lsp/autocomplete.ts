import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { RadiantLexer } from '../parser/lexer';
import { parserInstance } from '../parser/parser';

export const fieldTypes: CompletionItem[] = [
  { label: 'array', kind: CompletionItemKind.Property, detail: 'Array field', documentation: 'Stored as JSONB' },
  { label: 'boolean', kind: CompletionItemKind.Property, detail: 'Boolean field', documentation: 'Stored as BOOLEAN' },
  { label: 'date', kind: CompletionItemKind.Property, detail: 'Date field', documentation: 'Stored as TIMESTAMPTZ' },
  { label: 'email', kind: CompletionItemKind.Property, detail: 'Email field', documentation: 'Stored as TEXT' },
  { label: 'integer', kind: CompletionItemKind.Property, detail: 'Integer field', documentation: 'Stored as INTEGER' },
  { label: 'json', kind: CompletionItemKind.Property, detail: 'JSON field', documentation: 'Stored as JSONB' },
  { label: 'multiselect', kind: CompletionItemKind.Property, detail: 'Multi-select field', documentation: 'Stored as TEXT[]' },
  { label: 'number', kind: CompletionItemKind.Property, detail: 'Number field', documentation: 'Stored as NUMERIC' },
  { label: 'password', kind: CompletionItemKind.Property, detail: 'Password field', documentation: 'Stored as TEXT (hashed)' },
  { label: 'relationship', kind: CompletionItemKind.Property, detail: 'Relationship field', documentation: 'Stored as UUID (Foreign Key)' },
  { label: 'richtext', kind: CompletionItemKind.Property, detail: 'Rich text field', documentation: 'Stored as JSONB' },
  { label: 'select', kind: CompletionItemKind.Property, detail: 'Select field', documentation: 'Stored as TEXT' },
  { label: 'text', kind: CompletionItemKind.Property, detail: 'Text field', documentation: 'Stored as TEXT' },
  { label: 'textarea', kind: CompletionItemKind.Property, detail: 'Long text field', documentation: 'Stored as TEXT' },
  { label: 'upload', kind: CompletionItemKind.Property, detail: 'Upload field', documentation: 'Stored as JSONB' },
  { label: 'env', kind: CompletionItemKind.Function, detail: 'Environment variable (e.g. env("JWT_EXPIRY", "15m"))', documentation: 'Resolve value from environment at runtime' }
];

const blockTypes = {
  global: [
    { label: 'config', kind: CompletionItemKind.Property, detail: 'Global configuration block', documentation: 'Root level block for configuration' },
    { label: 'collection', kind: CompletionItemKind.Property, detail: 'Define a database collection', documentation: 'Root level block for defining a collection' },
    { label: 'global', kind: CompletionItemKind.Property, detail: 'Define a singleton document', documentation: 'Root level block for defining a global document' },
  ],
  config: [
    { label: 'api', kind: CompletionItemKind.Property, detail: 'API settings' },
    { label: 'adminUI', kind: CompletionItemKind.Property, detail: 'Admin UI configuration' },
    { label: 'security', kind: CompletionItemKind.Property, detail: 'Security policies and settings' },
    { label: 'monitoring', kind: CompletionItemKind.Property, detail: 'Monitoring and health checks' },
    { label: 'output', kind: CompletionItemKind.Property, detail: 'Output directory' },
  ],
  collection: [
    { label: 'fields', kind: CompletionItemKind.Property, detail: 'Define database schema fields' },
    { label: 'auth', kind: CompletionItemKind.Property, detail: 'Authentication settings' },
    { label: 'admin', kind: CompletionItemKind.Property, detail: 'Admin UI settings for collection' },
    { label: 'timestamps', kind: CompletionItemKind.Property, detail: 'Enable timestamps (createdAt, updatedAt)' },
  ],
  api: [
    { label: 'prefix', kind: CompletionItemKind.Property, detail: 'Set the global API prefix (e.g. "/api")' },
    { label: 'maxBodyBytes', kind: CompletionItemKind.Property, detail: 'Max request body size' },
    { label: 'trustedProxies', kind: CompletionItemKind.Property, detail: 'List of trusted proxies' },
  ],
  security: [
    { label: 'auth', kind: CompletionItemKind.Property, detail: 'Authentication settings' },
    { label: 'cors', kind: CompletionItemKind.Property, detail: 'CORS settings' },
    { label: 'rateLimit', kind: CompletionItemKind.Property, detail: 'Rate limiting rules' },
    { label: 'headers', kind: CompletionItemKind.Property, detail: 'Security headers configuration' },
    { label: 'secrets', kind: CompletionItemKind.Property, detail: 'Secret management configuration' },
    { label: 'audit', kind: CompletionItemKind.Property, detail: 'Audit logging configuration' },
  ],
  auth: [
    { label: 'strategies', kind: CompletionItemKind.Property, detail: 'Set authentication strategies (e.g. ["jwt", "session"])' },
    { label: 'jwt', kind: CompletionItemKind.Property, detail: 'JWT specific settings' },
    { label: 'passwordPolicy', kind: CompletionItemKind.Property, detail: 'Password validation rules' },
    { label: 'lockout', kind: CompletionItemKind.Property, detail: 'Account lockout settings' },
  ],
  jwt: [
    { label: 'accessTokenExpiry', kind: CompletionItemKind.Property, detail: 'e.g. "15m"' },
    { label: 'refreshTokenExpiry', kind: CompletionItemKind.Property, detail: 'e.g. "7d"' },
    { label: 'cookies', kind: CompletionItemKind.Property, detail: 'Cookie settings' },
  ],
  cors: [
    { label: 'origin', kind: CompletionItemKind.Property, detail: 'Allowed origins' },
    { label: 'credentials', kind: CompletionItemKind.Property, detail: 'Allow credentials' },
  ],
  rateLimit: [
    { label: 'write', kind: CompletionItemKind.Property, detail: 'Rate limit for writes' },
    { label: 'login', kind: CompletionItemKind.Property, detail: 'Rate limit for logins' },
    { label: 'max', kind: CompletionItemKind.Property, detail: 'Max requests' },
    { label: 'window', kind: CompletionItemKind.Property, detail: 'Time window (e.g. "15m")' },
  ],
  passwordPolicy: [
    { label: 'minLength', kind: CompletionItemKind.Property, detail: 'Minimum password length' },
    { label: 'requireUppercase', kind: CompletionItemKind.Property, detail: 'Require uppercase letter' },
    { label: 'requireNumber', kind: CompletionItemKind.Property, detail: 'Require number' },
  ],
  lockout: [
    { label: 'maxAttempts', kind: CompletionItemKind.Property, detail: 'Max failed logins' },
    { label: 'durationMinutes', kind: CompletionItemKind.Property, detail: 'Lockout duration' },
  ],
  monitoring: [
    { label: 'healthCheck', kind: CompletionItemKind.Property, detail: 'Health check endpoint' },
    { label: 'requestId', kind: CompletionItemKind.Property, detail: 'Request ID tracking' },
  ],
  healthCheck: [
    { label: 'path', kind: CompletionItemKind.Property, detail: 'Health check path (e.g. "/health")' },
    { label: 'requiresAuth', kind: CompletionItemKind.Property, detail: 'Does health check require auth' },
  ],
  adminUI: [
    { label: 'user', kind: CompletionItemKind.Property, detail: 'The collection used for admin users' },
  ],
};

const decorators: CompletionItem[] = [
  { label: 'unique', kind: CompletionItemKind.Property, detail: 'Ensure field is unique', documentation: 'Create a unique constraint in the DB' },
  { label: 'optional', kind: CompletionItemKind.Property, detail: 'Mark field as optional', documentation: 'Allow null values' },
  { label: 'default', kind: CompletionItemKind.Function, detail: 'Set a default value', documentation: 'e.g. @default("user")' },
  { label: 'hidden', kind: CompletionItemKind.Property, detail: 'Hide field', documentation: 'Hide from API responses' },
  { label: 'index', kind: CompletionItemKind.Property, detail: 'Add database index', documentation: 'Improve query performance' }
];

export function getCompletions(text: string, offset: number): CompletionItem[] {
  const textBefore = text.substring(0, offset);
  const currentLine = textBefore.substring(textBefore.lastIndexOf('\n') + 1);
  const tokensSplit = currentLine.trim().split(/\s+/);
  const currentTokenStr = tokensSplit[tokensSplit.length - 1];

  if (currentTokenStr?.startsWith('@') || textBefore.endsWith('@')) {
    return decorators;
  }

  const lexResult = RadiantLexer.tokenize(text);
  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.radiantFile();

  let lastToken = null;
  for (let i = lexResult.tokens.length - 1; i >= 0; i--) {
    const t = lexResult.tokens[i];
    if (t.startOffset < offset) {
      lastToken = t;
      break;
    }
  }

  if (!lastToken) {
    return blockTypes.global; 
  }

  const path = findNodePathContainingToken(cst, lastToken);
  
  const properties = path.filter(p => p.type === 'property').map(p => p.name);
  const innermostProperty = properties[properties.length - 1];
  
  const inCollection = path.some(p => p.type === 'collectionBlock');
  const inConfig = path.some(p => p.type === 'configBlock');
  
  // If we are inside the `fields` block of a collection
  if (inCollection && properties.includes('fields')) {
     if (innermostProperty !== 'fields') {
         // We are defining a specific field (e.g., email: )
         return fieldTypes;
     }
  }

  if (properties.length > 0) {
    if (innermostProperty && blockTypes[innermostProperty as keyof typeof blockTypes]) {
      return blockTypes[innermostProperty as keyof typeof blockTypes] || [];
    }
    return []; // We are inside a block with arbitrary keys or a value
  }

  if (inCollection) return blockTypes.collection;
  if (inConfig) return blockTypes.config;

  return blockTypes.global;
}

function findNodePathContainingToken(node: any, token: any, path: {type: string, name?: string}[] = []): {type: string, name?: string}[] {
  let currentPath = [...path];
  
  if (node.name === 'property') {
    let propName = undefined;
    if (node.children?.propertyName?.[0]?.children) {
      const keys = Object.keys(node.children.propertyName[0].children);
      if (keys.length > 0) {
         propName = node.children.propertyName[0].children[keys[0]][0].image;
      }
    }
    currentPath.push({ type: 'property', name: propName });
  } else if (node.name) {
    currentPath.push({ type: node.name });
  }

  if (node.children) {
    for (const key in node.children) {
      const elements = node.children[key];
      for (const el of elements) {
        if (el.name) {
          if (el.location && el.location.startOffset <= token.startOffset && el.location.endOffset >= token.endOffset) {
            return findNodePathContainingToken(el, token, currentPath);
          }
        } else if (el.image !== undefined) {
          if (el.startOffset === token.startOffset) {
            return currentPath;
          }
        }
      }
    }
  }
  return currentPath;
}

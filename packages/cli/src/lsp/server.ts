import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { URI } from 'vscode-uri';

import { RadiantLexer } from '../parser/lexer';
import { parserInstance } from '../parser/parser';
import { visitorInstance } from '../parser/visitor';
import { compile, SemanticError } from '../compiler';
import { formatRadiant } from './formatter';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true,
      
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '\n', '@', ':']
      }
    }
  };
});

let workspaceRoot: string | null = null;
connection.onInitialize((params: InitializeParams) => {
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceRoot = URI.parse(params.workspaceFolders[0].uri).fsPath;
  }
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true,
      
      
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '\n', '@', ':']
      }
    }
  };
});

function findRadiantFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findRadiantFiles(filePath));
      } else if (filePath.endsWith('.radiant')) {
        results.push(filePath);
      }
    }
  } catch (err) { }
  return results;
}

documents.onDidChangeContent(change => {
  // When ANY open file changes, re-validate ALL open files 
  // so that cross-file squiggly lines update instantly everywhere.
  documents.all().forEach(doc => {
    validateTextDocument(doc);
  });
});

documents.onDidClose(e => {
  // Clear diagnostics for the closed file
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  // Re-validate remaining files in case a conflict was resolved by closing/deleting this file
  documents.all().forEach(doc => {
    validateTextDocument(doc);
  });
});

function validateTextDocument(textDocument: TextDocument): void {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  // 1. Lexing
  const lexResult = RadiantLexer.tokenize(text);
  
  for (const err of lexResult.errors) {
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(err.offset),
        end: textDocument.positionAt(err.offset + err.length)
      },
      message: err.message,
      source: 'radiant'
    };
    diagnostics.push(diagnostic);
  }

  // 2. Parsing (only if lexer didn't catastrophically fail)
  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.radiantFile();

  let hasParseErrors = false;
  for (const err of parserInstance.errors) {
    hasParseErrors = true;
    const token = err.token;
    let startOffset = 0;
    let endOffset = 1;
    
    if (token && !isNaN(token.startOffset)) {
      startOffset = token.startOffset;
      endOffset = token.endOffset !== undefined ? token.endOffset + 1 : startOffset + 1;
    }

    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(startOffset),
        end: textDocument.positionAt(endOffset)
      },
      message: err.message,
      source: 'radiant'
    });
  }

  // 3. Semantic Validation (only if it parsed successfully enough)
  if (!hasParseErrors) {
    const rawAsts: any[] = [];
    
    const workspaceAsts: any[] = [];
    
    // Scan other files in workspace to get cross-file context FIRST
    if (workspaceRoot) {
      const allFiles = findRadiantFiles(workspaceRoot); // fallback to scanning entire root to find everything
      
      for (const file of allFiles) {
        // skip the file currently open in editor (we already have its AST from memory)
        const fileUri = URI.file(file).toString();
        if (fileUri === textDocument.uri) continue;
        
        try {
          let text: string;
          const openDoc = documents.get(fileUri);
          if (openDoc) {
             text = openDoc.getText();
          } else {
             text = readFileSync(file, 'utf-8');
          }
          
          const lex = RadiantLexer.tokenize(text);
          if (lex.errors.length > 0) continue;
          
          parserInstance.input = lex.tokens;
          const fileCst = parserInstance.radiantFile();
          if (parserInstance.errors.length > 0) continue;
          
          const fileAst = visitorInstance.visit(fileCst);
          fileAst.uri = fileUri;
          workspaceAsts.push(fileAst);
        } catch (e) {
          // Ignore files that are broken on disk
        }
      }
    }

    rawAsts.push(...workspaceAsts);

    // Push the currently edited AST LAST so its duplicates conflict with the workspace!
    const activeAst = visitorInstance.visit(cst);
    activeAst.uri = textDocument.uri;
    rawAsts.push(activeAst);

    try {
      const { errors } = compile(rawAsts);
      
      for (const err of errors) {
        const token = err.token;
        if (token) {
           // Only show semantic errors for the CURRENT file in the editor
           if (err.uri === textDocument.uri) {
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: textDocument.positionAt(token.startOffset),
                  end: textDocument.positionAt((token.endOffset || token.startOffset) + 1)
                },
                message: err.message,
                source: 'radiant'
              });
           }
        }
      }
    } catch (e) {
      // Catch fatal compiler crashes
    }
  }

  // Send the computed diagnostics to VS Code.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const textBefore = text.substring(0, offset);
  const currentLine = textBefore.substring(textBefore.lastIndexOf('\n') + 1);

  const fieldTypes = [
    { label: 'array', kind: 14, detail: 'Array field', documentation: 'Stored as JSONB' },
    { label: 'boolean', kind: 14, detail: 'Boolean field', documentation: 'Stored as BOOLEAN' },
    { label: 'date', kind: 14, detail: 'Date field', documentation: 'Stored as TIMESTAMPTZ' },
    { label: 'email', kind: 14, detail: 'Email field', documentation: 'Stored as TEXT' },
    { label: 'integer', kind: 14, detail: 'Integer field', documentation: 'Stored as INTEGER' },
    { label: 'json', kind: 14, detail: 'JSON field', documentation: 'Stored as JSONB' },
    { label: 'multiselect', kind: 14, detail: 'Multi-select field', documentation: 'Stored as TEXT[]' },
    { label: 'number', kind: 14, detail: 'Number field', documentation: 'Stored as NUMERIC' },
    { label: 'password', kind: 14, detail: 'Password field', documentation: 'Stored as TEXT (hashed)' },
    { label: 'relationship', kind: 14, detail: 'Relationship field', documentation: 'Stored as UUID (Foreign Key)' },
    { label: 'richtext', kind: 14, detail: 'Rich text field', documentation: 'Stored as JSONB' },
    { label: 'select', kind: 14, detail: 'Select field', documentation: 'Stored as TEXT' },
    { label: 'text', kind: 14, detail: 'Text field', documentation: 'Stored as TEXT' },
    { label: 'textarea', kind: 14, detail: 'Long text field', documentation: 'Stored as TEXT' },
    { label: 'upload', kind: 14, detail: 'Upload field', documentation: 'Stored as JSONB' },
    { label: 'env', kind: 3, detail: 'Environment variable (e.g. env("JWT_EXPIRY", "15m"))', documentation: 'Resolve value from environment at runtime' }
  ];

  const structuralTypes = [
    { label: 'config', kind: 14, detail: 'Global configuration block', documentation: 'Root level block for configuration' },
    { label: 'output', kind: 14, detail: 'Output directory', documentation: 'Where to put generated files (e.g. "../src")' },
    { label: 'globals', kind: 14, detail: 'Define a singleton document', documentation: 'Root level block for defining a global document' },
    { label: 'collection', kind: 14, detail: 'Define a database collection', documentation: 'Root level block for defining a collection' },
    { label: 'core', kind: 14, detail: 'Core framework settings', documentation: 'Allowed in config {}' },
    { label: 'api', kind: 14, detail: 'API settings', documentation: 'Allowed in core {}' },
    { label: 'prefix', kind: 14, detail: 'Set the global API prefix (e.g. "/api")', documentation: 'Allowed in api {}' },
    { label: 'maxBodyBytes', kind: 14, detail: 'Max request body size', documentation: 'Allowed in api {}' },
    { label: 'trustedProxies', kind: 14, detail: 'List of trusted proxies', documentation: 'Allowed in api {}' },
    
    { label: 'adminUI', kind: 14, detail: 'Admin UI configuration', documentation: 'Allowed in config {}' },
    { label: 'enabled', kind: 14, detail: 'Enable or disable a feature', documentation: 'Used in many blocks' },
    { label: 'user', kind: 14, detail: 'The collection used for admin users', documentation: 'Allowed in adminUI {}' },
    
    { label: 'security', kind: 14, detail: 'Security policies and settings', documentation: 'Allowed in config {}' },
    { label: 'auth', kind: 14, detail: 'Authentication settings', documentation: 'Allowed in collection {} or security {}' },
    { label: 'strategies', kind: 14, detail: 'Set authentication strategies (e.g. ["jwt", "session"])', documentation: 'Allowed in auth {}' },
    { label: 'jwt', kind: 14, detail: 'JWT specific settings', documentation: 'Allowed in auth {}' },
    { label: 'accessTokenExpiry', kind: 14, detail: 'e.g. "15m"', documentation: 'Allowed in jwt {}' },
    { label: 'refreshTokenExpiry', kind: 14, detail: 'e.g. "7d"', documentation: 'Allowed in jwt {}' },
    { label: 'cookies', kind: 14, detail: 'Cookie settings', documentation: 'Allowed in jwt {}' },
    { label: 'passwordPolicy', kind: 14, detail: 'Password validation rules', documentation: 'Allowed in auth {}' },
    { label: 'minLength', kind: 14, detail: 'Minimum password length', documentation: 'Allowed in passwordPolicy {}' },
    { label: 'requireUppercase', kind: 14, detail: 'Require uppercase letter', documentation: 'Allowed in passwordPolicy {}' },
    { label: 'requireNumber', kind: 14, detail: 'Require number', documentation: 'Allowed in passwordPolicy {}' },
    { label: 'lockout', kind: 14, detail: 'Account lockout settings', documentation: 'Allowed in auth {}' },
    { label: 'maxAttempts', kind: 14, detail: 'Max failed logins', documentation: 'Allowed in lockout {}' },
    { label: 'durationMinutes', kind: 14, detail: 'Lockout duration', documentation: 'Allowed in lockout {}' },
    
    { label: 'cors', kind: 14, detail: 'CORS settings', documentation: 'Allowed in security {}' },
    { label: 'origin', kind: 14, detail: 'Allowed origins', documentation: 'Allowed in cors {}' },
    { label: 'credentials', kind: 14, detail: 'Allow credentials', documentation: 'Allowed in cors {}' },
    
    { label: 'rateLimit', kind: 14, detail: 'Rate limiting rules', documentation: 'Allowed in security {}' },
    { label: 'write', kind: 14, detail: 'Rate limit for writes', documentation: 'Allowed in rateLimit {}' },
    { label: 'login', kind: 14, detail: 'Rate limit for logins', documentation: 'Allowed in rateLimit {}' },
    { label: 'max', kind: 14, detail: 'Max requests', documentation: 'Allowed in rateLimit {}' },
    { label: 'window', kind: 14, detail: 'Time window (e.g. "15m")', documentation: 'Allowed in rateLimit {}' },
    
    { label: 'headers', kind: 14, detail: 'Security headers configuration', documentation: 'Allowed in security {}' },
    { label: 'secrets', kind: 14, detail: 'Secret management configuration', documentation: 'Allowed in security {}' },
    { label: 'audit', kind: 14, detail: 'Audit logging configuration', documentation: 'Allowed in security {}' },

    { label: 'monitoring', kind: 14, detail: 'Monitoring and health checks', documentation: 'Allowed in config {}' },
    { label: 'healthCheck', kind: 14, detail: 'Health check endpoint', documentation: 'Allowed in monitoring {}' },
    { label: 'path', kind: 14, detail: 'Health check path (e.g. "/health")', documentation: 'Allowed in healthCheck {}' },
    { label: 'requiresAuth', kind: 14, detail: 'Does health check require auth', documentation: 'Allowed in healthCheck {}' },
    { label: 'requestId', kind: 14, detail: 'Request ID tracking', documentation: 'Allowed in monitoring {}' },
    
    { label: 'fields', kind: 14, detail: 'Define database schema fields', documentation: 'Allowed in collection {}' },
  ];

  const tokens = currentLine.trim().split(/\s+/);
  const currentToken = tokens[tokens.length - 1];

  if (currentToken.startsWith('@') || textBefore.endsWith('@')) {
    return [
      { label: 'unique', kind: 14, detail: 'Ensure field is unique', documentation: 'Create a unique constraint in the DB' },
      { label: 'optional', kind: 14, detail: 'Mark field as optional', documentation: 'Allow null values' },
      { label: 'default', kind: 3, detail: 'Set a default value', documentation: 'e.g. @default("user")' },
      { label: 'hidden', kind: 14, detail: 'Hide field', documentation: 'Hide from API responses' },
      { label: 'index', kind: 14, detail: 'Add database index', documentation: 'Improve query performance' }
    ];
  }

  if (currentLine.includes(':')) {
    return fieldTypes;
  }

  return structuralTypes;
});

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const formattedText = formatRadiant(document.getText());
  return [
    {
      range: {
        start: document.positionAt(0),
        end: document.positionAt(document.getText().length)
      },
      newText: formattedText
    }
  ];
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
